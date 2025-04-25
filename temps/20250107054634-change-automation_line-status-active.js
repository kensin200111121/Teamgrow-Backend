/**
 * Assigned automations are paused because text send status hook doesnt work well.
 * Migrated the paused automations to resume again.
 */
const { calcDueDate } = require('../src/helpers/utility');
const mongoose = require('mongoose');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

const TimeLine = require('../src/models/time_line');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('connected successfully');
    changeAutomationLineStatusActive();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const changeAutomationLineStatusActive = async () => {
  const automationLines = await TimeLine.aggregate([
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
        pending_count: { $gte: 1 },
        checking_count: 0,
        active_count: 0,
        created_at: { $lte: new Date(Date.now() - 86400000) },
        // you can remove the created-at checking, and add executed_count, paused_count checking logic later.
      },
    },
    { $sort: { created_at: -1 } },
  ]);

  console.log('count of issued timelines', automationLines.length);
  for (const line of automationLines) {
    console.log('active next ...');
    const lastCompletedItems = await TimeLine.find(
      {
        automation_line: line._id,
        status: 'completed',
      },
      {},
      { sort: { due_date: -1 } }
    );

    if (lastCompletedItems[0]) {
      console.log('active next started ...');
      await activeNext(lastCompletedItems[0]);
      console.log('active next completed ...');
    }
  }
};

const activeNext = async (time_line) => {
  const { ref, automation_line } = time_line;
  if (!automation_line) return { status: false, error: 'no automation line' };
  const timelines = await TimeLine.find({
    automation_line,
    status: 'pending',
    parent_ref: ref,
  }).limit(2);

  for (let i = 0; i < timelines.length; i++) {
    const timeline = timelines[i];

    if (timeline.condition && timeline.condition.answer === true) {
      await TimeLine.updateOne(
        {
          _id: timeline.id,
        },
        {
          $set: {
            status: 'checking',
          },
        }
      ).catch((err) => {
        console.log('timeline update err', err.message);
      });
    } else {
      const due_date = await calcDueDate(timeline);
      await TimeLine.updateOne(
        {
          _id: timeline._id,
        },
        {
          $set: {
            status: 'active',
            due_date,
          },
        }
      ).catch((err) => {
        console.log('timeline update err', err.message);
      });
    }
  }
  return { status: true };
};
