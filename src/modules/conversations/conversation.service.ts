import { FilterQuery } from 'mongoose';
import { Contact } from '../contacts/contact.model';
import { GoogleMailbox } from '../mail/google.model';
import {
  CreateConversationInput,
  IConversation,
  ListConversationsQuery,
  UpdateConversationInput,
} from './conversation.interface';
import { Conversation } from './conversation.model';

const normalizeParticipants = (participants?: string[]) => {
  if (!participants) return [];

  return Array.from(
    new Set(
      participants
        .filter((item) => item && item.trim())
        .map((item) => item.trim().toLowerCase())
    )
  );
};

const normalizeEmail = (email?: string | null) => {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeEmailList = (emails?: string[]) => {
  if (!emails) return [];
  return Array.from(
    new Set(
      emails
        .filter((item) => item && item.trim())
        .map((item) => item.trim().toLowerCase())
    )
  );
};

const validateContactOwnership = async (ownerId: string, contactId?: string | null) => {
  if (!contactId) return true;
  const contact = await Contact.findOne({ _id: contactId, ownerId, deletedAt: null }).select('_id');
  return Boolean(contact);
};

const validateMailboxOwnership = async (ownerId: string, mailboxId?: string | null) => {
  if (!mailboxId) return true;
  const mailbox = await GoogleMailbox.findOne({ _id: mailboxId, userId: ownerId, isDeleted: false }).select('_id');
  return Boolean(mailbox);
};

export const createConversation = async (payload: CreateConversationInput) => {
  const participants = normalizeParticipants(payload.participants);
  const externalMessageId = payload.externalMessageId?.trim() || null;

  if (!(await validateContactOwnership(payload.ownerId, payload.contactId))) {
    return { status: 'contact_not_found' as const };
  }

  if (!(await validateMailboxOwnership(payload.ownerId, payload.mailboxId))) {
    return { status: 'mailbox_not_found' as const };
  }

  if (externalMessageId) {
    const duplicate = await Conversation.findOne({
      ownerId: payload.ownerId,
      method: payload.method,
      externalMessageId,
      deletedAt: null,
    }).select('_id');

    if (duplicate) {
      return {
        status: 'duplicate_external_message' as const,
        conversationId: duplicate._id,
      };
    }
  }

  const conversation = await Conversation.create({
    ownerId: payload.ownerId,
    contactId: payload.contactId ?? null,
    mailboxId: payload.mailboxId ?? null,
    method: payload.method,
    direction: payload.direction,
    subject: payload.subject ?? null,
    body: payload.body ?? null,
    from: normalizeEmail(payload.from),
    to: normalizeEmailList(payload.to),
    participants,
    externalMessageId,
    externalThreadId: payload.externalThreadId?.trim() || null,
    sentAt: payload.sentAt ?? null,
    createdBy: payload.createdBy,
    updatedBy: payload.updatedBy ?? payload.createdBy,
  });

  return { status: 'ok' as const, conversation };
};

export const upsertConversationByExternalMessage = async (payload: CreateConversationInput) => {
  const externalMessageId = payload.externalMessageId?.trim() || null;
  if (!externalMessageId) {
    return { status: 'external_message_id_required' as const };
  }

  if (!(await validateContactOwnership(payload.ownerId, payload.contactId))) {
    return { status: 'contact_not_found' as const };
  }

  if (!(await validateMailboxOwnership(payload.ownerId, payload.mailboxId))) {
    return { status: 'mailbox_not_found' as const };
  }

  const existing = await Conversation.findOne({
    ownerId: payload.ownerId,
    method: payload.method,
    externalMessageId,
    deletedAt: null,
  });

  if (!existing) {
    const created = await Conversation.create({
      ownerId: payload.ownerId,
      contactId: payload.contactId ?? null,
      mailboxId: payload.mailboxId ?? null,
      method: payload.method,
      direction: payload.direction,
      subject: payload.subject ?? null,
      body: payload.body ?? null,
      from: normalizeEmail(payload.from),
      to: normalizeEmailList(payload.to),
      participants: normalizeParticipants(payload.participants),
      externalMessageId,
      externalThreadId: payload.externalThreadId?.trim() || null,
      sentAt: payload.sentAt ?? null,
      createdBy: payload.createdBy,
      updatedBy: payload.updatedBy ?? payload.createdBy,
    });

    return { status: 'created' as const, conversation: created };
  }

  existing.contactId = payload.contactId as any;
  existing.mailboxId = payload.mailboxId as any;
  existing.direction = payload.direction;
  existing.subject = payload.subject ?? null;
  existing.body = payload.body ?? null;
  existing.from = normalizeEmail(payload.from);
  existing.to = normalizeEmailList(payload.to);
  existing.participants = normalizeParticipants(payload.participants);
  existing.externalThreadId = payload.externalThreadId?.trim() || null;
  existing.sentAt = payload.sentAt ?? null;
  existing.updatedBy = payload.updatedBy as any;

  await existing.save();
  return { status: 'updated' as const, conversation: existing };
};

export const getConversationById = async (ownerId: string, conversationId: string) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    ownerId,
    deletedAt: null,
  })
    .populate({
      path: 'contactId',
      select: '_id firstName lastName emails phones photoUrl',
      match: { ownerId, deletedAt: null },
    })
    .populate({
      path: 'mailboxId',
      select: '_id googleEmail isDefault isDisconnected isDeleted',
      match: { userId: ownerId, isDeleted: false },
    });

  if (!conversation) {
    return { status: 'conversation_not_found' as const };
  }

  return { status: 'ok' as const, conversation };
};

export const listConversations = async (ownerId: string, query: ListConversationsQuery) => {
  const conditions: FilterQuery<IConversation>[] = [{ ownerId, deletedAt: null }, { contactId: query.contactId }];

  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (query.page - 1) * query.limit;

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .select('_id method direction subject body from to participants contactId sentAt createdAt')
      .sort({ sentAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate({
        path: 'contactId',
        select: '_id emails',
        match: { ownerId, deletedAt: null },
      }),
    Conversation.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  const items = conversations.map((conversation: any) => {
    const contact = conversation.contactId && typeof conversation.contactId === 'object' ? conversation.contactId : null;
    const contactEmail = Array.isArray(contact?.emails) && contact.emails.length > 0 ? contact.emails[0] : null;
    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    const to = Array.isArray(conversation.to) ? conversation.to : [];

    return {
      _id: conversation._id,
      method: conversation.method,
      direction: conversation.direction,
      contactId: contact?._id || null,
      contactEmail,
      subject: conversation.subject || null,
      body: conversation.body || null,
      from: conversation.from || null,
      to,
      participants,
      sentAt: conversation.sentAt || null,
    };
  });

  return {
    conversations: items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    },
  };
};

export const updateConversation = async (payload: UpdateConversationInput) => {
  const conversation = await Conversation.findOne({
    _id: payload.conversationId,
    ownerId: payload.ownerId,
    deletedAt: null,
  });

  if (!conversation) {
    return { status: 'conversation_not_found' as const };
  }

  if (payload.contactId !== undefined && !(await validateContactOwnership(payload.ownerId, payload.contactId))) {
    return { status: 'contact_not_found' as const };
  }

  if (payload.mailboxId !== undefined && !(await validateMailboxOwnership(payload.ownerId, payload.mailboxId))) {
    return { status: 'mailbox_not_found' as const };
  }

  if (payload.contactId !== undefined) conversation.contactId = payload.contactId as any;
  if (payload.mailboxId !== undefined) conversation.mailboxId = payload.mailboxId as any;
  if (payload.direction !== undefined) conversation.direction = payload.direction;
  if (payload.subject !== undefined) conversation.subject = payload.subject;
  if (payload.body !== undefined) conversation.body = payload.body;
  if (payload.participants !== undefined) conversation.participants = normalizeParticipants(payload.participants);
  if (payload.externalThreadId !== undefined) conversation.externalThreadId = payload.externalThreadId;
  if (payload.sentAt !== undefined) conversation.sentAt = payload.sentAt;
  conversation.updatedBy = payload.updatedBy as any;

  await conversation.save();
  return { status: 'ok' as const, conversation };
};

export const deleteConversation = async (ownerId: string, conversationId: string, deletedBy: string) => {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, ownerId, deletedAt: null },
    {
      deletedAt: new Date(),
      deletedBy,
      updatedBy: deletedBy,
    },
    { new: true }
  );

  if (!conversation) {
    return { status: 'conversation_not_found' as const };
  }

  return { status: 'ok' as const, conversation };
};
