// - Timeline Remove
// - AutomationLine -> Force Completed
// // Find the progress automation_lines
// // Remove the timelines
// // update the automation line to "force completed"

// - Deal with contacts remove
// - When delete them, please remove the following data together..
// // find the deals
// // call the deal remove helper function

const mongoose = require('mongoose');
const { ENV_PATH } = require('../../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../src/configs/database');

const Timeline = require('../../src/models/time_line');
const AutomationLine = require('../../src/models/automation_line');
const Deal = require('../../src/models/deal');
const DealHelper = require('../../src/helpers/deal');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    completeAutomationLine();
    removeDeals();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const completeAutomationLine = async () => {
  const automationLines = await Timeline.aggregate([
    {
      $group: {
        _id: '$automation_line',
        statuses: { $push: '$status' },
        created_at: { $last: '$created_at' },
        user: { $last: '$user' },
        progress_count: {
          $sum: {
            $cond: {
              if: { $eq: ['$status', 'progress'] },
              then: 1,
              else: 0,
            },
          },
        },
        pending_count: {
          $sum: {
            $cond: {
              if: { $eq: ['$status', 'pending'] },
              then: 1,
              else: 0,
            },
          },
        },
        active_count: {
          $sum: {
            $cond: { if: { $eq: ['$status', 'active'] }, then: 1, else: 0 },
          },
        },
        checking_count: {
          $sum: {
            $cond: {
              if: { $eq: ['$status', 'checking'] },
              then: 1,
              else: 0,
            },
          },
        },
        pending_checking_count: {
          $sum: {
            $cond: {
              if: { $in: ['$status', ['pending', 'checking']] },
              then: 1,
              else: 0,
            },
          },
        },
      },
    },
    {
      $match: {
        progress_count: { $gte: 1 },
        active_count: 0,
        created_at: { $lte: new Date(Date.now() - 86400000) },
      },
    },
    { $sort: { created_at: -1 } },
  ]);
  const lineIds = automationLines.map((e) => e._id);
  await Timeline.deleteMany({ automation_line: { $in: lineIds } });
  console.log('removed the timeline');
  await AutomationLine.updateMany(
    { _id: { $in: lineIds } },
    { $set: { status: 'completed' } }
  );
  console.log('updated the status of automation line');
  console.log('completed');
};

const removeDeals = async () => {
  const deals = await Deal.aggregate([
    {
      $lookup: {
        from: 'contacts',
        localField: 'contacts',
        foreignField: '_id',
        as: 'details',
      },
    },
    { $match: { details: { $size: 0 } } },
    { $sort: { created_at: -1 } },
  ]);

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    await DealHelper.remove(deal.user, deal._id).catch((e) => {
      console.log('remove is failed');
    });
    console.log('remove the deal', i, deal._id);
  }
};
