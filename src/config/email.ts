import https from 'https';

const EMAIL_REQUEST_TIMEOUT_MS = Number(process.env.EMAIL_REQUEST_TIMEOUT_MS || 5000);
const EMAIL_RETRY_COUNT = Number(process.env.EMAIL_RETRY_COUNT || 1);
const EMAIL_RETRY_DELAY_MS = Number(process.env.EMAIL_RETRY_DELAY_MS || 300);

const brevoAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
});

const getEmailConfig = () => {
  return {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || 'Cliento',
  };
};

export const canSendEmail = () => {
  const { apiKey, senderEmail } = getEmailConfig();
  return Boolean(apiKey && senderEmail);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableEmailError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN';
};

const sendBrevoEmailOnce = async (payload: string) => {
  const { apiKey } = getEmailConfig();

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        agent: brevoAgent,
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': apiKey as string,
          'content-type': 'application/json',
          accept: 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`====> Email sent: ${res.statusCode}`);
            resolve(data);
            return;
          }
          reject(new Error(`Brevo API error: ${res.statusCode} ${data}`));
        });
      }
    );

    req.setTimeout(EMAIL_REQUEST_TIMEOUT_MS, () => {
      const timeoutError = new Error(`Brevo request timeout after ${EMAIL_REQUEST_TIMEOUT_MS}ms`) as Error & { code?: string };
      timeoutError.code = 'ETIMEDOUT';
      req.destroy(timeoutError);
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

const sendBrevoEmail = async (payload: string) => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= EMAIL_RETRY_COUNT; attempt += 1) {
    try {
      await sendBrevoEmailOnce(payload);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === EMAIL_RETRY_COUNT || !isRetryableEmailError(error)) {
        throw error;
      }
      await wait(EMAIL_RETRY_DELAY_MS);
    }
  }

  throw lastError;
};

const fetchFileAsBase64 = async (url: string, timeoutMs = EMAIL_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } finally {
    clearTimeout(timeout);
  }
};

export const sendWelcomeEmail = async (to: string, name: string, tempPassword: string) => {
  const { senderEmail, senderName } = getEmailConfig();
  if (!canSendEmail()) {
    console.warn('====> Email not sent: missing Brevo API env vars');
    return;
  }

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to, name }],
    subject: 'Welcome to Cliento',
    // htmlContent: `<p>Hi ${name}, welcome to Cliento! Your account has been created.</p>`,
    htmlContent: `
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb; padding: 30px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 30px;">
        
        <h2 style="color: #333; margin-top: 0;">
          Welcome to Cliento, ${name}! 👋
        </h2>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Your account is ready. Use the temporary password below to sign in, then change it right away.
        </p>

        <div style="background:#f3f6ff;border:1px solid #d9e2ff;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;color:#333;font-size:14px;">
            Temporary password: <strong style="font-size:16px;">${tempPassword}</strong>
          </p>
        </div>

        <h3 style="color: #333;">Your first 3 steps</h3>

        <ol style="color: #555; font-size: 15px; line-height: 1.6; padding-left: 20px;">
          <li><strong>Complete your profile</strong><br/>Add your company details and preferences.</li>
          <li><strong>Add your first contact</strong><br/>Start by importing or creating a customer.</li>
          <li><strong>Create your first deal</strong><br/>Track progress and stay organized.</li>
        </ol>


        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          Need help? Reply to this email or check the in-app tips — we’ve got you covered.
        </p>

        <p style="color: #555; font-size: 14px;">
          Cheers,<br/>
          <strong>The Cliento Team</strong>
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:30px 0"/>

        <p style="color:#999;font-size:12px;text-align:center;">
          © ${new Date().getFullYear()} Cliento
        </p>

      </div>
    </div>`
  });

  await sendBrevoEmail(payload);
};

export const sendPasswordResetOtpEmail = async (to: string, name: string, otp: string) => {
  const { senderEmail, senderName } = getEmailConfig();
  if (!canSendEmail()) {
    console.warn('====> Email not sent: missing Brevo API env vars');
    return;
  }

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to, name }],
    subject: 'Your password reset code',
    htmlContent: `
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb; padding: 30px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 30px;">
        <h2 style="color: #333; margin-top: 0;">Password reset code</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Use the code below to reset your password. It expires in 5 minutes.
        </p>
        <div style="background:#f3f6ff;border:1px solid #d9e2ff;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;color:#333;font-size:14px;">
            OTP code: <strong style="font-size:18px; letter-spacing: 2px;">${otp}</strong>
          </p>
        </div>
        <p style="color: #555; font-size: 13px; line-height: 1.6;">
          If you didn’t request this, you can ignore this email.
        </p>
        <p style="color: #555; font-size: 14px;">
          Thanks,<br/>
          <strong>The Cliento Team</strong>
        </p>
      </div>
    </div>`
  });

  await sendBrevoEmail(payload);
};

export const sendPasswordResetConfirmationEmail = async (to: string, name: string) => {
  const { senderEmail, senderName } = getEmailConfig();
  if (!canSendEmail()) {
    console.warn('====> Email not sent: missing Brevo API env vars');
    return;
  }

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to, name }],
    subject: 'Your password was reset',
    htmlContent: `
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb; padding: 30px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 30px;">
        <h2 style="color: #333; margin-top: 0;">Password changed</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Your password was successfully reset. If you didn’t do this, please contact support immediately.
        </p>
        <p style="color: #555; font-size: 14px;">
          Thanks,<br/>
          <strong>The Cliento Team</strong>
        </p>
      </div>
    </div>`
  });

  await sendBrevoEmail(payload);
};

type SubscriptionInvoiceEmailPayload = {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  status?: string | null;
  amountPaid?: number | null;
  currency?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  createdAt?: Date | null;
};

export const sendSubscriptionInvoiceEmail = async (
  to: string,
  name: string,
  invoice: SubscriptionInvoiceEmailPayload,
  options?: {
    includeAttachment?: boolean;
  }
) => {
  const { senderEmail, senderName } = getEmailConfig();
  if (!canSendEmail()) {
    console.warn('====> Email not sent: missing Brevo API env vars');
    return;
  }

  const formattedAmount =
    typeof invoice.amountPaid === 'number' && invoice.currency
      ? `${(invoice.amountPaid / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`
      : 'N/A';
  const invoiceDate = invoice.createdAt ? invoice.createdAt.toUTCString() : 'N/A';
  const safeName = name || 'there';
  const invoiceLink = invoice.hostedInvoiceUrl || invoice.invoicePdfUrl || '';
  const attachmentNameBase = invoice.invoiceNumber || invoice.invoiceId || 'stripe-invoice';

  const emailPayload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to, name: safeName }],
    subject: 'Payment successful - your invoice',
    htmlContent: `
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb; padding: 30px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 30px;">
        <h2 style="color: #333; margin-top: 0;">Payment successful</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Hi ${safeName}, your subscription payment was completed successfully.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <p style="margin:4px 0;color:#334155;font-size:14px;">Invoice ID: <strong>${invoice.invoiceId || 'N/A'}</strong></p>
          <p style="margin:4px 0;color:#334155;font-size:14px;">Invoice Number: <strong>${invoice.invoiceNumber || 'N/A'}</strong></p>
          <p style="margin:4px 0;color:#334155;font-size:14px;">Status: <strong>${invoice.status || 'N/A'}</strong></p>
          <p style="margin:4px 0;color:#334155;font-size:14px;">Amount Paid: <strong>${formattedAmount}</strong></p>
          <p style="margin:4px 0;color:#334155;font-size:14px;">Date: <strong>${invoiceDate}</strong></p>
        </div>
        ${invoiceLink ? `<p><a href="${invoiceLink}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">View Invoice</a></p>` : ''}
        <p style="color: #555; font-size: 14px;">
          Thanks,<br/>
          <strong>The Cliento Team</strong>
        </p>
      </div>
    </div>`,
  };

  const includeAttachment = options?.includeAttachment ?? true;

  if (includeAttachment && invoice.invoicePdfUrl) {
    try {
      const base64Content = await fetchFileAsBase64(invoice.invoicePdfUrl);
      emailPayload.attachment = [
        {
          name: `${attachmentNameBase}.pdf`,
          content: base64Content,
        },
      ];
    } catch (error) {
      console.warn(`====> Invoice PDF attachment skipped: ${(error as Error).message}`);
    }
  }

  const payload = JSON.stringify(emailPayload);

  await sendBrevoEmail(payload);
};
