import { Contact } from './contact.model';
import { ContactNote } from './contactNote.model';
import { CreateContactNoteInput, ListContactNotesQuery, UpdateContactNoteInput } from './contactNote.interface';

const NOTE_LIST_FIELDS = [
  '_id',
  'ownerId',
  'contactId',
  'body',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const contactExistsForOwner = async (ownerId: string, contactId: string) => {
  const exists = await Contact.exists({
    _id: contactId,
    ownerId,
    deletedAt: null,
  });

  return Boolean(exists);
};

export const createContactNote = async (payload: CreateContactNoteInput) => {
  const hasContact = await contactExistsForOwner(payload.ownerId, payload.contactId);
  if (!hasContact) {
    return { status: 'contact_not_found' as const };
  }

  const note = await ContactNote.create(payload);
  return { status: 'ok' as const, note };
};

export const listContactNotes = async (ownerId: string, query: ListContactNotesQuery) => {
  const hasContact = await contactExistsForOwner(ownerId, query.contactId);
  if (!hasContact) {
    return { status: 'contact_not_found' as const };
  }

  const filter = {
    ownerId,
    contactId: query.contactId,
    deletedAt: null,
  };

  const skip = (query.page - 1) * query.limit;

  const [notes, total] = await Promise.all([
    ContactNote.find(filter)
      .select(NOTE_LIST_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    ContactNote.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    status: 'ok' as const,
    data: {
      notes,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    },
  };
};

export const getContactNoteById = async (ownerId: string, noteId: string) => {
  const note = await ContactNote.findOne({
    _id: noteId,
    ownerId,
    deletedAt: null,
  }).select(NOTE_LIST_FIELDS);

  return note;
};

export const updateContactNote = async (ownerId: string, noteId: string, updates: UpdateContactNoteInput) => {
  const note = await ContactNote.findOneAndUpdate(
    {
      _id: noteId,
      ownerId,
      deletedAt: null,
    },
    updates,
    { new: true }
  ).select(NOTE_LIST_FIELDS);

  return note;
};

export const deleteContactNote = async (ownerId: string, noteId: string, deletedBy: string) => {
  const note = await ContactNote.findOneAndUpdate(
    {
      _id: noteId,
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

  return note;
};
