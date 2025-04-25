const mongoose = require('mongoose');
const CronJob = require('cron').CronJob;
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');
require('../configureSentry');
const Note = require('../src/models/note');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));
const api = require('../src/configs/api');
const system_settings = require('../src/configs/system_settings');
const Contact = require('../src/models/contact');
const User = require('../src/models/user');
const Activity = require('../src/models/activity');
const FollowUp = require('../src/models/follow_up');
const Labels = require('../src/constants/label');
const Garbage = require('../src/models/garbage');
const Team = require('../src/models/team');
const TimeLine = require('../src/models/time_line');
const Video = require('../src/models/video');
const EventType = require('../src/models/event_type');

const updateContacts = async () => {
  const admin = await User.findOne({
    email: system_settings.ONBOARD_ACCOUNT,
    del: false,
  }).catch((err) => {
    console.log('admin account found', err.message);
  });

  const adminContacts = await Contact.find({ user: admin.id }).catch((err) => {
    console.log('admin contact found err', err.message);
  });

  for (let i = 0; i < adminContacts.length; i++) {
    let label;
    const adminContact = adminContacts[i];

    if (adminContact.source) {
      const user = await User.findOne({
        _id: adminContact.source,
        del: false,
      }).catch((err) => {
        console.log('admin user found err', err.message);
      });

      if (!user) {
        Contact.updateOne(
          {
            _id: adminContact.id,
            user: admin.id,
          },
          {
            $set: { label: Labels[6].id },
          }
        ).catch((err) => {
          console.log('err', err.message);
        });

        // delete onboard automation
        await TimeLine.deleteMany({ contact: adminContact.id, user: admin.id });
        continue;
      }

      if (user.user_disabled) {
        Contact.updateOne(
          {
            _id: adminContact.id,
            user: admin.id,
          },
          {
            $set: {
              label: Labels[10].id,
            },
          }
        ).catch((err) => {
          console.log('err', err.message);
        });
        const content = {
          reason: user.close_reason,
          feedback: user.close_feedback,
          disabled_at: user.disabled_at,
        };
        const note = new Note({
          content: JSON.stringify(content, null, 2),
          contact: adminContact.id,
          user: admin.id,
        });

        note
          .save({
            timestamps: false,
          })
          .then(() => {
            console.log('cancel note created');
          })
          .catch((err) => {
            console.log('note save err', err.message);
          });
        // delete onboard automation
        await TimeLine.deleteMany({ contact: adminContact.id, user: admin.id });
        continue;
      }

      if (adminContact.tags.includes('unsubscribed')) {
        await TimeLine.deleteMany({ contact: adminContact.id, user: admin.id });
        continue;
      }

      const week_ago = new Date();
      const month_ago = new Date();
      const two_month_ago = new Date();

      week_ago.setDate(week_ago.getDate() - 7);
      month_ago.setMonth(month_ago.getMonth() - 1);
      two_month_ago.setMonth(two_month_ago.getMonth() - 2);

      if (user.last_logged) {
        const last_logged = new Date(user.last_logged);
        const created = new Date(user.created_at);

        if (created.getTime() > week_ago.getTime()) {
          // New
          label = Labels[1].id;
        } else if (last_logged.getTime() > week_ago.getTime()) {
          //  Hot
          label = Labels[5].id;
        } else if (last_logged.getTime() > month_ago.getTime()) {
          //  Warm
          label = Labels[4].id;
        } else {
          //  Cold
          label = Labels[2].id;
        }
      } else {
        //  Cold
        label = Labels[2].id;
      }

      const labelValue = user.source === 'vortex' ? undefined : label;

      const tags = [user.package_level];

      if (user.payment) {
        if (user.subscription && user.subscription.is_suspended) {
          tags.push('suspended');
        } else if (user.subscription && user.subscription.is_failed) {
          tags.push('payment_failed');
        } else {
          tags.push('active');
        }
      } else {
        tags.push('free');
      }

      // Get additional fields
      const additionalData = {};
      const additional_fields = [];
      const garbage = await Garbage.findOne({ user: user.id }).catch((err) => {
        console.log('err', err);
      });

      // garbage.additional_fields.forEach((field) => {
      //   additional_fields.push(field.name);
      // });

      if (user.dialer_info && user.dialer_info.is_enabled) {
        tags.push('dialer');
        // Dialer package
        const dialer_package = user.dialer_info.level;
        additionalData['dialer'] = dialer_package;
      }

      // Using Team
      const teams = Team.find({
        $or: [{ members: user.id }, { owner: user.id }, { editors: user.id }],
      });

      if (teams.length === 0) {
        additionalData['using_team'] = 'No';
      } else {
        additionalData['using_team'] = 'Yes';
      }
      // Add active automation running count info to contact
      const automation_info = user.automation_info;
      let active_automation_count = 0;
      if (automation_info['is_enabled']) {
        const timeline = await TimeLine.aggregate([
          {
            $match: {
              user: mongoose.Types.ObjectId(user._id),
            },
          },
          {
            $group: {
              _id: { contact: '$contact', deal: '$deal' },
              count: { $sum: 1 },
            },
          },
          {
            $project: { _id: 1 },
          },
          {
            $count: 'total',
          },
        ]);

        if (timeline[0] && timeline[0]['total']) {
          active_automation_count = timeline[0]['total'];
        }

        additionalData['active_automation'] = active_automation_count;
      }

      // Add contact count info to contact
      let contact_count = 0;
      contact_count = await Contact.countDocuments({ user: user.id });

      additionalData['contact_count'] = contact_count;

      // Add scheduler count to contact
      const scheduler_info = user.scheduler_info;
      let scheduler_count = 0;
      if (scheduler_info && scheduler_info['is_limit']) {
        scheduler_count = await EventType.countDocuments({
          user: user.id,
        });
      }

      additionalData['scheduler_count'] = scheduler_count;

      // Add video mins to contact (recording)
      const recordVideos = await Video.find({
        user: user.id,
        recording: true,
        del: false,
      });
      let recordDuration = 0;
      if (recordVideos && recordVideos.length > 0) {
        for (const recordVideo of recordVideos) {
          if (recordVideo.duration > 0) {
            recordDuration += recordVideo.duration;
          }
        }
      }
      additionalData['video_mins'] = recordDuration;

      if (!user.is_primary) {
        tags.push['sub_account'];
      }

      const update_data = {
        email: user.email,
        cell_phone: user.cell_phone,
        company: user.company,
        label: labelValue,
        tags,
        additional_field: additionalData,
      };

      Contact.updateOne(
        { source: adminContact.source, user: admin.id },
        { $set: update_data }
      )
        .then(() => {
          console.log('updated email', adminContact.email);
        })
        .catch((err) => {
          console.log('contact update error', err.message);
        });
    }
  }
};

const sourceUpdate = async () => {
  const admin = await User.findOne({ email: 'support@crmgrow.com' }).catch(
    (err) => {
      console.log('admin account found', err.message);
    }
  );

  const adminContacts = await Contact.find({ user: admin.id }).catch((err) => {
    console.log('admin contact found err', err.message);
  });
  for (let i = 0; i < adminContacts.length; i++) {
    const adminContact = adminContacts[i];
    const user = await User.findOne({
      email: adminContact.email,
      del: false,
    }).catch((err) => {
      console.log('admin user maching contact err ', err.message);
    });
    Contact.updateOne(
      { _id: adminContact.id },
      { $set: { source: user.id } }
    ).catch((err) => {
      console.log('contact update error', err.message);
    });
  }
};

const two_months = async () => {
  const two_month_ago = new Date();
  two_month_ago.setMonth(two_month_ago.getMonth() - 2);
  const users = await User.find({
    del: false,
    last_logged: { $lte: two_month_ago },
    $or: [{ payment: { $exists: false } }],
  }).catch((err) => {
    console.log('err', err.message);
  });

  // User.updateMany(
  //   {
  //     del: false,
  //     last_logged: { $lte: two_month_ago },
  //     $or: [{ payment: { $exists: false } }, { is_free: true }],
  //   },
  //   {
  //     $set: {
  //       'subscription.is_failed': true,
  //       'subscription.is_suspended': true,
  //     },
  //   }
  // ).catch((err) => {
  //   console.log('err', err.message);
  // });

  users.forEach((user) => {
    console.log(user.email);
  });
};

const update_contact = new CronJob(
  '0 1 * * *',
  updateContacts,
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

update_contact.start();
// updateContacts();
// clean();
// two_months();
// addContacts();
