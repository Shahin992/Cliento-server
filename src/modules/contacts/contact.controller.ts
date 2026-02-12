import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { sendError, sendResponse } from '../../../Utils/response';
import { createContact, deleteContact, getContactById, listContacts, updateContact } from './contact.service';

const LENGTH = {
  firstName: 30,
  lastName: 30,
  companyName: 50,
  jobTitle: 50,
  email: 60,
  phoneMin: 7,
  phoneMax: 20,
  website: 100,
  photoUrl: 208,
  tag: 40,
  tagsMax: 20,
  street: 100,
  city: 50,
  state: 50,
  postalCode: 10,
  country: 25,
  notes: 2000,
  contactItemsMax: 10,
  listSearch: 100,
} as const;

const trimmedRequiredString = z.string().trim().min(1);
const optionalBoundedString = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const optionalNullableBoundedStringFromInput = (max: number) => z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().max(max).nullable().optional()
);

const contactEmailSchema = z.string().trim().max(LENGTH.email).email();
const contactPhoneSchema = z.string().trim().min(LENGTH.phoneMin).max(LENGTH.phoneMax);
const contactEmailsInputSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    const values = Array.isArray(value) ? value : [value];
    return values
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  },
  z.array(contactEmailSchema).max(LENGTH.contactItemsMax).optional()
);
const contactPhonesInputSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    const values = Array.isArray(value) ? value : [value];
    return values
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  },
  z.array(contactPhoneSchema).max(LENGTH.contactItemsMax).optional()
);
const contactAddressSchema = z.object({
  street: optionalNullableBoundedStringFromInput(LENGTH.street),
  city: optionalNullableBoundedStringFromInput(LENGTH.city),
  state: optionalNullableBoundedStringFromInput(LENGTH.state),
  postalCode: optionalNullableBoundedStringFromInput(LENGTH.postalCode),
  zipCode: optionalNullableBoundedStringFromInput(LENGTH.postalCode),
  country: optionalNullableBoundedStringFromInput(LENGTH.country),
}).nullable().optional();

const contactBaseSchema = {
  firstName: trimmedRequiredString.max(LENGTH.firstName),
  lastName: optionalBoundedString(LENGTH.lastName),
  photoUrl: z.string().trim().max(LENGTH.photoUrl).url().nullable().optional(),
  emails: contactEmailsInputSchema,
  phones: contactPhonesInputSchema,
  companyName: optionalBoundedString(LENGTH.companyName),
  jobTitle: optionalBoundedString(LENGTH.jobTitle),
  website: z.string().trim().max(LENGTH.website).url().nullable().optional(),
  leadSource: z.enum(['website', 'referral', 'social', 'ads', 'manual', 'other']).optional(),
  status: z.enum(['lead', 'qualified', 'customer', 'inactive']).optional(),
  tags: z.array(z.string().trim().min(1).max(LENGTH.tag)).max(LENGTH.tagsMax).optional(),
  address: contactAddressSchema,
  notes: optionalBoundedString(LENGTH.notes),
};

const createContactSchema = z.object({
  ...contactBaseSchema,
  address: contactAddressSchema,
}).refine((data) => Boolean(
  (data.emails && data.emails.length) ||
  (data.phones && data.phones.length)
), {
  message: 'At least one email or phone is required',
});

const updateContactSchema = z.object({
  ...contactBaseSchema,
  firstName: contactBaseSchema.firstName.optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(LENGTH.listSearch).optional()
  ),
});

const getUserIdFromReq = (req: Request) => (req as any).user?.id as string | undefined;

const getQueryValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const createContactHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = createContactSchema.parse(req.body);
    const { ...rest } = parsed;
    const normalizedAddress = rest.address
      ? {
          street: rest.address.street ?? null,
          city: rest.address.city ?? null,
          state: rest.address.state ?? null,
          postalCode: rest.address.postalCode ?? rest.address.zipCode ?? null,
          country: rest.address.country ?? null,
        }
      : undefined;

    const result = await createContact({
      ...rest,
      emails: rest.emails ?? [],
      phones: rest.phones ?? [],
      address: normalizedAddress,
      ownerId: userId,
      createdBy: userId,
      updatedBy: userId,
    });

    if (result.status === 'duplicate_email') {
      return sendError(res, {
        success: false,
        statusCode: 409,
        message: 'A contact with one or more of these emails already exists',
        details: result.duplicateEmails.join(', '),
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 201,
      message: 'Contact created successfully',
      data: result.contact,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to create contact',
      details: (error as Error).message,
    });
  }
};

export const listContactsHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const query = listContactsQuerySchema.parse({
      page: getQueryValue(req.query.page),
      limit: getQueryValue(req.query.limit),
      search: getQueryValue(req.query.search) ?? getQueryValue(req.query.q),
    });

    const contacts = await listContacts(userId, query);

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contacts fetched successfully',
      data: contacts,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch contacts',
      details: (error as Error).message,
    });
  }
};

export const getContactByIdHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const contact = await getContactById(userId, req.params.id);
    if (!contact) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found',
      });
    }

    const contactObj = contact.toObject();
    const ownerDetails = (contactObj as any).ownerId && typeof (contactObj as any).ownerId === 'object'
      ? (contactObj as any).ownerId
      : null;
    const { ownerId: _ownerId, ...contactWithoutOwnerId } = contactObj as any;

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact fetched successfully',
      data: {
        ...contactWithoutOwnerId,
        ownerDetails,
      },
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to fetch contact',
      details: (error as Error).message,
    });
  }
};

export const updateContactHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const parsed = updateContactSchema.parse(req.body);
    const { address, ...rest } = parsed;
    const normalizedAddress = address === undefined
      ? undefined
      : address === null
        ? null
        : {
            street: address.street ?? null,
            city: address.city ?? null,
            state: address.state ?? null,
            postalCode: address.postalCode ?? address.zipCode ?? null,
            country: address.country ?? null,
          };

    const contact = await updateContact(userId, req.params.id, {
      ...rest,
      address: normalizedAddress,
      updatedBy: userId,
    });

    if (!contact) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact updated successfully',
      data: contact,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, {
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to update contact',
      details: (error as Error).message,
    });
  }
};

export const deleteContactHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return sendError(res, {
        success: false,
        statusCode: 401,
        message: 'You have no access to this route',
      });
    }

    const deleted = await deleteContact(userId, req.params.id);
    if (!deleted) {
      return sendError(res, {
        success: false,
        statusCode: 404,
        message: 'Contact not found',
      });
    }

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Contact deleted successfully',
    });
  } catch (error) {
    return sendError(res, {
      success: false,
      statusCode: 500,
      message: 'Failed to delete contact',
      details: (error as Error).message,
    });
  }
};
