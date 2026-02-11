import { FilterQuery } from 'mongoose';
import { Contact } from './contact.model';
import { CreateContactInput, IContact, UpdateContactInput } from './contact.interface';

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

export const listContacts = async (ownerId: string, query?: { q?: string; status?: string }) => {
  const filter: FilterQuery<IContact> = { ownerId };

  if (query?.status) {
    filter.status = query.status;
  }

  if (query?.q) {
    const regex = new RegExp(query.q.trim(), 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { companyName: regex },
      { emails: regex },
      { phones: regex },
    ];
  }

  const contacts = await Contact.find(filter).sort({ createdAt: -1 });
  return contacts;
};

export const getContactById = async (ownerId: string, id: string) => {
  const contact = await Contact.findOne({ _id: id, ownerId }).populate({
    path: 'ownerId',
    select: '_id fullName email companyName profilePhoto role',
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
    { _id: id, ownerId },
    nextUpdates,
    { new: true }
  );
  return contact;
};

export const deleteContact = async (ownerId: string, id: string) => {
  const contact = await Contact.findOneAndDelete({ _id: id, ownerId });
  return contact;
};
