const mongoose = require('mongoose');
const moment = require('moment-timezone');

const { ENV_PATH } = require('../src/config/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/config/database');
const Task = require('../src/models/task');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    migrateDueTimes();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateDueTimes = async () => {
  Task.find(
    {
      status: 'active',
      type: 'send_email',
      due_date: { $lte: moment().add(20, 'minute').toDate() },
    },
    { _id: true }
  ).then(async (tasks) => {
    const date = moment().add(49, 'hour');
    console.log('message', tasks.length);
    for (let i = 0; i < tasks.length; i++) {
      date.add(1, 'minute');
      const task = tasks[i];
      console.log('date', i, date, date.toDate(), task);
      await Task.updateOne(
        { _id: task._id },
        { $set: { due_date: date.toDate(), status: 'active' } }
      )
        .then(() => {
          console.log('reset up the due date');
        })
        .catch((err) => {
          console.log('err.message', err.message);
        });
    }
  });
};
