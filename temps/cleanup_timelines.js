/**
 * Author: Jian
 * Date: Nov 20, 2024
 * Clean up the timelines of the automation_lines that doesn't have any active, progress, pending timeline
 * Because the automation_line data couldn't be found.
 */
const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const Timeline = require('../src/models/time_line');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    migrate();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrate = () => {
  Timeline.aggregate([
    {
      $group: {
        _id: '$automation_line',
        statuses: { $push: '$status' },
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
        times: {
          $push: '$updated_at',
        },
        created: {
          $first: '$created_at',
        },
      },
    },
    { $match: { progress_count: { $gte: 1 }, active_count: 0 } },
    {
      $lookup: {
        from: 'automation_lines',
        localField: '_id',
        foreignField: '_id',
        as: 'automation_line',
      },
    },
    {
      $sort: { created: -1 },
    },
  ]).then(async (_timelines) => {
    for (let i = 0; i < _timelines.length; i++) {
      if (_timelines[i].automation_line?.length) {
        continue;
      }
      console.log(
        'Remove the timelines because the automation_line does not exist.'
      );
      await Timeline.deleteMany({ automation_line: _timelines[i]._id }).then(
        (_res) => {
          console.log('removed them successfully', _res);
        }
      );
    }
  });
};
