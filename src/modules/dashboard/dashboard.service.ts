import { Types } from 'mongoose';
import { Contact } from '../contacts/contact.model';
import { Deal } from '../deals/deal.model';
import { Task } from '../tasks/task.model';

const getMonthRange = (baseDate = new Date()) => {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
  return { start, end };
};

const formatRecentDeal = (deal: any) => {
  const dealObj = typeof deal?.toObject === 'function' ? deal.toObject() : deal;
  const pipeline = dealObj?.pipelineId && typeof dealObj.pipelineId === 'object' ? dealObj.pipelineId : null;
  const contact = dealObj?.contactId && typeof dealObj.contactId === 'object' ? dealObj.contactId : null;
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  const matchedStage = stages.find((stage: any) => String(stage?._id) === String(dealObj?.stageId));

  return {
    _id: dealObj._id,
    title: dealObj.title,
    amount: dealObj.amount ?? null,
    status: dealObj.status,
    expectedCloseDate: dealObj.expectedCloseDate ?? null,
    createdAt: dealObj.createdAt,
    wonAt: dealObj.wonAt ?? null,
    lostAt: dealObj.lostAt ?? null,
    pipeline: pipeline
      ? {
          _id: pipeline._id,
          name: pipeline.name,
        }
      : null,
    stage: matchedStage
      ? {
          _id: matchedStage._id,
          name: matchedStage.name,
          color: matchedStage.color ?? null,
          order: matchedStage.order,
        }
      : null,
    contact: contact
      ? {
          _id: contact._id,
          name: `${contact.firstName || ''}${contact.lastName ? ` ${contact.lastName}` : ''}`.trim() || null,
          companyName: contact.companyName ?? null,
        }
      : null,
  };
};

const formatRecentTask = (task: any) => {
  const taskObj = typeof task?.toObject === 'function' ? task.toObject() : task;
  const assignee = taskObj?.assignedTo && typeof taskObj.assignedTo === 'object' ? taskObj.assignedTo : null;

  return {
    _id: taskObj._id,
    title: taskObj.title,
    status: taskObj.status,
    priority: taskObj.priority,
    dueDate: taskObj.dueDate ?? null,
    createdAt: taskObj.createdAt,
    assignedTo: assignee
      ? {
          _id: assignee._id,
          name: assignee.fullName,
          email: assignee.email,
          role: assignee.role,
        }
      : null,
  };
};

export const getDashboardOverview = async (ownerId: string, recentLimit = 5) => {
  const ownerObjectId = new Types.ObjectId(ownerId);
  const { start: monthStart, end: monthEnd } = getMonthRange();

  const [
    dealCounts,
    wonThisMonth,
    lostThisMonth,
    recentDeals,
    totalContacts,
    recentContacts,
    recentTasks,
  ] = await Promise.all([
    Deal.aggregate([
      {
        $match: {
          ownerId: ownerObjectId,
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [{ $eq: ['$status', 'open'] }, 1, 0],
            },
          },
          won: {
            $sum: {
              $cond: [{ $eq: ['$status', 'won'] }, 1, 0],
            },
          },
          lost: {
            $sum: {
              $cond: [{ $eq: ['$status', 'lost'] }, 1, 0],
            },
          },
        },
      },
    ]),
    Deal.aggregate([
      {
        $match: {
          ownerId: ownerObjectId,
          deletedAt: null,
          status: 'won',
          wonAt: { $gte: monthStart, $lt: monthEnd },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]),
    Deal.aggregate([
      {
        $match: {
          ownerId: ownerObjectId,
          deletedAt: null,
          status: 'lost',
          lostAt: { $gte: monthStart, $lt: monthEnd },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]),
    Deal.find({ ownerId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(recentLimit)
      .populate({ path: 'pipelineId', select: '_id name stages' })
      .populate({ path: 'contactId', select: '_id firstName lastName companyName' }),
    Contact.countDocuments({ ownerId, deletedAt: null }),
    Contact.find({ ownerId, deletedAt: null })
      .select('_id firstName lastName photoUrl companyName status leadSource createdAt')
      .sort({ createdAt: -1 })
      .limit(recentLimit)
      .lean(),
    Task.find({ ownerId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(recentLimit)
      .populate({ path: 'assignedTo', select: '_id fullName email role' }),
  ]);

  const dealCountsData = dealCounts[0] || { total: 0, open: 0, won: 0, lost: 0 };
  const wonThisMonthData = wonThisMonth[0] || { count: 0, amount: 0 };
  const lostThisMonthData = lostThisMonth[0] || { count: 0, amount: 0 };
  const decidedDealsThisMonth = wonThisMonthData.count + lostThisMonthData.count;

  return {
    summary: {
      deals: {
        total: dealCountsData.total,
        open: dealCountsData.open,
        won: dealCountsData.won,
        lost: dealCountsData.lost,
      },
      wonThisMonth: {
        count: wonThisMonthData.count,
        amount: wonThisMonthData.amount,
      },
      wonLostComparison: {
        wonCount: wonThisMonthData.count,
        lostCount: lostThisMonthData.count,
        wonAmount: wonThisMonthData.amount,
        lostAmount: lostThisMonthData.amount,
        winRate: decidedDealsThisMonth > 0 ? Number(((wonThisMonthData.count / decidedDealsThisMonth) * 100).toFixed(2)) : 0,
      },
      contacts: {
        total: totalContacts,
      },
    },
    recentDeals: recentDeals.map((deal) => formatRecentDeal(deal)),
    recentContacts: recentContacts.map((contact) => {
      const contactItem = contact as any;

      return {
        _id: contactItem._id,
        firstName: contactItem.firstName,
        lastName: contactItem.lastName ?? null,
        name: `${contactItem.firstName}${contactItem.lastName ? ` ${contactItem.lastName}` : ''}`.trim(),
        photoUrl: contactItem.photoUrl ?? null,
        companyName: contactItem.companyName ?? null,
        status: contactItem.status,
        leadSource: contactItem.leadSource,
        createdAt: contactItem.createdAt ?? null,
      };
    }),
    recentTasks: recentTasks.map((task) => formatRecentTask(task)),
  };
};
