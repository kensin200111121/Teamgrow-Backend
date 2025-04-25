const Task = require('../models/task');
const system_settings = require('../configs/system_settings');
const { v1: uuidv1 } = require('uuid');
const moment = require('moment-timezone');
const { calcDueDate, sendErrorToSentry } = require('./utility');
const Notification = require('../models/notification');

const RECURR_UNITS = {
  DAILY: 'day',
  MONTHLY: 'month',
  YEARLY: 'year',
  WEEKLY: 'week',
};

const bulkAssign = async (data) => {
  const {
    currentUser,
    inputContacts,
    source,
    taskProcessId,
    CHUNK_COUNT,
    MIN_CHUNK,
    action_content,
    deal,
  } = data;

  const TIME_GAPS = [1, 2, 3];

  let contacts = [...inputContacts];
  let contactsToTemp = [];

  // get the latest task for current user.
  let lastTask = await Task.findOne({
    user: currentUser._id,
    type: 'send_email',
    status: 'active',
    source: {
      $in: ['bulk_email', 'automation'],
    },
    is_last: true,
  }).catch((error) => {
    console.log('can`t find the last task', error.message);
  });
  let chunk_id;
  const range =
    Math.floor(Math.random() * (CHUNK_COUNT - MIN_CHUNK)) + MIN_CHUNK;
  let lastChunkAmount = 0;
  let availableContactCount;
  let last_due;
  if (lastTask) {
    // if last chunk exists, then get the time and determine what's left amount to be added in the last chunk
    const lastChunkTasks = await Task.find({
      user: currentUser._id,
      chunk: lastTask.chunk,
    }).catch((error) => {
      console.log('there is no task');
    });
    for (const task of lastChunkTasks) {
      lastChunkAmount += task.contacts.length;
    }
    if (lastChunkAmount < range) {
      chunk_id = lastTask.chunk;
      availableContactCount = range - lastChunkAmount;
    } else {
      chunk_id = new Date().getTime() + uuidv1();
      availableContactCount = range;
    }

    // if this is deal bulk-email, we fill up the input contacts on a chunk.
    if (deal && availableContactCount < contacts.length) {
      chunk_id = new Date().getTime() + uuidv1();
      availableContactCount = range;
    }
    last_due = lastTask.due_date;
  } else {
    // lf the last chunk is not existing, then generate new chunk id and random amount between mix/max
    chunk_id = new Date().getTime() + uuidv1();
    availableContactCount = range;
    last_due = moment();
  }

  // if last chunk doesn't exist, we will skip this
  // if last chunk exist, this is the logic where you are inserting task with the left allowed amount into the last chunk
  if (availableContactCount && chunk_id === lastTask?.chunk) {
    // Split From Here
    const task = new Task({
      user: currentUser.id,
      contacts: contacts.slice(0, availableContactCount),
      status: lastTask.status,
      process: taskProcessId,
      type: 'send_email',
      action: {
        ...action_content,
        contacts: undefined,
      },
      due_date: lastTask.due_date,
      period: lastTask.period,
      source: !source ? 'bulk_email' : source,
      chunk: chunk_id,
      deal,
      parent_ref: lastTask.id,
    });

    task.save().catch((err) => {
      console.log('campaign job save err', err.message);
    });
    lastTask = task;
    contactsToTemp = [...contacts.slice(availableContactCount)];
    contacts = [];
  } else if (!lastTask) {
    // Handle First Chunk and Create With Anothers
    contactsToTemp = contacts.slice(range);
    contacts = contacts.slice(0, range);
  } else {
    // put all contacts on queue.
    contactsToTemp = contacts;
    contacts = [];
  }
  // check current time is business day & time
  last_due = moment(last_due);
  const business_time = {
    due_date: last_due,
    user: currentUser.id,
  };
  const _due_date = await calcDueDate(business_time);
  let inBusinessHour = true;
  if (_due_date.diff(last_due, 'minutes') > 1) {
    inBusinessHour = false;
  }

  let delay = 2;
  let taskIndex = 0;
  if (lastTask && contactsToTemp.length) {
    await Task.updateOne({ _id: lastTask.id }, { $unset: { is_last: 1 } });
  }
  while (taskIndex < contactsToTemp.length) {
    let due_date;
    let period;
    let status = 'active';

    if (taskIndex === 0) {
      // for the first task.
      due_date = last_due.add(delay, 'minutes');
      // Check with the business hour
      const business_time = {
        due_date,
        user: currentUser.id,
      };
      due_date = inBusinessHour ? await calcDueDate(business_time) : due_date;
    } else {
      period = delay;
      status = 'pending';
    }

    const chunk =
      Math.floor(Math.random() * (CHUNK_COUNT - MIN_CHUNK)) + MIN_CHUNK;

    const task = new Task({
      user: currentUser.id,
      contacts: contactsToTemp.slice(taskIndex, taskIndex + chunk),
      deal,
      status,
      process: taskProcessId,
      type: 'send_email',
      action: {
        ...action_content,
        contacts: undefined,
      },
      // add that always in the first task.
      ...(due_date && { due_date }),
      ...(period && { period }),
      source: !source ? 'bulk_email' : source,
      chunk: chunk_id,
      parent_ref: !lastTask ? 'a_10000' : lastTask?.id,
    });

    await task.save().catch((err) => {
      console.log('campaign job save err', err.message);
    });

    taskIndex += chunk;
    const timeIndex = Math.floor(Math.random() * TIME_GAPS.length);
    delay = TIME_GAPS[timeIndex];
    last_due = due_date;
    lastTask = task;
  }

  if (lastTask) {
    await Task.updateOne({ _id: lastTask.id }, { $set: { is_last: true } });
  }
  return {
    contacts,
    contactNumOnQueue: contactsToTemp.length,
    due_date: last_due,
  };
};

const activeNext = async (task) => {
  const { id, process, source } = task;
  if (!process) return;
  const next_task = await Task.findOne({
    process,
    status: 'pending',
    parent_ref: id,
  }).catch((error) => {
    console.log('not be found the next task', error.message);
  });

  if (next_task) {
    const update_data = { status: 'active' };
    if (source !== 'schedule') {
      update_data['due_date'] = await calcDueDate(next_task);
    }

    Task.updateOne(
      {
        _id: next_task._id,
      },
      {
        $set: update_data,
      }
    ).catch((err) => {
      console.log('timeline update err', err.message);
    });
  } else {
    const tasks = await Task.find(
      { process },
      {
        _id: 1,
        exec_result: 1,
        contacts: 1,
        action: 1,
        type: 1,
        user: 1,
        source: 1,
        recurrence_mode: 1,
        set_recurrence: 1,
      }
    );
    if (!tasks.length) {
      console.log('Tasks are completed already.');
      sendErrorToSentry('', process, 'Tasks are completed already');
      return;
    }

    let failed = [];
    let succeed = [];
    let notExecuted = [];
    let contacts = [];
    tasks.forEach((e) => {
      const execResult = e.exec_result || {};
      contacts = [...contacts, ...e.contacts];
      failed = [...failed, ...(execResult.failed || [])];
      succeed = [...succeed, ...(execResult.succeed || [])];
      notExecuted = [...notExecuted, ...(execResult.notExecuted || [])];
    });

    const action = tasks[0].action;
    const criteria = tasks[0].type;
    const user = tasks[0].user;
    action['source'] = tasks[0].source;
    action['recurrence_mode'] = tasks[0].recurrence_mode;
    action['set_recurrence'] = tasks[0].set_recurrence;

    const notification = new Notification({
      detail: action,
      type: 'personal',
      criteria,
      user,
      // contact,
      status: 'completed',
      process,
      deliver_status: {
        contacts,
        failed,
        succeed,
        notExecuted,
      },
    });
    notification.save().catch(() => {
      console.log('notification creation is failed');
    });

    if (source === 'schedule' && task.recurrence_mode) {
      const first_task = await Task.findOne({ process, parent_ref: 'a_10000' });

      if (!first_task) {
        console.log('First task not found.');
        sendErrorToSentry('', process, 'First task not found.');
        return;
      }
      const unit = RECURR_UNITS[task.recurrence_mode];
      const newTime = moment
        .tz(first_task.due_date, task.timezone)
        .add(1, unit);
      await Task.updateOne(
        { _id: first_task._id },
        { $set: { due_date: newTime, status: 'active' } }
      );

      const tasks = await Task.find(
        { process, parent_ref: { $ne: 'a_10000' } },
        { _id: true, parent_ref: true }
      );

      for (const e of tasks) {
        const unit = RECURR_UNITS[task.recurrence_mode];
        const newTime = moment.tz(e.due_date, task.timezone).add(1, unit);

        const result = await Task.updateOne(
          { _id: e._id },
          { $set: { due_date: newTime, status: 'pending' } }
        );

        if (result) {
          console.log(`Task ID: ${e._id} updated successfully.`);
        }
      }
    } else {
      Task.deleteMany({ process }).catch((err) => {
        console.log('Delete tasks error: ', err);
      });
    }
  }
};

module.exports = {
  bulkAssign,
  activeNext,
};
