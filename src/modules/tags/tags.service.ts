import { FilterQuery } from 'mongoose';
import { CreateTagInput, ITag, ListTagsQuery, UpdateTagInput } from './tags.interface';
import { Tag } from './tags.model';

const TAG_FIELDS = [
  '_id',
  'ownerId',
  'name',
  'color',
  'description',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createRegex = (value: string) => new RegExp(escapeRegExp(value.trim()), 'i');

const hasDuplicateName = async (ownerId: string, name: string, excludeId?: string) => {
  const exactNameRegex = new RegExp(`^${escapeRegExp(name.trim())}$`, 'i');

  const filter: Record<string, unknown> = {
    ownerId,
    name: exactNameRegex,
    deletedAt: null,
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const existing = await Tag.findOne(filter).select('_id');
  return Boolean(existing);
};

export const createTag = async (payload: CreateTagInput) => {
  if (await hasDuplicateName(payload.ownerId, payload.name)) {
    return { status: 'duplicate_name' as const };
  }

  const tag = await Tag.create(payload);
  return { status: 'ok' as const, tag };
};

export const listTags = async (ownerId: string, query: ListTagsQuery) => {
  const conditions: FilterQuery<ITag>[] = [{ ownerId, deletedAt: null }];

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

  const [tags, total] = await Promise.all([
    Tag.find(filter)
      .select(TAG_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    Tag.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    tags,
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

export const getTagById = async (ownerId: string, tagId: string) => {
  const tag = await Tag.findOne({
    _id: tagId,
    ownerId,
    deletedAt: null,
  }).select(TAG_FIELDS);

  return tag;
};

export const updateTag = async (ownerId: string, tagId: string, updates: UpdateTagInput) => {
  if (updates.name !== undefined && await hasDuplicateName(ownerId, updates.name, tagId)) {
    return { status: 'duplicate_name' as const };
  }

  const tag = await Tag.findOneAndUpdate(
    {
      _id: tagId,
      ownerId,
      deletedAt: null,
    },
    updates,
    { new: true }
  ).select(TAG_FIELDS);

  if (!tag) {
    return { status: 'not_found' as const };
  }

  return { status: 'ok' as const, tag };
};

export const deleteTag = async (ownerId: string, tagId: string, deletedBy: string) => {
  const tag = await Tag.findOneAndUpdate(
    {
      _id: tagId,
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

  return tag;
};
