const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const User = require('../src/models/user');
const system_settings = require('../src/configs/system_settings');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    migrateUpdateTeamInfo();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateUpdateTeamInfo = async () => {
  const timelinesCount = await User.updateOne(
    {
      email: 'wang@crmgrow.com',
      user_version: { $lte: system_settings.USER_VERSION },
    },
    {
      $set: {
        'team_info.is_enabled': true,
      },
    }
  );
  console.log('timelinesCount', timelinesCount);
};
