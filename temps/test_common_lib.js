const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const Timeline = require('@teamgrow/common');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    migrateContactTimelines();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateContactTimelines = async () => {
  const timelinesCount = await Timeline.countDocuments({});
  console.log('timelinesCount', timelinesCount);
};
