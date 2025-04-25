/**
 * Author: Ming Zhe
 * Functionality:
 *  Sphere functionality to register the missed everyday conversations.
 *  And after a few days, missed information should be reseted.
 */
const mongoose = require('mongoose');
const CronJob = require('cron').CronJob;

const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
require('../configureSentry');
const User = require('../src/models/user');
const ShereBucket = require('../src/models/sphere_bucket');
const { sendErrorToSentry } = require('../src/helpers/utility');
const moment = require('moment-timezone');
const SphereRelationship = require('../src/models/sphere_relationship');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const sphere = new CronJob(
  '*/15 * * * *',
  async () => {
    console.log('--- sphere daily start ---', new Date().toISOString());
    User.find({
      del: false,
    }).then((_users) => {
      _users.forEach((_user) => {
        ShereBucket.find({
          user: _user._id,
        }).then(async (_buckets) => {
          if (!_buckets.length) {
            console.log('Buckets not found');
          } else {
            const MAX_MISSED_DURATION = 4;
            const MIN_MISSED_DURATION = 1;
            const priorityQuery = [];
            const activeMissedQuery = [];
            const missedQuery = [];
            _buckets.forEach((e) => {
              const contactedAtStart = moment()
                .clone()
                .subtract(e.duration + MAX_MISSED_DURATION, 'day')
                .startOf('day')
                .toDate();
              const contactedAtEnd = moment()
                .clone()
                .subtract(e.duration + MIN_MISSED_DURATION, 'day')
                .endOf('day')
                .toDate();
              const activeContactedAtStart = moment()
                .clone()
                .subtract(e.duration, 'day')
                .startOf('day')
                .toDate();
              const activeContactededAtEnd = moment()
                .clone()
                .subtract(e.duration, 'day')
                .endOf('day')
                .toDate();

              activeMissedQuery.push({
                sphere_bucket_id: e._id,
                contacted_at: {
                  $gte: contactedAtStart,
                  $lte: contactedAtEnd,
                },
                action_score: { $in: [2, 3] },
              });

              priorityQuery.push({
                sphere_bucket_id: e._id,
                contacted_at: {
                  $gte: activeContactedAtStart,
                  $lte: activeContactededAtEnd,
                },
              });

              const contactedAtLimit = moment()
                .clone()
                .subtract(e.duration + MAX_MISSED_DURATION + 1, 'day')
                .endOf('day')
                .toDate();

              missedQuery.push({
                sphere_bucket_id: e._id,
                contacted_at: { $lte: contactedAtLimit },
              });
            });

            // Priority (type = 1)
            const priorityItems = await SphereRelationship.find({
              $or: priorityQuery,
              user: _user._id,
              should_contact: { $ne: true },
            });
            const today = moment();
            for (let i = 0; i < priorityItems.length; i++) {
              const _bucket = _buckets.filter(
                (e) => e._id === priorityItems[i].sphere_bucket_id
              );
              const bucket_score = _bucket?.score || 0;
              const action_score = priorityItems[i].action_score;
              const business_score =
                bucket_score + action_score * _buckets.length;
              await SphereRelationship.updateOne(
                {
                  _id: priorityItems[i]._id,
                },
                {
                  $set: {
                    type: 1,
                    business_score,
                  },
                }
              );
            }

            // First (type = 2)
            const activeMissedItems = await SphereRelationship.find({
              $or: activeMissedQuery,
              user: _user._id,
              should_contact: { $ne: true },
            });
            for (let i = 0; i < activeMissedItems.length; i++) {
              const _bucket = _buckets.filter(
                (e) => e._id === activeMissedItems[i].sphere_bucket_id
              );
              const bucket_score = _bucket?.score || 0;
              const duration = _bucket?.duration || 1;
              const action_score = activeMissedItems[i].action_score;
              const standard_business_score =
                bucket_score + action_score * _buckets.length;
              const duration_end = moment(activeMissedItems[i].contacted_at)
                .clone()
                .add(duration, 'day')
                .endOf('day')
                .toDate();
              const missed_duration = today.diff(duration_end, 'days');
              const business_score =
                standard_business_score + 100 * missed_duration;
              await SphereRelationship.updateOne(
                {
                  _id: activeMissedItems[i]._id,
                },
                {
                  $set: {
                    type: 2,
                    business_score,
                  },
                }
              );
            }

            // Missed (type = 3)
            const missedItems = await SphereRelationship.find({
              $or: missedQuery,
              user: _user._id,
              should_contact: { $ne: true },
            });
            for (let i = 0; i < missedItems.length; i++) {
              const _bucket = _buckets.filter(
                (e) => e._id === missedItems[i].sphere_bucket_id
              );
              const bucket_score = _bucket?.score || 0;
              const action_score = missedItems[i].action_score;
              const business_score =
                bucket_score + action_score * _buckets.length;
              await SphereRelationship.updateOne(
                {
                  _id: missedItems[i]._id,
                },
                {
                  $set: {
                    type: 3,
                    business_score,
                  },
                }
              );
            }
          }
        });
      });
    });
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

sphere.start();
