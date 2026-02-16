import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { GoogleMailbox } from './google.model';

type OAuthStatePayload = {
  userId: string;
  nonce: string;
};

type SendEmailInput = {
  userId: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  threadId?: string;
};

type ListInboxInput = {
  userId: string;
  maxResults: number;
  pageToken?: string;
  q?: string;
};

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const OAUTH_STATE_EXPIRY = '10m';

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const getStateSecret = () => process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_TOKEN_SECRET || 'cliento_google_oauth_state_secret';

const getEncryptionKey = () => {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  const isHex = /^[0-9a-fA-F]+$/.test(raw);
  if (!isHex || raw.length !== 64) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }

  return Buffer.from(raw, 'hex');
};

const encryptToken = (token?: string | null) => {
  if (!token) return '';
  const key = getEncryptionKey();
  if (!key) return token;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
};

const decryptToken = (stored?: string | null) => {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is required to decrypt stored Google tokens');
  }

  const [, , ivPart, tagPart, contentPart] = stored.split(':');
  if (!ivPart || !tagPart || !contentPart) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const content = Buffer.from(contentPart, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
};

const getOAuthClient = () => {
  const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = getRequiredEnv('GOOGLE_REDIRECT_URI');

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const toScopeArray = (scope?: string | null) => {
  if (!scope) return [];
  return scope
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);
};

const ensureSingleDefaultMailbox = async (userId: string) => {
  const activeMailboxes = await GoogleMailbox.find({
    userId,
    isDeleted: false,
    isDisconnected: false,
  })
    .select('_id isDefault updatedAt')
    .sort({ isDefault: -1, updatedAt: -1 });

  if (activeMailboxes.length === 0) return;

  const targetDefault = activeMailboxes[0];
  await GoogleMailbox.updateMany(
    { userId, isDeleted: false, isDisconnected: false },
    { $set: { isDefault: false } }
  );
  await GoogleMailbox.updateOne({ _id: targetDefault._id }, { $set: { isDefault: true } });
};

const getAuthorizedClient = async (userId: string) => {
  const integration = await GoogleMailbox.findOne({
    userId,
    isDeleted: false,
    isDisconnected: false,
  })
    .sort({ isDefault: -1, updatedAt: -1 });
  if (!integration || integration.isDisconnected || integration.isDeleted) {
    return { status: 'not_connected' as const };
  }

  const oauth2Client = getOAuthClient();
  const accessToken = decryptToken(integration.accessToken);
  const refreshToken = decryptToken(integration.refreshToken);

  oauth2Client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    expiry_date: integration.expiryDate ? integration.expiryDate.getTime() : undefined,
    scope: integration.scope?.join(' '),
    token_type: integration.tokenType || undefined,
  });

  const now = Date.now();
  const expiresAt = integration.expiryDate?.getTime() ?? 0;
  const closeToExpiry = expiresAt > 0 && expiresAt - now <= 60_000;

  if (closeToExpiry || !accessToken) {
    await oauth2Client.getAccessToken();
    const nextCredentials = oauth2Client.credentials;

    await GoogleMailbox.updateOne(
      { _id: integration._id },
      {
        $set: {
          accessToken: encryptToken(nextCredentials.access_token || accessToken),
          refreshToken: encryptToken(nextCredentials.refresh_token || refreshToken),
          tokenType: nextCredentials.token_type || integration.tokenType || null,
          scope: toScopeArray(nextCredentials.scope) || integration.scope || [],
          expiryDate: nextCredentials.expiry_date ? new Date(nextCredentials.expiry_date) : integration.expiryDate || null,
        },
      }
    );

    oauth2Client.setCredentials({
      ...nextCredentials,
      refresh_token: nextCredentials.refresh_token || refreshToken,
      access_token: nextCredentials.access_token || accessToken,
    });
  }

  return {
    status: 'ok' as const,
    oauth2Client,
    integration,
  };
};

const getHeaderValue = (headers: { name?: string | null; value?: string | null }[] | undefined, key: string) => {
  if (!headers) return null;
  const match = headers.find((item) => item.name?.toLowerCase() === key.toLowerCase());
  return match?.value || null;
};

const buildRawMessage = (input: SendEmailInput) => {
  const headers = [
    `To: ${input.to.join(', ')}`,
    input.cc && input.cc.length ? `Cc: ${input.cc.join(', ')}` : null,
    input.bcc && input.bcc.length ? `Bcc: ${input.bcc.join(', ')}` : null,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    input.html
      ? 'Content-Type: text/html; charset="UTF-8"'
      : 'Content-Type: text/plain; charset="UTF-8"',
  ]
    .filter(Boolean)
    .join('\r\n');

  const body = input.html || input.text || '';
  const message = `${headers}\r\n\r\n${body}`;
  return Buffer.from(message, 'utf8').toString('base64url');
};

export const getGoogleConnectUrl = (userId: string) => {
  const oauth2Client = getOAuthClient();
  const state = jwt.sign(
    {
      userId,
      nonce: crypto.randomUUID(),
    } as OAuthStatePayload,
    getStateSecret(),
    { expiresIn: OAUTH_STATE_EXPIRY }
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });

  return authUrl;
};

export const handleGoogleOAuthCallback = async (code: string, state: string) => {
  const decoded = jwt.verify(state, getStateSecret()) as OAuthStatePayload;
  if (!decoded?.userId) {
    return { status: 'invalid_state' as const };
  }

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    return { status: 'missing_tokens' as const };
  }

  oauth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });

  const email = profile.data.emailAddress;
  if (!email) {
    return { status: 'missing_email' as const };
  }

  const normalizedEmail = email.toLowerCase();
  const existingMailbox = await GoogleMailbox.findOne({
    userId: decoded.userId,
    googleEmail: normalizedEmail,
  }).select('isDefault');

  const hasOtherDefaultMailbox = await GoogleMailbox.exists({
    userId: decoded.userId,
    isDefault: true,
    isDeleted: false,
    googleEmail: { $ne: normalizedEmail },
  });

  const nextIsDefault = existingMailbox?.isDefault ? true : !hasOtherDefaultMailbox;

  await GoogleMailbox.findOneAndUpdate(
    { userId: decoded.userId, googleEmail: normalizedEmail },
    {
      $set: {
        userId: decoded.userId,
        googleEmail: normalizedEmail,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        tokenType: tokens.token_type || null,
        scope: toScopeArray(tokens.scope),
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        historyId: profile.data.historyId || null,
        isDefault: nextIsDefault,
        isDisconnected: false,
        isDeleted: false,
        disconnectedAt: null,
        deletedAt: null,
      },
    },
    { upsert: true, new: true }
  );

  return {
    status: 'ok' as const,
    userId: decoded.userId,
    email,
  };
};

export const getGoogleMailboxList = async (userId: string) => {
  const mailboxes = await GoogleMailbox.find({ userId, isDeleted: false })
    .select('googleEmail expiryDate updatedAt isDefault isDisconnected isDeleted disconnectedAt deletedAt')
    .sort({ isDefault: -1, updatedAt: -1 });

  return {
    status: 'ok' as const,
    mailboxes,
  };
};

export const disconnectGoogleMailbox = async (userId: string, mailboxId: string) => {
  const integration = await GoogleMailbox.findOne({
    _id: mailboxId,
    userId,
    isDeleted: false,
  });
  if (!integration) {
    return { status: 'not_found' as const };
  }

  if (integration.isDisconnected) {
    return { status: 'already_disconnected' as const };
  }

  const oauth2Client = getOAuthClient();
  const accessToken = decryptToken(integration.accessToken);

  if (accessToken) {
    await oauth2Client.revokeToken(accessToken).catch(() => null);
  }

  await GoogleMailbox.updateOne(
    { _id: integration._id },
    {
      $set: {
        isDisconnected: true,
        isDefault: false,
        disconnectedAt: new Date(),
      },
    }
  );

  await ensureSingleDefaultMailbox(userId);
  return { status: 'ok' as const };
};

export const deleteGoogleMailbox = async (userId: string, mailboxId: string) => {
  const integration = await GoogleMailbox.findOne({ _id: mailboxId, userId, isDeleted: false });
  if (!integration) {
    return { status: 'not_found' as const };
  }

  const oauth2Client = getOAuthClient();
  const accessToken = decryptToken(integration.accessToken);

  if (accessToken) {
    await oauth2Client.revokeToken(accessToken).catch(() => null);
  }

  await GoogleMailbox.updateOne(
    { _id: integration._id },
    {
      $set: {
        isDisconnected: true,
        isDeleted: true,
        isDefault: false,
        disconnectedAt: new Date(),
        deletedAt: new Date(),
      },
    }
  );

  await ensureSingleDefaultMailbox(userId);

  return { status: 'ok' as const };
};

export const makeDefaultGoogleMailbox = async (userId: string, mailboxId: string) => {
  const target = await GoogleMailbox.findOne({
    _id: mailboxId,
    userId,
    isDeleted: false,
    isDisconnected: false,
  });

  if (!target) {
    return { status: 'invalid_target' as const };
  }

  await GoogleMailbox.updateMany(
    { userId, isDeleted: false, isDisconnected: false },
    { $set: { isDefault: false } }
  );

  await GoogleMailbox.updateOne({ _id: target._id }, { $set: { isDefault: true } });

  return { status: 'ok' as const };
};

export const sendGoogleEmail = async (payload: SendEmailInput) => {
  const result = await getAuthorizedClient(payload.userId);
  if (result.status !== 'ok') {
    return { status: 'not_connected' as const };
  }

  const gmail = google.gmail({ version: 'v1', auth: result.oauth2Client });
  const raw = buildRawMessage(payload);

  const sent = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: payload.threadId,
    },
  });

  return {
    status: 'ok' as const,
    message: {
      id: sent.data.id,
      threadId: sent.data.threadId,
      labelIds: sent.data.labelIds || [],
    },
  };
};

export const listGoogleInbox = async (payload: ListInboxInput) => {
  const result = await getAuthorizedClient(payload.userId);
  if (result.status !== 'ok') {
    return { status: 'not_connected' as const };
  }

  const gmail = google.gmail({ version: 'v1', auth: result.oauth2Client });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults: payload.maxResults,
    pageToken: payload.pageToken,
    q: payload.q,
  });

  const messages = listRes.data.messages || [];
  const detailed = await Promise.all(
    messages.map(async (item: { id?: string | null }) => {
      if (!item.id) return null;
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: item.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = details.data.payload?.headers || [];
      return {
        id: details.data.id,
        threadId: details.data.threadId,
        snippet: details.data.snippet || '',
        internalDate: details.data.internalDate || null,
        from: getHeaderValue(headers, 'From'),
        to: getHeaderValue(headers, 'To'),
        subject: getHeaderValue(headers, 'Subject'),
        date: getHeaderValue(headers, 'Date'),
      };
    })
  );

  return {
    status: 'ok' as const,
    messages: detailed.filter(Boolean),
    nextPageToken: listRes.data.nextPageToken || null,
    resultSizeEstimate: listRes.data.resultSizeEstimate || 0,
  };
};
