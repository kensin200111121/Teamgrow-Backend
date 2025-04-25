const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const User = require('../src/models/user');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    updatePipelineInfo();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const updatePipelineInfo = async () => {
  const result = await User.updateMany(
    {
      package_level: 'PRO',
      'pipe_info.max_count': { $lt: 10 },
    },
    {
      $set: { 'pipe_info.max_count': 10 },
    }
  );
  console.log(`Matched ${result?.matchedCount} documents`);
  console.log(`Updated ${result?.modifiedCount} documents`);
};
