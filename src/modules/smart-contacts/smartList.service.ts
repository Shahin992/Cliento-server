import { FilterQuery } from 'mongoose';
import { Contact } from '../contacts/contact.model';
import { ContactList } from './smartList.model';
import { IContactList, CreateContactListInput, ListContactListsQuery, UpdateContactListInput } from './smartList.interface';

const CONTACT_LIST_FIELDS = [
  '_id',
  'ownerId',
  'name',
  'description',
  'contactIds',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const CONTACT_POPULATE = {
  path: 'contactIds',
  select: '_id firstName lastName photoUrl emails phones companyName status',
};

const normalizeContactIds = (contactIds: string[]) => Array.from(new Set(contactIds));

const validateContactsOwnership = async (ownerId: string, contactIds: string[]) => {
  if (!contactIds.length) {
    return { status: 'ok' as const };
  }

  const contacts = await Contact.find({
    _id: { $in: contactIds },
    ownerId,
    deletedAt: null,
  })
    .select('_id')
    .lean();

  const existingIds = new Set(contacts.map((contact) => String(contact._id)));
  const missingIds = contactIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    return {
      status: 'contact_not_found' as const,
      missingIds,
    };
  }

  return { status: 'ok' as const };
};

export const createContactList = async (payload: CreateContactListInput) => {
  const normalizedContactIds = normalizeContactIds(payload.contactIds);

  const existing = await ContactList.findOne({
    ownerId: payload.ownerId,
    name: payload.name,
    deletedAt: null,
  }).select('_id');

  if (existing) {
    return { status: 'duplicate_name' as const };
  }

  const contactValidation = await validateContactsOwnership(payload.ownerId, normalizedContactIds);
  if (contactValidation.status === 'contact_not_found') {
    return contactValidation;
  }

  const contactList = await ContactList.create({
    ...payload,
    contactIds: normalizedContactIds,
  });

  const populated = await ContactList.findById(contactList._id)
    .select(CONTACT_LIST_FIELDS)
    .populate(CONTACT_POPULATE);

  return {
    status: 'ok' as const,
    contactList: populated,
  };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createRegex = (value: string) => new RegExp(escapeRegExp(value.trim()), 'i');

export const listContactLists = async (ownerId: string, query: ListContactListsQuery) => {
  const conditions: FilterQuery<IContactList>[] = [{ ownerId, deletedAt: null }];

  if (query.search) {
    const regex = createRegex(query.search);
    conditions.push({
      $or: [
        { name: regex },
        { description: regex },
      ],
    });
  }

  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (query.page - 1) * query.limit;

  const [contactLists, total] = await Promise.all([
    ContactList.find(filter)
      .select(CONTACT_LIST_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate(CONTACT_POPULATE),
    ContactList.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    contactLists,
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

export const getContactListById = async (ownerId: string, contactListId: string) => {
  const contactList = await ContactList.findOne({
    _id: contactListId,
    ownerId,
    deletedAt: null,
  })
    .select(CONTACT_LIST_FIELDS)
    .populate(CONTACT_POPULATE);

  return contactList;
};

export const updateContactList = async (ownerId: string, contactListId: string, updates: UpdateContactListInput) => {
  const nextUpdates: Record<string, unknown> = { ...updates };

  if (updates.name !== undefined) {
    const duplicate = await ContactList.findOne({
      ownerId,
      _id: { $ne: contactListId },
      name: updates.name,
      deletedAt: null,
    }).select('_id');

    if (duplicate) {
      return { status: 'duplicate_name' as const };
    }
  }

  if (updates.contactIds !== undefined) {
    const normalizedContactIds = normalizeContactIds(updates.contactIds);
    const contactValidation = await validateContactsOwnership(ownerId, normalizedContactIds);
    if (contactValidation.status === 'contact_not_found') {
      return contactValidation;
    }
    nextUpdates.contactIds = normalizedContactIds;
  }

  const contactList = await ContactList.findOneAndUpdate(
    {
      _id: contactListId,
      ownerId,
      deletedAt: null,
    },
    nextUpdates,
    { new: true }
  )
    .select(CONTACT_LIST_FIELDS)
    .populate(CONTACT_POPULATE);

  if (!contactList) {
    return { status: 'not_found' as const };
  }

  return {
    status: 'ok' as const,
    contactList,
  };
};

export const deleteContactList = async (ownerId: string, contactListId: string, deletedBy: string) => {
  const contactList = await ContactList.findOneAndUpdate(
    {
      _id: contactListId,
      ownerId,
      deletedAt: null,
    },
    {
      deletedAt: new Date(),
      deletedBy,
      updatedBy: deletedBy,
    },
    { new: true }
  );

  return contactList;
};
