// Timeline issue fix
const mongoose = require('mongoose');
const Task = require('../src/models/task');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrate();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrate = async () => {
  const tasks = await Task.find({ status: { $in: ['active', 'draft'] } });
  const processIds = [];
  tasks.forEach((e) => {
    if (!processIds.includes(e.process)) {
      processIds.push(e.process);
    }
  });
  const relatedTasks = await Task.countDocuments({
    process: { $in: processIds },
  });
  Task.deleteMany({ process: { $nin: processIds } }).then(() => {
    console.log('delete all completed tasks');
  });
};
