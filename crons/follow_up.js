const mongoose = require('mongoose');
const CronJob = require('cron').CronJob;
const Garbage = require('../src/models/garbage');
const FollowUp = require('../src/models/follow_up');
const Deal = require('../src/models/deal');
const User = require('../src/models/user');
const Contact = require('../src/models/contact');
const moment = require('moment-timezone');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
require('../configureSentry');
const { DB_PORT } = require('../src/configs/database');
const Appointment = require('../src/models/appointment');
const { createNotification } = require('../src/services/notificaton');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const task_reminder = new CronJob(
  '*/5 * * * 0-6',
  async () => {
    const due_date = new Date();
    const reminder_array = await FollowUp.find({
      remind_at: { $exists: true, $lte: due_date },
      status: 0,
    }).catch((err) => {
      console.log('followup find err', err.message);
    });

    for (let i = 0; i < reminder_array.length; i++) {
      const follow_up = reminder_array[i];
      const user = await User.findOne({
        _id: follow_up.user,
        del: false,
      }).catch((err) => {
        console.log('err: ', err);
      });
      if (!user) {
        continue;
      }
      if (!follow_up.contact) {
        continue;
      }

      if (follow_up.is_full) {
        continue;
      }

      const contact = await Contact.findOne({
        _id: follow_up.contact,
      }).catch((err) => {
        console.log('contact found err: ', err.message);
      });

      if (!contact) {
        continue;
      }
      let deal;
      if (follow_up.shared_follow_up) {
        const deal_follow_up = await FollowUp.findOne({
          _id: follow_up.shared_follow_up,
        }).catch((err) => {
          console.log('deal follow up found err: ', err.message);
        });

        if (deal_follow_up) {
          deal = await Deal.findOne({
            _id: deal_follow_up.deal,
          }).catch((err) => {
            console.log('deal found err: ', err.message);
          });
        }
      }

      createNotification({
        type: 'task_reminder',
        notification: {
          criteria: 'task_reminder',
          contact,
          task: follow_up,
          deal,
        },
        userId: user._id,
      });

      FollowUp.updateOne(
        {
          _id: follow_up.id,
        },
        {
          $set: { status: 2 },
        }
      ).catch((err) => {
        console.log('follow up update err', err.message);
      });

      if (follow_up.set_recurrence && follow_up.parent_follow_up) {
        const recurring_follow_up = await FollowUp.findOne({
          user: follow_up.user,
          _id: follow_up.parent_follow_up,
        });

        if (!recurring_follow_up) {
          continue;
        }

        const garbage = await Garbage.findOne({
          user: follow_up.user,
        }).catch((err) => {
          console.log('err', err);
        });
        let reminder_before = 30;
        if (garbage) {
          reminder_before = garbage.reminder_before;
        }

        let update_date;
        if (follow_up.timezone) {
          update_date = moment
            .tz(follow_up.due_date, follow_up.timezone)
            .clone();
        } else {
          update_date = moment(follow_up.due_date).clone();
        }

        let max_date = update_date.clone().add(6, 'weeks').endOf('weeks');

        if (
          recurring_follow_up &&
          recurring_follow_up.recurrence_date &&
          moment(recurring_follow_up.recurrence_date).isBefore(max_date.clone())
        ) {
          max_date = moment(recurring_follow_up.recurrence_date);
        }
        while (max_date.isAfter(update_date)) {
          switch (follow_up.recurrence_mode) {
            case 'DAILY': {
              update_date.add(1, 'days');
              break;
            }
            case 'WEEKLY': {
              update_date.add(7, 'days');
              break;
            }
            case 'MONTHLY': {
              update_date.add(1, 'months');
              break;
            }
            case 'YEARLY': {
              update_date.add(1, 'years');
              break;
            }
          }

          let deleted;
          if (recurring_follow_up.deleted_due_dates) {
            deleted = recurring_follow_up.deleted_due_dates.some((e) => {
              return update_date.clone().isSame(moment(e));
            });
          } else {
            deleted = false;
          }

          const existing = await FollowUp.findOne({
            user: follow_up.user,
            parent_follow_up: follow_up.parent_follow_up,
            due_date: update_date.clone(),
          });

          if (!deleted && !existing) {
            delete follow_up._doc._id;
            const new_follow_up = new FollowUp({
              ...follow_up._doc,
              status: 0,
              due_date: update_date.clone(),
              remind_at:
                follow_up.deal || follow_up.is_full
                  ? undefined
                  : update_date.clone().subtract(reminder_before, 'minutes'),
            });
            new_follow_up.save().catch((err) => {
              console.log('new followup save err', err.message);
            });
          }
        }
      }
    }
  },

  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const monthly_task_recurrence_adjust = new CronJob(
  '*/10 * * * 0-6',
  async () => {
    const today = moment();
    const after2Weeks = moment().clone().add(2, 'weeks').endOf('weeks');

    const monthly_recurrence_array = await FollowUp.find({
      $or: [
        {
          due_date: { $exists: true },
          recurrence_mode: 'MONTHLY',
          set_recurrence: true,
          status: 0,
        },
        {
          parent_follow_up: { $exists: false },
          deleted_due_dates: { $elemMatch: { $gte: today, $lte: after2Weeks } },
          recurrence_mode: 'MONTHLY',
          set_recurrence: true,
        },
      ],
    }).catch((err) => {
      console.log('followup find err', err.message);
    });

    for (let i = 0; i < monthly_recurrence_array.length; i++) {
      const follow_up = monthly_recurrence_array[i];
      const user = await User.findOne({
        _id: follow_up.user,
        del: false,
      }).catch((err) => {
        console.log('err: ', err);
      });

      if (!user) {
        continue;
      }

      if (!follow_up.contact) {
        continue;
      }

      if (follow_up.is_full) {
        continue;
      }

      const contact = await Contact.findOne({
        _id: follow_up.contact,
      }).catch((err) => {
        console.log('contact found err: ', err.message);
      });

      if (!contact) {
        continue;
      }

      const garbage = await Garbage.findOne({
        user: follow_up.user,
      }).catch((err) => {
        console.log('err', err);
      });
      let reminder_before = 30;
      if (garbage) {
        reminder_before = garbage.reminder_before;
      }

      let max_date = today.clone().add(6, 'weeks').endOf('weeks');
      let update_date;
      let recurring_follow_up;

      // if child followup list
      if (follow_up.parent_follow_up) {
        recurring_follow_up = await FollowUp.findOne({
          user: follow_up.user,
          _id: follow_up.parent_follow_up,
        });

        if (!recurring_follow_up) {
          continue;
        }

        if (follow_up.timezone) {
          update_date = moment
            .tz(follow_up.due_date, follow_up.timezone)
            .clone();
        } else {
          update_date = moment(follow_up.due_date).clone();
        }
      } else {
        // if parent followup list
        recurring_follow_up = follow_up;
        const deleted_due_dates = recurring_follow_up.deleted_due_dates;
        const _temp_due_date = deleted_due_dates.filter(
          (e) => e > today && e < after2Weeks
        );
        if (recurring_follow_up.timezone) {
          update_date = moment
            .tz(_temp_due_date, recurring_follow_up.timezone)
            .clone();
        } else {
          update_date = moment(_temp_due_date).clone();
        }
      }

      if (
        recurring_follow_up &&
        recurring_follow_up.recurrence_date &&
        moment(recurring_follow_up.recurrence_date).isBefore(max_date.clone())
      ) {
        max_date = moment(recurring_follow_up.recurrence_date);
      }

      while (max_date.isAfter(update_date)) {
        update_date.add(1, 'months');

        let deleted;
        if (recurring_follow_up.deleted_due_dates) {
          deleted = recurring_follow_up.deleted_due_dates.some((e) => {
            return update_date.clone().isSame(moment(e));
          });
        } else {
          deleted = false;
        }

        const existing = await FollowUp.findOne({
          user: follow_up.user,
          parent_follow_up: follow_up.parent_follow_up,
          due_date: update_date.clone(),
        });

        if (!deleted && !existing) {
          delete follow_up._doc._id;
          const new_follow_up = new FollowUp({
            ...follow_up._doc,
            status: 0,
            due_date: update_date.clone(),
            remind_at:
              follow_up.deal || follow_up.is_full
                ? undefined
                : update_date.clone().subtract(reminder_before, 'minutes'),
          });
          new_follow_up.save().catch((err) => {
            console.log('new followup save err', err.message);
          });
        }
      }
    }
  },

  function () {
    console.log('Montly Adjustment Job finished.');
  },
  false,
  'US/Central'
);

const scheduler_job = new CronJob(
  '*/5 * * * 0-6',
  async () => {
    const due_date = new Date();
    due_date.setSeconds(0);
    due_date.setMilliseconds(0);
    const reminder_array = await Appointment.find({
      type: 2,
      status: 0,
      remind_at: { $lte: due_date },
    }).catch((err) => {
      console.log('appointment find err', err.message);
    });
    for (let i = 0; i < reminder_array.length; i++) {
      const appointment = reminder_array[i];
      const user = await User.findOne({
        _id: appointment.user,
        del: false,
      }).catch((err) => {
        console.log('err: ', err);
      });

      if (!user) {
        continue;
      }
      if (appointment.contacts && appointment.contacts[0]) {
        const contact = await Contact.findOne({
          _id: appointment.contacts[0],
        }).catch((err) => {
          console.log('contact found err: ', err.message);
        });

        if (contact) {
          const user_contact = {
            ...user._doc,
            first_name: user.user_name.split(' ')[0],
            last_name: user.user_name.split(' ')[1] || '',
          };

          createNotification({
            type: 'scheduler_reminder',
            notification: {
              criteria: 'scheduler_reminder',
              contact,
              appointment,
              to_address: user.email,
              desktop_notification: true,
            },
            userId: user._id,
          });

          createNotification({
            type: 'scheduler_reminder',
            notification: {
              criteria: 'scheduler_reminder',
              contact: user_contact,
              appointment,
              to_address: contact.email,
              desktop_notification: false,
            },
            userId: user._id,
          });
        } else {
          // console.log('user', user);
          // console.log('contacts', appointment.contacts);
          continue;
        }
      }

      Appointment.updateOne(
        {
          _id: appointment._id,
        },
        {
          $set: { status: 1 },
        }
      ).catch((err) => {
        console.log('appointment update err', err.message);
      });
    }
  },
  function () {
    console.log('Scheduler Reminder Job finished.');
  },
  false,
  'US/Central'
);

task_reminder.start();
monthly_task_recurrence_adjust.start();
scheduler_job.start();
