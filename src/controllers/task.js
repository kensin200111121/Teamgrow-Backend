const { v1: uuidv1 } = require('uuid');
const moment = require('moment-timezone');
const Task = require('../models/task');
const Contact = require('../models/contact');
const system_settings = require('../configs/system_settings');
const mongoose = require('mongoose');
const { checkIdentityTokens } = require('../helpers/user');

const get = async (req, res) => {
  const { currentUser } = req;

  const data = await Task.find({ user: currentUser.id });
  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Task doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const task = new Task({
    ...req.body,
    source: 'schedule',
    user: currentUser.id,
  });

  task.save().catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });

  return res.send({
    status: true,
  });
};

const bulkCreate = async (req, res) => {
  const { currentUser } = req;
  const {
    contacts: inputContacts,
    deal: inputDeal,
    data,
    toEmails,
    toPhones,
  } = req.body;
  await checkIdentityTokens(currentUser);
  const STANDARD_CHUNK = 10;
  const taskProcessId = new Date().getTime() + uuidv1();

  if (data.type === 'send_email') {
    const max_email_count =
      currentUser['email_info']['max_count'] ||
      system_settings.EMAIL_DAILY_LIMIT.BASIC;

    if (!currentUser.primary_connected) {
      return res.status(406).json({
        status: false,
        error: 'no connected',
      });
    }

    if (inputContacts.length > max_email_count) {
      return res.status(400).json({
        status: false,
        error: 'Email max limited',
      });
    }
    if (inputDeal && inputContacts.length > STANDARD_CHUNK) {
      return res.status(400).json({
        status: false,
        error: 'more than 10 contacts',
      });
    }
  } else if (data.type === 'send_text') {
    if (inputContacts.length > system_settings.TEXT_ONE_TIME) {
      return res.status(400).json({
        status: false,
        error: `You can send max ${system_settings.TEXT_ONE_TIME} contacts at a time`,
      });
    }

    if (!currentUser['twilio_number'] && !currentUser['wavv_number']) {
      return res.status(408).json({
        status: false,
        error: 'No phone',
      });
    }
  }
  if (
    !(
      currentUser.connected_email_type === 'smtp' &&
      currentUser.primary_connected
    ) &&
    data.type === 'send_email' &&
    inputContacts.length > 1
  ) {
    // if schedule time's minute is less than 5, then set 0,
    // if it's between 6~9 then next next 0
    const _min_value = moment(data.due_date).minutes();
    const remained = _min_value % 5;
    let new_min;
    if (remained >= 3) {
      new_min = _min_value + (5 - remained);
    } else {
      new_min = _min_value - remained;
    }
    const base_time = moment(data.due_date)
      .minutes(new_min)
      .seconds(0)
      .milliseconds(0);
    let repeatCount = 0;
    let contactsToTemp = [...inputContacts];

    let last_task;
    while (repeatCount <= 4 && contactsToTemp.length > 0) {
      const due_date = moment(base_time).add(repeatCount, 'minutes');
      const tasks = await Task.find({
        user: currentUser.id,
        status: { $in: ['active', 'pending'] },
        source: 'schedule',
        type: 'send_email',
        due_date,
      });

      let contactCount = 0;
      if (tasks?.length > 0) {
        tasks.forEach((t) => {
          if (t.contacts?.length) {
            contactCount += t.contacts.length;
          }
        });
      }

      const availableCount = STANDARD_CHUNK - contactCount;
      // scheduled by deal

      if (availableCount > contactsToTemp.length) {
        const task = new Task({
          ...data,
          user: currentUser.id,
          process: taskProcessId,
          contacts: [...contactsToTemp],
          due_date,
          status: !last_task ? 'active' : 'pending',
          deal: inputDeal || undefined,
          parent_ref: !last_task ? 'a_10000' : last_task?.id,
        });
        await task.save().catch((err) => {
          console.log('deal schedule save err', err.message);
        });
        last_task = task;
        contactsToTemp = [];
      } else if (availableCount > 0 && !inputDeal) {
        // scheduled by contacts
        const task = new Task({
          ...data,
          user: currentUser.id,
          process: taskProcessId,
          contacts: contactsToTemp.slice(0, availableCount),
          due_date,
          status: !last_task ? 'active' : 'pending',
          parent_ref: !last_task ? 'a_10000' : last_task?.id,
        });
        await task.save().catch((err) => {
          console.log('contact schedule save err', err.message);
        });
        last_task = task;
        contactsToTemp = contactsToTemp.slice(availableCount);
      }
      repeatCount++;
    }

    if (contactsToTemp.length > 0) {
      if (inputDeal) {
        return res.status(400).json({
          status: false,
          error: 'Your time has been already scheduled',
        });
      } else {
        const findContacts = contactsToTemp.map((c) => {
          return mongoose.Types.ObjectId(c + '');
        });
        const contactsObj = await Contact.aggregate([
          {
            $match: {
              _id: { $in: findContacts },
            },
          },
          {
            $project: {
              _id: 1,
              first_name: 1,
              last_name: 1,
              email: 1,
            },
          },
        ]);
        return res.status(405).json({
          status: false,
          data: {
            contactsObj,
            contactIds: contactsToTemp,
          },
        });
      }
    }
  } else {
    // smtp email & text schedule
    const task = new Task({
      ...data,
      user: currentUser.id,
      process: taskProcessId,
      contacts: inputContacts,
      status: 'active',
      deal: inputDeal || undefined,
      receivers: data.type === 'send_email' ? toEmails : toPhones,
    });
    task.save().catch((err) => {
      console.log('schedule save err', err.message);
    });
  }

  return res.send({
    status: true,
    message: 'all_queue',
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  Task.deleteOne({ user: currentUser._id, _id: id }).catch((err) => {
    console.log('task remove err', err.message);
  });

  return res.send({
    status: true,
  });
};

const removeScheduleItem = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.body;

  try {
    await Task.deleteOne({ user: currentUser._id, _id: id }).catch((err) => {
      console.log('task remove error', err);
    });
    return res.send({ status: true });
  } catch (err) {
    return res
      .status(500)
      .json({ status: true, error: err.message || 'Internal Server Error' });
  }
};

const update = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const data = req.body;

  Task.updateOne({ user: currentUser._id, _id: id }, { $set: data }).catch(
    (err) => {
      console.log('task update err', err.message);
    }
  );
  return res.send({
    status: true,
  });
};

/**
 * Check the mass contacts task: This is called when change the primary email
 * @param {*} req
 * @param {*} res
 */
const getMassTasks = async (req, res) => {
  const { currentUser } = req;

  Task.find({ 'contacts.15': { $exists: true }, user: currentUser._id })
    .select({
      process: true,
      'action.subject': true,
    })
    .then((_tasks) => {
      return res.send({
        status: true,
        data: _tasks,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || err,
      });
    });
};

/**
 * Remove the contact from schedule item: This is called when delete the shcedule item from contact details page
 */
const removeContact = async (req, res) => {
  const { currentUser } = req;
  const { id, contact } = req.body;

  const task = await Task.findOne({ user: currentUser._id, _id: id }).catch(
    (err) => {
      console.log('Task find error: ', err);
      return res.status(500).json({
        status: false,
        error: err.message || 'Internal Server Error',
      });
    }
  );
  if (!task) {
    return res.status(404).json({
      status: false,
      error: "Schedule item doesn't exist",
    });
  }
  await Task.updateOne(
    { user: currentUser._id, _id: id },
    { $pull: { contacts: contact } }
  ).catch((err) => {
    console.log('Schedule item update error: ', err);
    return res.status(500).json({
      status: false,
      error: err.message || 'Internal Server Error',
    });
  });
  if (task.contacts && task.contacts.length > 1) {
    Task.delete({
      user: currentUser._id,
      _id: id,
      'contacts.0': { $exists: false },
    }).catch(() => {
      console.log('Empty Scheduled Item remove is failed');
    });
  }
  return res.send({ status: true });
};

module.exports = {
  get,
  create,
  bulkCreate,
  remove,
  removeScheduleItem,
  update,
  getMassTasks,
  removeContact,
};
