import { Schema, model } from 'mongoose';
import { IContact } from './contact.interface';

const LENGTH = {
  firstName: 30,
  lastName: 30,
  companyName: 80,
  jobTitle: 80,
  email: 100,
  phoneMin: 7,
  phoneMax: 20,
  website: 100,
  photoUrl: 2048,
  tag: 40,
  tagsMax: 20,
  street: 100,
  city: 50,
  state: 50,
  postalCode: 10,
  country: 25,
  notes: 2000,
  contactItemsMax: 10,
} as const;

const contactSchema = new Schema<IContact>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firstName: { type: String, required: true, trim: true, maxlength: LENGTH.firstName },
  lastName: { type: String, default: null, trim: true, maxlength: LENGTH.lastName },
  photoUrl: { type: String, default: null, trim: true, maxlength: LENGTH.photoUrl },
  emails: {
    type: [{ type: String, trim: true, lowercase: true, maxlength: LENGTH.email }],
    default: [],
  },
  phones: {
    type: [{ type: String, trim: true, minlength: LENGTH.phoneMin, maxlength: LENGTH.phoneMax }],
    default: [],
  },
  companyName: { type: String, default: null, trim: true, maxlength: LENGTH.companyName },
  jobTitle: { type: String, default: null, trim: true, maxlength: LENGTH.jobTitle },
  website: { type: String, default: null, trim: true, maxlength: LENGTH.website },
  leadSource: {
    type: String,
    enum: ['website', 'referral', 'social', 'ads', 'manual', 'other'],
    default: 'manual',
  },
  status: { type: String, enum: ['lead', 'qualified', 'customer', 'inactive'], default: 'lead', index: true },
  tags: {
    type: [{ type: String, trim: true, maxlength: LENGTH.tag }],
    default: [],
    validate: {
      validator: (arr: string[]) => arr.length <= LENGTH.tagsMax,
      message: `Tags cannot exceed ${LENGTH.tagsMax} items`,
    },
  },
  address: {
    street: { type: String, default: null, maxlength: LENGTH.street },
    city: { type: String, default: null, maxlength: LENGTH.city },
    state: { type: String, default: null, maxlength: LENGTH.state },
    postalCode: { type: String, default: null, maxlength: LENGTH.postalCode },
    country: { type: String, default: null, maxlength: LENGTH.country },
  },
  notes: { type: String, default: null, maxlength: LENGTH.notes },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

contactSchema.path('emails').validate(function (value: unknown[]) {
  return Array.isArray(value) && value.length <= LENGTH.contactItemsMax;
}, `Emails cannot exceed ${LENGTH.contactItemsMax} items`);

contactSchema.path('phones').validate(function (value: unknown[]) {
  return Array.isArray(value) && value.length <= LENGTH.contactItemsMax;
}, `Phones cannot exceed ${LENGTH.contactItemsMax} items`);

contactSchema.index({ ownerId: 1, emails: 1 });
contactSchema.index({ ownerId: 1, phones: 1 });

export const Contact = model<IContact>('Contacts', contactSchema);
