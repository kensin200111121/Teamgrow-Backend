const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
require('../configureSentry');
const mongoose = require('mongoose');
const CronJob = require('cron').CronJob;
const moment = require('moment-timezone');
const Task = require('../src/models/task');
const Activity = require('../src/models/activity');
const Text = require('../src/models/text');
const EmailHelper = require('../src/helpers/email');
const TextHelper = require('../src/helpers/text');
const { giveRateContacts } = require('../src/helpers/contact');
const AutomationHelper = require('../src/helpers/automation');
const { v1: uuidv1 } = require('uuid');
const _ = require('lodash');
const { DB_PORT } = require('../src/configs/database');
const { activeNext } = require('../src/helpers/task');
const { triggerTimeline } = require('../src/services/time_line');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const runTaskTimeline = async (task) => {
  const action = task['action'];
  let data;
  if (!action) {
    throw new Error('No deal exists');
  }
  switch (task.type) {
    case 'send_email': {
      data = {
        ...action,
        user: task.user,
        contacts: task.contacts,
        toEmails: task.receivers,
      };
      let email_id;
      await EmailHelper.sendEmail(data)
        .then(async (res) => {
          // giveRateContacts({ user: [timeline.user] }, timeline.contacts);
          // Getting task exec status
          const errors = [];
          const succeedContactIds = [];
          let notRunnedContactIds = [];
          const runnedContactIds = [];
          const failedContactIds = [];
          res.forEach((_res) => {
            if (!_res.status) {
              errors.push({
                contact: _res.contact,
                error: _res.error,
              });
              _res.contact &&
                _res.contact._id &&
                failedContactIds.push(_res.contact._id);
            } else {
              succeedContactIds.push(_res.contact._id);
            }
            if (_res.contact && _res.contact._id) {
              runnedContactIds.push(_res.contact._id);
            }
            if (_res.email) email_id = _res.email;
          });
          if (res.length !== task.contacts.length) {
            notRunnedContactIds = _.differenceBy(
              task.contacts,
              runnedContactIds,
              (e) => e + ''
            );
          }
          let activity;
          if (task.deal) {
            const activity_content = 'sent email';
            const deal_activity = new Activity({
              user: task.user,
              content: activity_content,
              deals: task.deal,
              type: 'emails',
              emails: email_id,
              subject: action.subject,
              videos: action.video_ids,
              pdfs: action.pdf_ids,
              images: action.image_ids,
            });
            deal_activity.save().catch((err) => {
              console.log('activity save err', err.message);
            });
            activity = deal_activity._id;
          } else {
            activity = res[0].data;
          }
          EmailHelper.updateUserCount(
            task.user,
            res.length - errors.length
          ).catch((err) => {
            console.log('Update user email count failed.', err);
          });
          // Current Task Update with the running result
          const exec_result = {
            failed: [...errors],
            succeed: succeedContactIds,
            notExecuted: notRunnedContactIds,
          };

          await Task.updateOne(
            { _id: task._id },
            { $set: { status: 'completed', exec_result } }
          ).catch((err) => {
            console.log('complete error', err);
          });

          if (task.source === 'automation') {
            const result = {
              res,
              activity,
              deal: task.deal,
            };

            triggerTimeline({
              userId: task.user,
              type: 'bulk_email',
              timeline_id: task.process,
              result,
            });
          }
        })
        .catch((err) => {
          console.log('Sending Email error', err);
          Task.updateOne(
            { _id: task?._id },
            {
              $set: { status: 'error', error_message: err?.message },
              $push: { 'exec_result.failed': task?.contacts },
            }
          ).catch((err) => {
            console.log('task update err', err.message);
          });
        });
      break;
    }
    case 'send_text': {
      data = {
        ...action,
        user: task.user,
        contacts: task.contacts,
        toPhones: task.receivers,
      };

      await TextHelper.sendText(data)
        .then(async (_res) => {
          let sentCount = 0;
          const errors = [];
          const succeed = [];
          const failed = [];
          const sendStatus = {};
          const invalidContacts = [];
          const textResult = _res.splice(-1);
          _res.forEach((e) => {
            if (!e.status && !e.type) {
              errors.push(e);
              if (e.contact && e.contact._id) {
                failed.push(e.contact._id);
              }
            }
            if (e.isSent || e.status) {
              sentCount++;
            }
            if (e.delivered && e.contact && e.contact._id) {
              succeed.push(e.contact._id);
            }
            if (e.sendStatus) {
              if (e.contact && e.contact._id) {
                sendStatus[e.contact._id] = e.sendStatus;
              }
            } else if (!e.status) {
              if (e.contact && e.contact._id) {
                invalidContacts.push(e.contact._id);
              }
            }
          });
          if (textResult && textResult[0] && textResult[0]['text']) {
            const query = { $set: { send_status: sendStatus } };
            if (invalidContacts && invalidContacts.length) {
              query['$pull'] = { contacts: { $in: invalidContacts } };
            }
            if (invalidContacts.length === task.contacts.length) {
              Text.deleteOne({ _id: textResult[0]['text'] }).catch((err) => {
                console.log('remove texting is failed', err);
              });
            } else {
              Text.updateOne({ _id: textResult[0]['text'] }, query).catch(
                (err) => {
                  console.log('texting result saving is failed', err);
                }
              );
            }
          }
          const exec_result = {
            succeed,
            errors,
            failed,
          };

          await Task.updateOne(
            { _id: task._id },
            { $set: { status: 'completed', exec_result } }
          ).catch((err) => {
            console.log('complete error', err);
          });
        })
        .catch((err) => {
          console.log('Sending SMS error', err);
          Task.updateOne(
            { _id: task?._id },
            {
              $set: { status: 'error', error_message: err?.message },
              $push: { 'exec_result.failed': task?.contacts },
            }
          ).catch((err) => {
            console.log('task update err', err.message);
          });
        });
      break;
    }
  }
};

const task_check = new CronJob(
  '* * * * *',
  async () => {
    const due_date = new Date();

    const tasks = await Task.find({
      status: 'active',
      due_date: { $lte: due_date },
      user: {
        $nin: [
          mongoose.Types.ObjectId('63b6ec5db199d3535de0f616'), // Wang
          mongoose.Types.ObjectId('65f87caa392e882876fedf84'), // JingFei
          // mongoose.Types.ObjectId('5fd97ad994cf273d68a016da'), // Super
          mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'), // Rui
          // mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'), // Wu
        ],
      },
    });
    // Task as Progressing to prevent the long runtime issue
    if (tasks.length) {
      const tasksIds = tasks.map((e) => e._id);
      await Task.updateMany(
        {
          _id: { $in: tasksIds },
        },
        {
          $set: { status: 'progress' },
        }
      ).catch((err) => {
        console.log('timeline update progress', err.message);
      });
    }

    if (tasks) {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        try {
          await runTaskTimeline(task);
        } catch (err) {
          await Task.updateOne(
            {
              _id: task._id,
            },
            {
              $set: { status: 'error', error_message: err.message },
            }
          ).catch(async (err) => {
            console.log('update timeline status error', err.message);
          });
        }
        try {
          await activeNext(task);
        } catch (err) {
          console.log('activeNext task error: ', err);
        }
      }
    }
  },
  () => {
    console.log('Task check Job finished.');
  },
  false,
  'US/Central'
);

task_check.start();
