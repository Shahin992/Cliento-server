import { FilterQuery } from 'mongoose';
import { Contact } from './contact.model';
import { CreateContactInput, IContact, ListContactsQuery, ListContactsResult, UpdateContactInput } from './contact.interface';

const normalizeEmails = (emails?: string[]) => {
  if (!emails) return undefined;

  const deduped = Array.from(
    new Set(
      emails
        .filter((e) => e && e.trim())
        .map((e) => e.trim().toLowerCase())
    )
  );
  return deduped;
};

const normalizePhones = (phones?: string[]) => {
  if (!phones) return undefined;

  const deduped = Array.from(
    new Set(
      phones
        .filter((p) => p && p.trim())
        .map((p) => p.trim())
    )
  );
  return deduped;
};

export const createContact = async (payload: CreateContactInput) => {
  const normalizedEmails = normalizeEmails(payload.emails) ?? [];
  const normalizedPhones = normalizePhones(payload.phones) ?? [];

  if (normalizedEmails.length > 0) {
    const existing = await Contact.findOne({
      ownerId: payload.ownerId,
      deletedAt: null,
      emails: { $in: normalizedEmails },
    }).select('_id emails firstName lastName');

    if (existing) {
      const existingEmailSet = new Set((existing.emails || []).map((email) => email.toLowerCase()));
      const duplicateEmails = normalizedEmails.filter((email) => existingEmailSet.has(email.toLowerCase()));

      return {
        status: 'duplicate_email' as const,
        duplicateEmails,
      };
    }
  }

  const contact = await Contact.create({
    ...payload,
    emails: normalizedEmails,
    phones: normalizedPhones,
  });
  return { status: 'ok' as const, contact };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createRegex = (value: string) => new RegExp(escapeRegExp(value.trim()), 'i');

const CONTACT_LIST_FIELDS = [
  '_id',
  'ownerId',
  'firstName',
  'lastName',
  'photoUrl',
  'emails',
  'phones',
  'companyName',
  'address',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const CONTACT_DETAIL_FIELDS = [
  '_id',
  'ownerId',
  'firstName',
  'lastName',
  'photoUrl',
  'emails',
  'phones',
  'companyName',
  'jobTitle',
  'website',
  'leadSource',
  'status',
  'tags',
  'address',
  'notes',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export const listContacts = async (ownerId: string, query: ListContactsQuery): Promise<ListContactsResult> => {
  const conditions: FilterQuery<IContact>[] = [{ ownerId, deletedAt: null }];

  if (query.search) {
    const regex = createRegex(query.search);
    conditions.push({
      $or: [
        { firstName: regex },
        { lastName: regex },
        { emails: regex },
        { phones: regex },
      ],
    });
  }

  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (query.page - 1) * query.limit;
  const hasPrevPage = query.page > 1;

  if (query.page === 1) {
    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .select(CONTACT_LIST_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit),
      Contact.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / query.limit);

    return {
      contacts,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage,
      },
    };
  }

  const contacts = await Contact.find(filter)
    .select(CONTACT_LIST_FIELDS)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(query.limit + 1);

  const hasNextPage = contacts.length > query.limit;
  const pageContacts = hasNextPage ? contacts.slice(0, query.limit) : contacts;

  return {
    contacts: pageContacts,
    pagination: {
      page: query.page,
      limit: query.limit,
      hasNextPage,
      hasPrevPage,
    },
  };
};

type ListContactNamesQuery = {
  page: number;
  limit: number;
  search?: string;
};

export const listContactNames = async (ownerId: string, query: ListContactNamesQuery) => {
  const conditions: FilterQuery<IContact>[] = [{ ownerId, deletedAt: null }];

  if (query.search) {
    const regex = createRegex(query.search);
    conditions.push({
      $or: [
        { firstName: regex },
        { lastName: regex },
      ],
    });
  }

  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (query.page - 1) * query.limit;

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .select('_id firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    Contact.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    contacts: contacts.map((contact) => ({
      _id: contact._id,
      name: `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}`.trim(),
    })),
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

export const getContactById = async (ownerId: string, id: string) => {
  const contact = await Contact.findOne({ _id: id, ownerId, deletedAt: null })
    .select(CONTACT_DETAIL_FIELDS)
    .populate({
      path: 'ownerId',
      select: '_id fullName email companyName profilePhoto role phoneNumber location timeZone teamId createdAt updatedAt',
    });
  return contact;
};

export const updateContact = async (ownerId: string, id: string, updates: UpdateContactInput) => {
  const nextUpdates: Record<string, unknown> = { ...updates };

  if (updates.emails !== undefined) {
    nextUpdates.emails = normalizeEmails(updates.emails);
  }
  if (updates.phones !== undefined) {
    nextUpdates.phones = normalizePhones(updates.phones);
  }

  const contact = await Contact.findOneAndUpdate(
    { _id: id, ownerId, deletedAt: null },
    nextUpdates,
    { new: true }
  );
  return contact;
};

export const deleteContact = async (ownerId: string, id: string) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: id, ownerId, deletedAt: null },
    {
      deletedAt: new Date(),
      deletedBy: ownerId,
      updatedBy: ownerId,
    },
    { new: true }
  );
  return contact;
};

export const updateContactPhoto = async (ownerId: string, id: string, photoUrl: string | null) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: id, ownerId, deletedAt: null },
    {
      photoUrl,
      updatedBy: ownerId,
    },
    { new: true }
  );
  return contact;
};
