const moment = require('moment-timezone');
const { v1: uuidv1 } = require('uuid');
const Task = require('../models/task');
const FollowUp = require('../models/follow_up');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const Garbage = require('../models/garbage');
const Organization = require('../models/organization');
const ActivityHelper = require('../helpers/activity');
const system_settings = require('../configs/system_settings');
const mongoose = require('mongoose');
const _ = require('lodash');
const contactCtrl = require('./contact');

const { outbound_constants } = require('../constants/variable');
const {
  getFollowupOutboundData,
  getRemoveFollowupOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');
const { checkCompleteDealFollowup } = require('../helpers/deal');
const { getUserTimezone } = require('../helpers/utility');
const { triggerTimeline } = require('../services/time_line');
const { shareContact } = require('../helpers/contact');

const get = async (req, res) => {
  const { currentUser } = req;
  const _follow_up = await FollowUp.find({
    user: currentUser._id,
    status: 0,
  }).sort({ due_date: -1 });
  const data = [];

  for (let i = 0; i < _follow_up.length; i++) {
    const _contact = await Contact.findOne({ _id: _follow_up[i].contact });
    const myJSON = JSON.stringify(_follow_up[i]);
    const follow_up = JSON.parse(myJSON);
    delete follow_up.contact;
    follow_up.contact = _contact;
    data.push(follow_up);
  }

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'FollowUp doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser, guest_loggin, guest, mode } = req;

  const created = await createFollowUp({
    ...req.body,
    user: currentUser._id,
    guest_loggin,
    guest,
    isAutoApi: mode === 'automation',
  });

  if (created && created.status) {
    return res.send(created);
  } else {
    return res.status(500).send(created);
  }
};

const createFollowUp = async (createData, activity_content = 'added task') => {
  const ownerId = createData.assignee
    ? mongoose.Types.ObjectId(createData.assignee)
    : undefined;

  if (ownerId) {
    const contact = await Contact.findOne({
      $and: [
        { _id: mongoose.Types.ObjectId(createData.contact) },
        {
          $or: [{ shared_members: { $in: [ownerId] } }, { owner: ownerId }],
        },
      ],
    });
    if (!contact) {
      await Contact.updateOne(
        {
          _id: mongoose.Types.ObjectId(createData.contact),
        },
        {
          $push: { shared_members: ownerId },
        }
      );
    }
  }

  const garbage = await Garbage.findOne({ user: createData.user }).catch(
    (err) => {
      console.log('garbage find err', err.message);
    }
  );
  let reminder_before = 30;
  if (garbage) {
    reminder_before = garbage.reminder_before;
  }

  return new Promise(async (resolve, reject) => {
    let follow_up;
    if (createData.set_recurrence) {
      // create parent followup
      follow_up = new FollowUp({
        ...createData,
        due_date: undefined,
        remind_at: undefined,
        parent_follow_up: undefined,
        user: createData.user,
        ...(ownerId && { owner: ownerId }),
      });
      follow_up.save().catch((err) => {
        console.log('new recurring followup save err', err.message);
      });

      let update_date;
      if (createData.timezone) {
        update_date = moment
          .tz(createData.due_date, createData.timezone)
          .clone();
      } else {
        update_date = moment(createData.due_date).clone();
      }

      let max_date = update_date.clone().add(6, 'weeks').endOf('weeks');

      if (
        createData.recurrence_date &&
        moment(createData.recurrence_date).isBefore(max_date)
      ) {
        max_date = moment(createData.recurrence_date);
      }

      while (update_date.isSameOrBefore(max_date)) {
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
          const new_follow_up = new FollowUp({
            ...createData,
            recurrence_date: undefined,
            parent_follow_up: follow_up.id,
            due_date: update_date.clone(),
            remind_at: createData.is_full
              ? undefined
              : update_date.clone().subtract(reminder_before, 'minutes'),
            user: createData.user,
            ...(ownerId && { owner: ownerId }),
          });
          new_follow_up.save().catch((err) => {
            console.log('new followup save err', err.message);
          });
        }

        switch (createData.recurrence_mode) {
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
    } else {
      follow_up = new FollowUp({
        ...createData,
        remind_at: createData.is_full
          ? undefined
          : moment(createData.due_date)
              .clone()
              .subtract(reminder_before, 'minutes'),
        user: createData.user,
        ...(ownerId && { owner: ownerId }),
      });

      follow_up.save().catch((err) => {
        console.log('follow error', err.message);
        resolve({
          status: false,
          error: err.message,
        });
      });
    }

    if (createData.guest_loggin) {
      activity_content = ActivityHelper.assistantLog(
        activity_content,
        createData.guest.name
      );
    }

    if (createData?.isAutoApi) {
      activity_content = ActivityHelper.automationLog(activity_content);
    }
    await outboundCallhookApi(
      createData.user,
      outbound_constants.CREATE_TASK,
      getFollowupOutboundData,
      { _id: follow_up._id }
    );
    const content = ownerId ? 'assigned task' : activity_content;
    const activity = new Activity({
      content,
      contacts: createData.contact || null,
      user: createData.user,
      type: 'follow_ups',
      follow_ups: follow_up.id,
    });

    activity
      .save()
      .then((_activity) => {
        if (createData?.contact) {
          Contact.updateOne(
            { _id: createData.contact },
            {
              $set: { last_activity: _activity.id },
            }
          ).catch((err) => {
            console.log('err', err);
            resolve({
              status: false,
              error: err.message,
            });
          });
        }
        resolve({
          status: true,
          data: { ...follow_up._doc, activity: { ..._activity._doc } },
        });
      })
      .catch((err) => {
        console.log('follow up activity create error', err.message);
        resolve({
          status: false,
          error: err.message,
        });
      });
  });
};

const leaveComment = async (req, res) => {
  const { currentUser } = req;
  const { id, comment } = req.body;

  FollowUp.updateOne(
    { user: currentUser._id, _id: id },
    {
      $set: { comment },
    }
  )
    .then((_follow_up) => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('err', err);
    });
};

const update = async (req, res) => {
  const { currentUser, mode } = req;
  const {
    edit_mode,
    schedule_mode,
    set_recurrence,
    due_date,
    contact,
    recurrence_mode,
    is_full,
  } = req.body;

  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  let reminder_before = 30;
  if (garbage) {
    reminder_before = garbage.reminder_before;
  }

  let query = { ...req.body, user: currentUser._id };

  if (req.body.task && req.body.task._id) {
    query = { ...query, task: req.body.task._id };
  }

  if (due_date || contact) {
    const startdate = moment(due_date);
    const remind_at = is_full
      ? undefined
      : startdate.subtract(reminder_before, 'minutes');

    query = { ...query, remind_at, status: 0 };
  }

  const follow_up = await FollowUp.findOne({ _id: req.params.id }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  await outboundCallhookApi(
    currentUser._id,
    outbound_constants.UPDATE_TASK,
    getFollowupOutboundData,
    { _id: req.params.id }
  );
  let same_recurring_mode = false;
  if (
    set_recurrence &&
    due_date &&
    moment(due_date).isSame(follow_up.due_date) &&
    recurrence_mode === follow_up.recurrence_mode
  ) {
    same_recurring_mode = true;
  }

  delete query.updated_at;

  const update_promise_array = [];
  let task;
  // if the task has schedule item
  if (follow_up.task) {
    task = await Task.findOne({
      _id: follow_up.task,
      user: currentUser._id,
    }).catch((err) => {
      console.log('find schedule item error', err);
    });
    if (schedule_mode === 'all') {
      /// if the choice is all contacts
      /// update the other follow ups
      let other_follow_ups;
      console.log(follow_up);
      if (follow_up.set_recurrence) {
        other_follow_ups = await FollowUp.find({
          user: currentUser._id,
          task: follow_up.task,
          contact: { $ne: follow_up.contact },
          parent_follow_up: { $exists: false, $in: [null] },
        }).catch((err) => {
          console.log('find other followups error: ', err);
        });
        if (follow_up.parent_follow_up) {
          const child_follow_ups = [];
          const promise_array = [];
          for (const parent of other_follow_ups) {
            const promise = new Promise(async (resolve) => {
              const childs = await FollowUp.find({
                user: currentUser._id,
                task: parent.task,
                contact: parent.contact,
                due_date: { $lte: follow_up.due_date },
              })
                .sort({ due_date: 1 })
                .catch((err) => {
                  console.log('find child followup error: ', err);
                });
              if (childs && childs.length) {
                child_follow_ups.push(childs[0]._doc);
              }
              resolve();
            });
            promise_array.push(promise);
          }
          await Promise.all(promise_array).catch((err) => {
            console.log(err);
          });
          other_follow_ups = child_follow_ups;
        }
      } else {
        other_follow_ups = await FollowUp.find({
          user: currentUser._id,
          task: follow_up.task,
          contact: { $ne: follow_up.contact },
        }).catch((err) => {
          console.log('find other followups error: ', err);
        });
      }
      if (other_follow_ups && other_follow_ups.length) {
        for (const other_follow_up of other_follow_ups) {
          const other_query = {
            ...query,
            _id: other_follow_up._id,
            contact: other_follow_up.contact,
          };
          console.log(other_query);
          console.log(other_follow_up);
          const promise = new Promise(async (resolve) => {
            const updated = await updateFollowUp(
              req,
              edit_mode,
              set_recurrence,
              same_recurring_mode,
              other_query,
              other_follow_up
            ).catch((err) => {
              console.log('update follow up error: ', err);
            });
            if (!updated || !updated.status) {
              console.log(updated);
            }
            resolve();
          });
          update_promise_array.push(promise);
        }
      }
    } else {
      /// if the choice is only this contact
      /// 1. Exclude the contact from original task
      /// 2. Create new task with contact
      /// 3. Replace the task and process with new ones
      await Task.updateOne(
        { user: currentUser.id, _id: task._id },
        { $pull: { contacts: follow_up.contact } }
      ).catch((err) => {
        console.log('pull the contact from schedule item error: ', err);
      });

      delete task._id;
      const taskProcessId = new Date().getTime() + uuidv1();
      const new_task = new Task({
        ...task,
        process: taskProcessId,
        contacts: [follow_up.contact],
      });
      await new_task.save().catch((err) => {
        console.log('Create new save error: ', err);
      });
      query = { ...query, task: new_task._id, process: taskProcessId };
      task = new_task;
    }
  }

  const updated = await updateFollowUp(
    req,
    edit_mode,
    set_recurrence,
    same_recurring_mode,
    query,
    follow_up,
    mode
  ).catch((err) => {
    console.log('update follow up error: ', err);
  });

  if (task && task._id) {
    task = await Task.findOne({
      _id: task._id,
      user: currentUser._id,
    })
      .populate({ path: 'contacts' })
      .catch((err) => {
        console.log('fetch full task error: ', err);
      });
  }
  if (updated && updated.status) {
    if (update_promise_array.length) {
      Promise.all(update_promise_array)
        .then(() => {
          if (task && task._id) {
            return res.send({ ...updated, task });
          }
          return res.send(updated);
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).json({
            status: false,
            error: 'The task has not been updated properly',
          });
        });
    } else {
      if (task && task._id) {
        return res.send({ ...updated, task });
      }
      return res.send(updated);
    }
  } else {
    return res.status(500).send(updated);
  }
};

const updateFollowUp = async (
  { currentUser, guest_loggin, guest },
  edit_mode,
  set_recurrence,
  same_recurring_mode,
  query,
  follow_up,
  mode
) => {
  let updated;
  if (edit_mode === 'all') {
    if (!set_recurrence) {
      query.parent_follow_up = undefined;
    } else {
      query.due_date = await getInitialDate(query);
    }
    if (follow_up.parent_follow_up) {
      const recurring_follow_ups = await FollowUp.find({
        user: currentUser._id,
        parent_follow_up: { $exists: true, $eq: follow_up.parent_follow_up },
        status: follow_up.status,
      })
        .distinct('_id')
        .lean();
      await removeFollowUps(
        [follow_up.parent_follow_up, ...recurring_follow_ups],
        currentUser._id,
        []
      );
    } else {
      const recurring_follow_ups = await FollowUp.find({
        user: currentUser._id,
        parent_follow_up: { $exists: true, $eq: follow_up._id },
        status: follow_up.status,
      })
        .distinct('_id')
        .lean();
      await removeFollowUps(
        [follow_up._id, ...recurring_follow_ups],
        currentUser._id,
        []
      );
    }

    delete query._id;
    updated = await createFollowUp(
      { ...query, guest_loggin, guest },
      'updated task'
    );
  } else if (edit_mode === 'following') {
    // update the selected follow up and upcoming follow ups
    if (same_recurring_mode) {
      // if the recurrence mode not changed, update the follow up data
      await FollowUp.updateMany(
        {
          user: currentUser._id,
          parent_follow_up: { $exists: true, $eq: follow_up.parent_follow_up },
          status: follow_up.status,
          due_date: { $gte: follow_up.due_date },
        },
        {
          $set: {
            type: query.type,
            content: query.content,
            is_full: query.is_full,
            timezone: query.timezone,
          },
        }
      );
      updated = await updateActivity({
        ...query,
        guest_loggin,
        guest,
      });
    } else {
      // if the recurrence mode changed
      const recurring_follow_up = await FollowUp.findOne({
        user: currentUser._id,
        _id: follow_up.parent_follow_up,
      });

      if (recurring_follow_up.recurrence_date) {
        query.recurrence_date = recurring_follow_up.recurrence_date;
      }
      if (same_recurring_mode && recurring_follow_up.deleted_due_dates) {
        query.deleted_due_dates = recurring_follow_up.deleted_due_dates;
      }
      await FollowUp.updateOne(
        { user: currentUser._id, _id: follow_up.parent_follow_up },
        {
          $set: {
            recurrence_date: moment(follow_up.due_date).startOf('day').format(),
          },
        }
      );
      query.parent_follow_up = undefined;
      const recurring_follow_ups = await FollowUp.find({
        user: currentUser._id,
        parent_follow_up: { $exists: true, $eq: follow_up.parent_follow_up },
        status: follow_up.status,
        due_date: { $gte: follow_up.due_date },
      })
        .distinct('_id')
        .lean();
      await removeFollowUps(recurring_follow_ups, currentUser._id, []);

      delete query._id;
      updated = await createFollowUp(
        { ...query, guest_loggin, guest },
        'updated task'
      );
    }
  } else {
    if (set_recurrence && !follow_up.set_recurrence) {
      await removeFollowUps([follow_up.id], currentUser._id, []);
      delete query._id;
      updated = await createFollowUp(
        { ...query, guest_loggin, guest },
        'updated task'
      );
    } else {
      await FollowUp.updateOne(
        { user: query.user, _id: query._id },
        {
          $set: {
            ...query,
          },
        }
      ).catch((err) => {
        console.log('err', err);
      });
      updated = await updateActivity({
        ...query,
        guest_loggin,
        guest,
        mode,
      });
    }
  }
  return updated;
};

const getInitialDate = async (editData) => {
  const first_recurring = await FollowUp.findOne({
    user: editData.user,
    parent_follow_up: editData.parent_follow_up,
    status: editData.status,
  })
    .sort({ due_date: 1 })
    .lean();

  const first_date = {
    year: moment(first_recurring.due_date).year(),
    month: moment(first_recurring.due_date).month() + 1,
    day: moment(first_recurring.due_date).date(),
    weekday: moment(first_recurring.due_date).weekday(),
  };
  const edit_date = {
    year: moment(editData.due_date).year(),
    month: moment(editData.due_date).month() + 1,
    day: moment(editData.due_date).date(),
    weekday: moment(editData.due_date).weekday(),
  };

  const time = moment(editData.due_date).format('hh:mm');

  let result;
  if (moment(editData.due_date).isBefore(moment(first_recurring.due_date))) {
    result = editData.due_date;
  } else {
    switch (first_recurring.recurrence_mode) {
      case 'DAILY': {
        result = moment(first_recurring.due_date).format('YYYY-MM-DD ') + time;
        break;
      }
      case 'WEEKLY': {
        if (first_date.weekday <= edit_date.weekday) {
          result =
            moment(first_recurring.due_date)
              .startOf('week')
              .add(edit_date.weekday, 'days')
              .format('YYYY-MM-DD ') + time;
        } else {
          result =
            moment(first_recurring.due_date)
              .startOf('week')
              .add(7, 'days')
              .add(edit_date.weekday, 'days')
              .format('YYYY-MM-DD ') + time;
        }
        break;
      }
      case 'MONTHLY': {
        if (first_date.day <= edit_date.day) {
          result = `${first_date.year}-${first_date.month}-${edit_date.day} ${time}`;
        } else {
          result = `${first_date.year}-${first_date.month + 1}-${
            edit_date.day
          } ${time}`;
        }
        break;
      }
      case 'YEARLY': {
        if (first_date.month <= edit_date.month) {
          result = `${first_date.year}-${edit_date.month}-${edit_date.day} ${time}`;
        } else {
          result = `${first_date.year + 1}-${edit_date.month}-${
            edit_date.day
          } ${time}`;
        }
        break;
      }
    }
  }
  return moment(result, 'YYYY-MM-DD hh:mm').format();
};

const updateActivity = (updateData) => {
  const { mode } = updateData;
  return new Promise((resolve) => {
    let detail_content = 'updated task';
    if (mode === 'automation') {
      detail_content = ActivityHelper.automationLog(detail_content);
    } else if (updateData.guest_loggin) {
      detail_content = ActivityHelper.assistantLog(
        detail_content,
        updateData.guest.name
      );
    }

    const activity = new Activity({
      content: detail_content,
      contacts: updateData.contact,
      user: updateData.user,
      type: 'follow_ups',
      follow_ups: updateData.parent_follow_up
        ? updateData.parent_follow_up
        : updateData._id,
    });

    activity
      .save()
      .then((_activity) => {
        if (updateData?.contact) {
          Contact.updateOne(
            { _id: updateData.contact },
            {
              $set: { last_activity: _activity.id },
            }
          ).catch((err) => {
            console.log('activity save err', err.message);
          });
        }

        resolve({
          status: true,
          data:
            mode === 'automation'
              ? { _id: _activity._id }
              : { activity: _activity._doc },
        });
      })
      .catch((err) => {
        console.log('follow error', err.message);
        resolve({
          status: false,
          error: err.message,
        });
      });
  });
};

const completed = async (req, res) => {
  const { currentUser, guest_loggin, guest, mode } = req;
  const { follow_up, comment } = req.body;
  if (follow_up) {
    let detail_content = 'completed task';
    if (mode === 'automation') {
      detail_content = ActivityHelper.automationLog(detail_content);
    } else if (guest_loggin) {
      detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
    }

    try {
      const _follow_up = await FollowUp.findOne({ _id: follow_up }).catch(
        (err) => {
          console.log('err', err);
        }
      );

      triggerTimeline({
        userId: currentUser.id,
        type: 'task',
        created_followup: _follow_up._id,
      });

      _follow_up.status = 1;
      if (comment) {
        _follow_up.comment = comment;
      }
      await _follow_up.save().catch((err) => {
        console.log('err', err);
      });

      if (_follow_up.set_recurrence && _follow_up.parent_follow_up) {
        const count = await FollowUp.countDocuments({
          user: currentUser._id,
          parent_follow_up: _follow_up.parent_follow_up,
          status: 0,
        });
        if (!count) {
          const last_recurrence = await FollowUp.findOne({
            user: currentUser._id,
            parent_follow_up: _follow_up.parent_follow_up,
          })
            .sort({ due_date: -1 })
            .catch((err) => {
              console.log('last recurrence getting err', err.message);
            });
          const recurring_follow_up = await FollowUp.findOne({
            user: currentUser._id,
            _id: _follow_up.parent_follow_up,
          });

          const garbage = await Garbage.findOne({
            user: currentUser._id,
          }).catch((err) => {
            console.log('err', err);
          });
          let reminder_before = 30;
          if (garbage) {
            reminder_before = garbage.reminder_before;
          }

          let update_date;
          if (last_recurrence.timezone) {
            update_date = moment
              .tz(last_recurrence.due_date, last_recurrence.timezone)
              .clone();
          } else {
            update_date = moment(last_recurrence.due_date).clone();
          }
          let max_date = update_date.clone().add(6, 'weeks').endOf('weeks');

          if (
            recurring_follow_up?.recurrence_date &&
            moment(recurring_follow_up.recurrence_date).isBefore(
              max_date.clone()
            )
          ) {
            max_date = moment(recurring_follow_up.recurrence_date);
          }

          while (max_date.isAfter(update_date)) {
            switch (_follow_up.recurrence_mode) {
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
            if (recurring_follow_up?.deleted_due_dates) {
              deleted = recurring_follow_up.deleted_due_dates.some((e) => {
                return update_date.clone().isSame(moment(e));
              });
            } else {
              deleted = false;
            }
            const existing = await FollowUp.findOne({
              user: currentUser._id,
              parent_follow_up: _follow_up.parent_follow_up,
              due_date: update_date.clone(),
            });

            if (!deleted && !existing) {
              delete last_recurrence._doc._id;
              const new_follow_up = new FollowUp({
                ...last_recurrence._doc,
                due_date: update_date.clone(),
                status: 0,
                remind_at:
                  last_recurrence.deal || last_recurrence.is_full
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

      const activity = new Activity({
        content: detail_content,
        contacts: _follow_up?.contact || null,
        user: currentUser._id,
        type: 'follow_ups',
        follow_ups: follow_up,
      });

      activity
        .save()
        .then((_activity) => {
          if (_follow_up?.contact) {
            Contact.updateOne(
              { _id: _follow_up.contact },
              {
                $set: { last_activity: _activity.id },
              }
            ).catch((err) => {
              console.log('activity save err', err.message);
            });
          }

          const myJSON = JSON.stringify(_follow_up);
          const data = JSON.parse(myJSON);
          data.activity = _activity;
          return res.send({
            status: true,
            data,
          });
        })
        .catch((err) => {
          console.log('follow error', err.message);
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
      if (_follow_up.shared_follow_up) {
        checkCompleteDealFollowup(currentUser._id, _follow_up.shared_follow_up);
      }
    } catch (err) {
      console.log('err', err);
      return res.status(500).json({
        status: false,
        error: err.message || 'Internal Server Error',
      });
    }
  } else {
    console.log('FollowUp doesn`t exist');
    return res.status(400).json({
      status: false,
      error: 'FollowUp doesn`t exist',
    });
  }
};

const uncompleted = async (req, res) => {
  const { currentUser } = req;
  const { follow_up, comment } = req.body;
  if (follow_up) {
    const detail_content = 'Uncompleted task';

    try {
      const _follow_up = await FollowUp.findOne({ _id: follow_up }).catch(
        (err) => {
          console.log('err', err);
        }
      );

      _follow_up.status = 0;
      if (comment) {
        _follow_up.comment = comment;
      }
      await _follow_up.save().catch((err) => {
        console.log('err', err);
      });

      const activity = new Activity({
        content: detail_content,
        contacts: _follow_up?.contact || null,
        user: currentUser._id,
        type: 'follow_ups',
        follow_ups: follow_up,
      });

      activity
        .save()
        .then((_activity) => {
          if (_follow_up?.contact) {
            Contact.updateOne(
              { _id: _follow_up.contact },
              {
                $set: { last_activity: _activity.id },
              }
            ).catch((err) => {
              console.log('activity save err', err.message);
            });
          }

          const myJSON = JSON.stringify(_follow_up);
          const data = JSON.parse(myJSON);
          data.activity = _activity;
          return res.send({
            status: true,
            data,
          });
        })
        .catch((err) => {
          console.log('follow error', err.message);
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    } catch (err) {
      console.log('err', err);
      return res.status(500).json({
        status: false,
        error: err.message || 'Internal Server Error',
      });
    }
  } else {
    console.log('FollowUp doesn`t exist');
    return res.status(400).json({
      status: false,
      error: 'FollowUp doesn`t exist',
    });
  }
};

const getByDate = async (req, res) => {
  const { currentUser } = req;

  const allowed_queries = [
    'overdue',
    'today',
    'tomorrow',
    'next_week',
    'next_month',
    'future',
  ];
  const query = { ...req.query };
  const cquery = { ...query };
  const due_date = query['due_date'];
  const time_zone = getUserTimezone(currentUser);

  // Check valid queries
  if (!allowed_queries.includes(due_date)) {
    // Other queries
    return res.status(400).send({
      status: false,
      error: {
        msg: 'Query not allowed',
        data: cquery,
      },
    });
  }

  switch (due_date) {
    case 'overdue': {
      const current_time = moment().tz(time_zone).startOf('day');

      const _follow_up = await FollowUp.find({
        user: currentUser._id,
        status: 0,
        due_date: { $lt: current_time },
        contact: { $ne: null },
      }).populate('contact');

      res.send({
        status: true,
        data: _follow_up,
      });
      break;
    }
    case 'today': {
      const start = moment().tz(time_zone).startOf('day'); // set to 12:00 am today
      const end = moment().tz(time_zone).endOf('day'); // set to 23:59 pm today
      const _follow_up = await FollowUp.find({
        user: currentUser._id,
        status: { $in: [0, 2] },
        due_date: { $gte: start, $lt: end },
        contact: { $ne: null },
      }).populate('contact');

      res.send({
        status: true,
        data: _follow_up,
      });
      break;
    }
    case 'tomorrow': {
      const today_start = moment().tz(time_zone).startOf('day'); // set to 12:00 am today
      const today_end = moment().tz(time_zone).endOf('day'); // set to 23:59 pm today
      const tomorrow_start = today_start.add(1, 'day');
      const tomorrow_end = today_end.add(1, 'day');
      const _follow_up = await FollowUp.find({
        user: currentUser._id,
        status: { $in: [0, 2] },
        due_date: { $gte: tomorrow_start, $lt: tomorrow_end },
        contact: { $ne: null },
      }).populate('contact');

      res.send({
        status: true,
        data: _follow_up,
      });
      break;
    }
    case 'next_week': {
      const next_week_start = moment()
        .tz(time_zone)
        .add(2, 'day')
        .startOf('day');
      const next_week_end = moment().tz(time_zone).add(7, 'days').endOf('day');
      const _follow_up = await FollowUp.find({
        user: currentUser._id,
        status: 0,
        due_date: { $gte: next_week_start, $lt: next_week_end },
        contact: { $ne: null },
      });

      res.send({
        status: true,
        data: _follow_up,
      });
      break;
    }
    case 'next_month': {
      const start_month = moment().tz(time_zone).add(8, 'day').startOf('day');
      const end_month = moment().tz(time_zone).add(30, 'days').endOf('day');
      const _follow_up = await FollowUp.find({
        user: currentUser._id,
        status: 0,
        due_date: { $gte: start_month, $lt: end_month },
        contact: { $ne: null },
      });

      res.send({
        status: true,
        data: _follow_up,
      });
      break;
    }
    case 'future': {
      const start_future = moment().tz(time_zone).add(8, 'day').startOf('day');
      const _follow_up = await FollowUp.find({
        user: currentUser._id,
        status: 0,
        due_date: { $gte: start_future },
        contact: { $ne: null },
      });

      res.send({
        status: true,
        data: _follow_up,
      });
      break;
    }
    default:
  }
};

const updateArchived = async (req, res) => {
  const { follow_ups, include_recurrence } = req.body;

  const { currentUser } = req;
  try {
    if (follow_ups && follow_ups.length) {
      if (include_recurrence) {
        const parent_follow_ups = follow_ups.map((e) => e.parent_follow_up);
        const recurring_ids = await FollowUp.find({
          user: currentUser._id,
          parent_follow_up: { $exists: true, $in: parent_follow_ups },
          status: follow_ups[0]['status'],
        })
          .distinct('_id')
          .lean();

        await removeFollowUps(
          [...recurring_ids, ...parent_follow_ups],
          currentUser._id,
          follow_ups.map((e) => e.contact)
        );
      } else {
        const ids = [];
        const contacts = [];
        const due_dates = [];
        follow_ups.some((e) => {
          ids.push(e._id);
          contacts.push(e.contact);

          if (e.set_recurrence && e.parent_follow_up) {
            if (due_dates[e.parent_follow_up]) {
              due_dates[e.parent_follow_up].push(e.due_date);
            } else {
              due_dates[e.parent_follow_up] = [e.due_date];
            }
          }
        });

        for (const _id in due_dates) {
          if (Object.hasOwnProperty.call(due_dates, _id)) {
            const deleted_due_dates = due_dates[_id];

            FollowUp.updateOne(
              { user: currentUser._id, _id },
              {
                $addToSet: { deleted_due_dates: { $each: deleted_due_dates } },
              }
            ).catch((err) => {
              console.log('FollowUp save err', err.message);
            });
          }
        }

        await removeFollowUps(ids, currentUser._id, contacts);
      }
      return res.json({ status: true });
    } else {
      return res.status(400).json({
        status: false,
        error: 'FollowUp doesn`t exist',
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  }
};

const updateChecked = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;
  const { follow_ups } = req.body;

  if (follow_ups) {
    let detail_content = 'completed task';
    if (guest_loggin) {
      detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
    }

    try {
      const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
        (err) => {
          console.log('garbage find err', err.message);
        }
      );
      let reminder_before = 30;
      if (garbage) {
        reminder_before = garbage.reminder_before;
      }
      for (let i = 0; i < follow_ups.length; i++) {
        const follow_up = follow_ups[i];
        let _follow_up = await FollowUp.findOne({
          _id: follow_up._id,
        });

        if (_follow_up) {
          FollowUp.updateOne(
            { user: currentUser._id, _id: follow_up._id },
            {
              $set: { status: 1 },
            }
          ).catch((err) => {
            console.log('followup updatet err', err.message);
          });
        } else {
          _follow_up = new FollowUp({
            ...follow_up,
            remind_at:
              follow_up.deal || follow_up.is_full
                ? undefined
                : moment(follow_up.due_date)
                    .clone()
                    .subtract(reminder_before, 'minutes'),
            status: 1,
          });
          _follow_up.save().catch((err) => {
            console.log('new recurring followup save err', err.message);
          });
        }

        const activity = new Activity({
          content: detail_content,
          contacts: _follow_up.contact || null,
          user: currentUser._id,
          type: 'follow_ups',
          follow_ups: follow_up._id,
        });

        activity
          .save()
          .then((_activity) => {
            if (_follow_up?.contact) {
              Contact.updateOne(
                { _id: _follow_up.contact },
                {
                  $set: { last_activity: _activity.id },
                }
              ).catch((err) => {
                console.log('err', err);
              });
            }
          })
          .catch((err) => {
            console.log('follow error', err.message);
            return res.status(500).send({
              status: false,
              error: err.message,
            });
          });
      }

      return res.send({
        status: true,
      });
    } catch (err) {
      console.log('err', err);
      return res.status(500).json({
        status: false,
        error: err,
      });
    }
  } else {
    console.log('FollowUp doesn`t exist');
    return res.status(400).json({
      status: false,
      error: 'FollowUp doesn`t exist',
    });
  }
};

const bulkUpdate = async (req, res) => {
  const follow_ups = req.body;
  const { currentUser, guest, guest_loggin } = req;

  try {
    const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    let reminder_before = 30;
    if (garbage) {
      reminder_before = garbage.reminder_before;
    }

    for (let i = 0; i < follow_ups.length; i++) {
      const follow_up = follow_ups[i];
      let _follow_up = await FollowUp.findOne({
        _id: follow_up._id,
      });

      if (_follow_up) {
        FollowUp.updateOne(
          { user: currentUser._id, _id: follow_up._id },
          {
            $set: { ...follow_up },
          }
        ).catch((err) => {
          console.log('followup updatet err', err.message);
        });
      } else {
        _follow_up = new FollowUp({
          ...follow_up,
          remind_at:
            follow_up.deal || follow_up.is_full
              ? undefined
              : moment(follow_up.due_date)
                  .clone()
                  .subtract(reminder_before, 'minutes'),
        });
        _follow_up.save().catch((err) => {
          console.log('new recurring followup save err', err.message);
        });
      }

      let detail_content = 'updated task';
      if (guest_loggin) {
        detail_content = ActivityHelper.assistantLog(
          detail_content,
          guest.name
        );
      }
      const activity = new Activity({
        content: detail_content,
        contacts: _follow_up.contact || null,
        user: currentUser._id,
        type: 'follow_ups',
        follow_ups: follow_up._id,
      });

      activity
        .save()
        .then((_activity) => {
          if (_follow_up?.contact) {
            Contact.updateOne(
              { _id: _follow_up.contact },
              {
                $set: { last_activity: _activity.id },
              }
            ).catch((err) => {
              console.log('err', err);
            });
          }
        })
        .catch((err) => {
          console.log('follow error', err.message);
          return res.status(500).send({
            status: false,
            error: err.message,
          });
        });
    }

    return res.send({
      status: true,
    });
  } catch (err) {
    console.log('err', err);
    return res.status(500).json({
      status: false,
      error: err,
    });
  }
};

const bulkCreate = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;
  const { contacts } = req.body;

  const promise_array = [];
  if (contacts.length) {
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      promise_array.push(
        createFollowUp({
          ...req.body,
          user: currentUser._id,
          contact,
          guest_loggin,
          guest,
        })
      );
    }
  } else {
    promise_array.push(
      createFollowUp({
        ...req.body,
        user: currentUser._id,
        contact: null,
        guest_loggin,
        guest,
      })
    );
  }

  Promise.all(promise_array)
    .then(async (data) => {
      let teamId;
      if (
        currentUser.organization_info?.is_enabled &&
        currentUser.organization
      ) {
        const organization = await Organization.findOne({
          _id: currentUser.organization,
        }).catch((e) => console.log(e.message));
        if (organization) {
          teamId = organization.team;
        }
      }

      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
      });
    });
};

const load = async (req, res) => {
  const { currentUser } = req;
  const { skip, pageSize, searchOption, timezone } = req.body;
  const {
    types,
    status,
    contact,
    labels,
    start_date,
    end_date,
    str,
    sortDir,
    name,
    countries,
    states,
    zipcode,
    sources,
    companies,
    tags,
    assigneeCondition,
  } = searchOption;

  const contactSearchOption = {
    searchStr: str,
    labelCondition: labels,
    includeLabel: true,
    countryCondition: countries,
    regionCondition: states,
    zipcodeCondition: zipcode,
    tagsCondition: tags,
    includeTag: true,
    orTag: true,
    brokerageCondition: companies,
    includeBrokerage: true,
    sourceCondition: sources,
    includeSource: true,
  };

  const contactQuery =
    contactCtrl.generateAdvancedFilterQuery(contactSearchOption);
  const query = {
    $or: [{ user: currentUser._id }, { owner: currentUser._id }],
    due_date: { $exists: true },
  };
  if (types && types.length > 0) {
    query.type = { $in: types };
  }
  if (types && types.indexOf('task') !== -1) {
    types.push('');
    types.push(null);
  }

  if (typeof status !== 'undefined') {
    if (status instanceof Array) {
      query.status = { $in: status };
    } else {
      if (status === 0) {
        query.status = { $in: [0, 2] };
      } else {
        query.status = status;
      }
    }
  }
  if (contact) query.contact = contact;

  if (start_date) {
    query.due_date = { $gte: moment(start_date).toDate() };
  }

  if (assigneeCondition?.length) {
    query.owner = { $in: assigneeCondition.map((e) => e._id) };
  }

  if (end_date) {
    if (query.due_date) {
      query.due_date.$lt = moment(end_date).toDate();
    } else {
      query.due_date = { $lt: moment(end_date).toDate() };
    }
  }

  if (str) {
    if (contactQuery && contactQuery.length) {
      const contacts = await Contact.find({
        user: currentUser._id,
        $and: contactQuery,
      }).select('_id');
      const contact_ids = contacts.map((e) => e._id);
      query['$and'] = [
        {
          $or: [
            {
              contact: { $in: contact_ids },
            },
            {
              content: { $regex: '.*' + str + '.*', $options: 'i' },
            },
          ],
        },
      ];
    } else {
      query.content = { $regex: '.*' + str + '.*', $options: 'i' };
    }
  } else {
    if (contactQuery && contactQuery.length) {
      const contacts = await Contact.find({
        user: currentUser._id,
        $and: contactQuery,
      }).select('_id');
      const contact_ids = contacts.map((e) => e._id);
      query.contact = { $in: contact_ids };
    }
  }

  /*
  if (labels && labels.length) {
    const contacts = await Contact.find({
      user: currentUser._id,
      label: { $in: labels },
    }).select('_id');
    const contact_ids = contacts.map((e) => e._id);
    query.contact = { $in: contact_ids };
  }
  */

  let count = 0;
  let _follow_ups = [];
  if (
    _.isEqual(searchOption, { status: 0, sortDir }) ||
    name === 'all' ||
    name === 'future'
  ) {
    if (query.due_date) {
      query.due_date.$exists = true;
    } else {
      query.due_date = { $exists: true };
    }
    /*
      **
      query.status
      0: valid
      1: completed
      2: overdue
    */
    // to get only 1st ids of recurring followups those are still valid
    const recurring_first_follow_ups = await FollowUp.aggregate([
      {
        $match: {
          ...query,
          set_recurrence: true,
          status: 0,
          parent_follow_up: { $exists: true },
        },
      },
      {
        $sort: { due_date: 1 },
      },
      {
        $group: {
          _id: '$parent_follow_up',
          follow_up: { $first: '$_id' },
        },
      },
    ]);

    const addtional_query =
      JSON.stringify(query.status) === JSON.stringify({ $in: [0, 1, 2] }) ||
      query.status === 1
        ? {}
        : {
            $or: [
              {
                // to get all(recurring & non-recurring) followups those are already overdue
                status: 2,
                due_date: { $exists: true },
              },
              {
                // to get non-recurring followups those are still valid
                status: 0,
                due_date: { $exists: true },
                parent_follow_up: { $exists: false },
              },
              {
                // to get only 1st recurring followups those are still valid
                _id: {
                  $in: recurring_first_follow_ups.map((e) => e.follow_up),
                },
              },
            ],
          };

    _follow_ups = await FollowUp.find({
      $and: [query, addtional_query],
    })
      .sort({ due_date: sortDir })
      .skip(skip)
      .limit(pageSize)
      .populate('contact')
      .populate({
        path: 'owner',
        model: 'user',
        select: 'user_name email',
      });

    count = await FollowUp.countDocuments({
      $and: [query, addtional_query],
    });
  } else {
    if (
      !end_date ||
      moment(end_date).isAfter(moment().add(6, 'weeks').endOf('weeks'))
    ) {
      const recurrences = await FollowUp.find({
        ...query,
        due_date: undefined,
        remind_at: undefined,
        parent_follow_up: undefined,
        status: 0,
        set_recurrence: true,
      });

      const result = [];

      for (const recurrence of recurrences) {
        const latest_follow_up = await FollowUp.findOne({
          ...query,
          status: 0,
          parent_follow_up: { $exists: true, $eq: recurrence._id },
        })
          .sort({ due_date: 1 })
          .populate('contact')
          .populate({
            path: 'owner',
            model: 'user',
            select: 'user_name email',
          });

        if (latest_follow_up) {
          result.push(latest_follow_up);
        } else {
          const followUp = await FollowUp.findOne({
            parent_follow_up: { $exists: true, $eq: recurrence._id },
          })
            .sort({ due_date: -1 })
            .populate('contact')
            .populate({
              path: 'owner',
              model: 'user',
              select: 'user_name email',
            });

          if (followUp) {
            if (!start_date && !end_date) {
              result.push(followUp);
            } else {
              let update_date;

              if (followUp.timezone) {
                update_date = moment
                  .tz(followUp.due_date, followUp.timezone)
                  .clone();
              } else {
                update_date = moment(followUp.due_date).clone();
              }

              let looping = true;
              while (looping && update_date) {
                let deleted;
                if (recurrence.deleted_due_dates) {
                  deleted = recurrence.deleted_due_dates.some((e) => {
                    return update_date.clone().isSame(moment(e));
                  });
                } else {
                  deleted = false;
                }

                let isValidDate = true;
                if (start_date && end_date) {
                  isValidDate = update_date.isBetween(
                    moment(start_date),
                    moment(end_date)
                  );
                } else if (start_date) {
                  isValidDate = update_date.isSameOrAfter(moment(start_date));
                } else if (end_date) {
                  isValidDate = update_date.isSameOrBefore(moment(end_date));
                }

                if (!deleted && isValidDate) {
                  result.push({
                    ...followUp._doc,
                    due_date: update_date.clone(),
                    _id: moment(followUp.due_date).isSame(update_date)
                      ? followUp._id
                      : mongoose.Types.ObjectId(),
                  });
                  looping = false;
                }

                switch (recurrence.recurrence_mode) {
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
          }
        }
      }

      const _query = { ...query };
      if (status === 0) {
        _query.set_recurrence = { $ne: true };
      }

      const follow_ups_from_db = await FollowUp.find({
        ..._query,
        set_recurrence: { $ne: true },
      })
        .populate('contact')
        .populate({
          path: 'owner',
          model: 'user',
          select: 'user_name email',
        })
        .lean();

      const all_follow_ups = _.orderBy(
        _.unionWith(follow_ups_from_db, result, _.isEqual),
        ['due_date'],
        [sortDir === 1 ? 'asc' : 'desc']
      );
      count = all_follow_ups.length;
      _follow_ups = all_follow_ups.slice(skip, skip + pageSize);
    } else {
      count = await FollowUp.countDocuments(query);
      _follow_ups = await FollowUp.find(query)
        .sort({ due_date: sortDir })
        .skip(skip)
        .limit(pageSize)
        .populate('contact')
        .populate({
          path: 'owner',
          model: 'user',
          select: 'user_name email',
        })
        .lean();
    }
  }

  return res.send({
    status: true,
    data: {
      count,
      tasks: _follow_ups,
    },
  });
};

const selectAll = async (req, res) => {
  const { currentUser } = req;
  const { types, status, contact, labels, start_date, end_date, str, name } =
    req.body;

  const query = { user: currentUser._id };
  types && types.length ? (query.type = { $in: types }) : false;
  if (typeof status !== 'undefined') {
    if (status instanceof Array) {
      query.status = { $in: status };
    } else {
      if (status === 0) {
        query.status = { $in: [0, 2] };
      } else {
        query.status = status;
      }
    }
  }
  contact ? (query.contact = contact) : (query.contact = { $ne: null });
  if (start_date) {
    query.due_date = { $gte: start_date };
  }
  if (end_date) {
    if (query.due_date) {
      query.due_date.$lt = end_date;
    } else {
      query.due_date = { $lte: end_date };
    }
  }
  if (str) {
    query.content = { $regex: '.*' + str + '.*' };
  }
  if (labels && labels.length) {
    const contacts = await Contact.find({
      user: currentUser._id,
      label: { $in: labels },
    }).select('_id');
    const contact_ids = contacts.map((e) => e._id);
    query.contact = { $in: contact_ids };
  }

  let selected_follows = [];
  if (name === 'all') {
    /*
      **
      query.status
      0: valid
      1: completed
      2: overdue
    */
    // to get only 1st ids of recurring followups those are still valid
    const recurring_first_follow_ups = await FollowUp.aggregate([
      {
        $match: {
          ...query,
          set_recurrence: true,
          status: 0,
          parent_follow_up: { $exists: true },
        },
      },
      {
        $sort: { due_date: 1 },
      },
      {
        $group: {
          _id: '$parent_follow_up',
          follow_up: { $first: '$_id' },
        },
      },
    ]);

    const addtional_query =
      JSON.stringify(query.status) === JSON.stringify({ $in: [0, 1, 2] }) ||
      query.status === 1
        ? {}
        : {
            $or: [
              {
                // to get all(recurring & non-recurring) followups those are already overdue
                status: 2,
                due_date: { $exists: true },
              },
              {
                // to get non-recurring followups those are still valid
                status: 0,
                due_date: { $exists: true },
                parent_follow_up: { $exists: false },
              },
              {
                // to get only 1st recurring followups those are still valid
                _id: {
                  $in: recurring_first_follow_ups.map((e) => e.follow_up),
                },
              },
            ],
          };
    selected_follows = await FollowUp.find({
      ...query,
      ...addtional_query,
    });
  } else {
    selected_follows = await FollowUp.find(query)
      // .select({
      //   _id: 1,
      //   status: 1,
      //   contact: 1,
      //   set_recurrence: 1,
      //   parent_follow_up: 1,
      //   due_date: 1,
      // })
      .lean();
  }

  // const _follow_ups = await FollowUp.find(query).select({ _id: 1, status: 1 });
  // const selected_follows = _follow_ups.map((e) => ({
  //   _id: e._id,
  //   status: e.status,
  // }));

  return res.send({
    status: true,
    data: selected_follows,
  });
};

const removeFollowUps = async (follow_ups, user, contacts) => {
  try {
    Activity.deleteMany({
      user,
      type: 'follow_ups',
      follow_ups: { $in: follow_ups },
    }).catch((err) => {
      console.log('activity follow up remove err', err.message);
    });

    if (contacts && contacts.length) {
      ActivityHelper.updateLastActivity(contacts);
    }

    outboundCallhookApi(
      user,
      outbound_constants.DELETE_TASK,
      getRemoveFollowupOutboundData,
      { ids: follow_ups }
    );

    await FollowUp.deleteMany({
      user,
      _id: { $in: follow_ups },
    }).catch((err) => {
      console.log('follow up delete err', err.message);
      return {
        status: false,
        error: 'follow up delete err',
      };
    });

    return { status: true };
  } catch (err) {
    console.log('err', err);
    return {
      status: false,
      error: err.message,
    };
  }
};

const getAutoList = async (req, res) => {
  const { currentUser } = req;
  const { type, contacts } = req.body;
  console.log('currentUser, type, contacts', [currentUser._id, type, contacts]);

  // let data = await FollowUp.find({
  //   user: currentUser._id,
  //   type: type,
  //   status: 0,
  //   set_auto_complete: true,
  //   contact: { $in: contacts },
  // })

  const data = await FollowUp.aggregate([
    {
      $match: {
        $and: [
          { user: mongoose.Types.ObjectId(currentUser._id) },
          { type },
          { status: 0 },
          { set_auto_complete: true },
          { contact: { $in: contacts } },
        ],
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: 'contact',
        foreignField: '_id',
        as: 'contact_info',
      },
    },
    {
      $unwind: {
        path: '$contact_info',
        preserveNullAndEmptyArrays: true,
      },
    },
  ]).catch((err) => {
    console.log('get list error: ', err);
    return res.status(400).json({
      status: false,
      error: 'auto list get error',
    });
  });
  console.log('get_list', data);

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'auto list doesn`t exist',
    });
  }

  return res.send(data);
};

module.exports = {
  get,
  load,
  create,
  update,
  completed,
  getByDate,
  selectAll,
  updateChecked,
  updateArchived,
  bulkUpdate,
  bulkCreate,
  leaveComment,
  removeFollowUps,
  getAutoList,
  uncompleted,
};
