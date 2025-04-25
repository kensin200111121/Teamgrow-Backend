const moment = require('moment-timezone');
const FollowUp = require('../models/follow_up');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const Garbage = require('../models/garbage');
const ActivityHelper = require('./activity');

const createFollowup = async (data) => {
  const {
    contacts,
    content,
    due_date,
    type,
    process,
    set_recurrence,
    recurrence_mode,
    user,
    task,
    deal,
    guest_loggin,
    guest,
  } = data;

  const garbage = await Garbage.findOne({ user }).catch((err) => {
    console.log('err', err);
  });

  let reminder_before = 30;
  if (garbage) {
    reminder_before = garbage.reminder_before;
  }

  const startdate = moment(due_date);
  const remind_at = startdate.subtract(reminder_before, 'minutes');

  let detail_content = 'added task';
  if (guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const followUp = new FollowUp({
      task,
      type,
      content,
      due_date,
      process,
      contact,
      set_recurrence,
      recurrence_mode,
      remind_at,
      user,
      deal,
    });

    followUp
      .save()
      .then((_followup) => {
        const activity = new Activity({
          content: detail_content,
          contacts: _followup.contact,
          user,
          type: 'follow_ups',
          follow_ups: _followup.id,
        });

        activity
          .save()
          .then((_activity) => {
            Contact.updateOne(
              { _id: _followup.contact },
              {
                $set: { last_activity: _activity.id },
              }
            ).catch((err) => {
              console.log('err', err);
            });
          })
          .catch((err) => {
            console.log('bulk create follow error', err.message);
          });
      })
      .catch((err) => {
        console.log('follow create error', err.message);
      });
  }
};
const completeFollowup = async (query) => {
  const detail_content = 'completed task';

  const follow_ups = await FollowUp.find(query);

  for (let i = 0; i < follow_ups.length; i++) {
    const follow_up = follow_ups[i];

    FollowUp.updateOne(
      {
        _id: follow_up.id,
      },
      {
        $set: { status: 1 },
      }
    ).catch((err) => {
      console.log('followup complete update err', err.message);
    });

    const content = ActivityHelper.autoSettingLog(detail_content);
    const activity = new Activity({
      content,
      contacts: follow_up.contact,
      user: follow_up.user,
      type: 'follow_ups',
      follow_ups: follow_up,
    });

    activity
      .save()
      .then((_activity) => {
        Contact.updateOne(
          { _id: follow_up.contact },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('activity save err', err.message);
        });
      })
      .catch((err) => {
        console.log('follow error', err.message);
      });
  }
};

const createDealFollowUp = async (
  createData,
  activity_content = 'added task'
) => {
  const {
    deal,
    task,
    type,
    content,
    due_date,
    contacts,
    timezone,
    set_recurrence,
    recurrence_mode,
    user,
    is_full,
  } = createData;

  const garbage = await Garbage.findOne({ user: createData.user }).catch(
    (err) => {
      console.log('err', err);
    }
  );
  let reminder_before = 30;
  if (garbage) {
    reminder_before = garbage.reminder_before;
  }

  return new Promise(async (resolve) => {
    const deal_followup = new FollowUp({
      user,
      deal,
      task,
      type,
      content,
      timezone,
      assigned_contacts: contacts,
      set_recurrence,
      is_full,
      recurrence_mode: set_recurrence ? recurrence_mode : undefined,
      due_date: set_recurrence ? undefined : due_date,
      remind_at: undefined,
    });
    await deal_followup.save().catch((err) => {
      console.log('new follow up save err', err.message);
      resolve({
        status: false,
        error: err.message,
      });
    });

    const activity = new Activity({
      content: activity_content,
      type: 'follow_ups',
      follow_ups: deal_followup.id,
      deals: deal_followup.deal,
      user,
    });
    activity.save().catch((err) => {
      console.log('activity save err', err.message);
      resolve({
        status: false,
        error: err.message,
      });
    });

    const contact_follow_ups = [];
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const contact_followup = new FollowUp({
        has_shared: true,
        shared_follow_up: deal_followup.id,
        task,
        contact,
        content,
        type,
        user,
        timezone,
        set_recurrence,
        recurrence_mode: set_recurrence ? recurrence_mode : undefined,
        due_date: set_recurrence ? undefined : due_date,
        remind_at:
          set_recurrence || is_full
            ? undefined
            : moment(due_date).clone().subtract(reminder_before, 'minutes'),
        is_full,
      });
      contact_followup.save().catch((err) => {
        console.log('new follow up save err', err.message);
        resolve({
          status: false,
          error: err.message,
        });
      });

      const new_activity = new Activity({
        content: activity_content,
        type: 'follow_ups',
        follow_ups: contact_followup.id,
        contacts: contact,
        user,
      });
      new_activity.save().catch((err) => {
        console.log('activity save err', err.message);
        resolve({
          status: false,
          error: err.message,
        });
      });

      Contact.updateOne(
        {
          _id: contact,
        },
        {
          $set: {
            last_activity: new_activity.id,
          },
        }
      ).catch((err) => {
        console.log('contact followup update err', err.message);
      });
      contact_follow_ups[contact] = contact_followup._id;
    }

    if (set_recurrence) {
      let update_date;
      if (createData.timezone) {
        update_date = moment.tz(due_date, createData.timezone).clone();
      } else {
        update_date = moment(due_date).clone();
      }

      let max_date = update_date.clone().add(6, 'weeks').endOf('weeks');

      if (
        createData.recurrence_date &&
        moment(createData.recurrence_date).isBefore(max_date)
      ) {
        max_date = moment(createData.recurrence_date);
      }
      while (max_date.isAfter(update_date)) {
        let deleted = false;
        if (
          createData.deleted_due_dates &&
          createData.deleted_due_dates.length
        ) {
          deleted = createData.deleted_due_dates.some((e) => {
            return update_date.clone().isSame(moment(e));
          });
        }

        if (!deleted) {
          const recurring_follow_up = new FollowUp({
            ...deal_followup._doc,
            _id: undefined,
            due_date: update_date.clone(),
            remind_at: undefined,
            parent_follow_up: deal_followup._id,
          });
          await recurring_follow_up.save().catch((err) => {
            console.log('new followup save err', err.message);
            resolve({
              status: false,
              error: err.message,
            });
          });

          for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            const contact_followup = new FollowUp({
              has_shared: true,
              shared_follow_up: recurring_follow_up._id,
              task,
              contact,
              content,
              type,
              user,
              timezone,
              set_recurrence,
              recurrence_mode: set_recurrence ? recurrence_mode : undefined,
              due_date: update_date.clone(),
              remind_at: is_full
                ? undefined
                : update_date.clone().subtract(reminder_before, 'minutes'),
              parent_follow_up: contact_follow_ups[contact],
            });
            contact_followup.save().catch((err) => {
              console.log('new follow up save err', err.message);
              resolve({
                status: false,
                error: err.message,
              });
            });
          }
        }
        switch (recurrence_mode) {
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
      }
    }

    resolve({
      status: true,
      data: { ...deal_followup._doc, activity },
    });
  });
};

module.exports = {
  createFollowup,
  completeFollowup,
  createDealFollowUp,
};
