// Timeline issue fix
const mongoose = require('mongoose');
const Task = require('../src/models/task');
const User = require('../src/models/user');
const Folder = require('../src/models/folder');
const Automation = require('../src/models/automation');
const EvenType = require('../src/models/event_type');
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
  await EvenType.updateMany({ duration: { $exists: true } }, [
    { $set: { start_time_increment: '$duration' } },
  ]);
  console.log('Done');
};
