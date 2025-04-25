const mongoose = require('mongoose');
const User = require('../src/models/user');
const Garbage = require('../src/models/garbage');
const { TEAM_DEFAULT_SETTINGS } = require('../constants/user');
const { ENV_PATH } = require('../config/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../config/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrateTeamSettingsInGarbage();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateTeamSettingsInGarbage = async () => {
  const users = (await User.find({ 'assignee_info.is_editable': true })).map(
    (user) => user._id
  );

  if (users.length === 0) {
    console.log('there is no data to migrate.');
    return;
  }
  console.log('migrating Garbage model ..........');
  await Garbage.updateMany(
    { user: { $in: users } },
    { $set: { team_settings: TEAM_DEFAULT_SETTINGS } }
  ).catch((err) => {
    console.log('migration failed: ', err);
  });

  console.log('migrating User model ..........');
  await User.updateMany(
    {
      $or: [{ login_disabled: { $exists: false } }, { login_disabled: false }],
    },
    { $set: { login_enabled: true } }
  ).catch((err) => {
    console.log('migration User model failed: ', err);
  });

  await User.updateMany(
    { login_disabled: true },
    { $set: { login_enabled: false } }
  ).catch((err) => {
    console.log('migration User model failed: ', err);
  });

  await User.updateMany(
    {
      $or: [
        { master_disabled: { $exists: false } },
        { master_disabled: false },
      ],
    },
    { $set: { master_enabled: true } }
  ).catch((err) => {
    console.log('migration User model failed: ', err);
  });

  await User.updateMany(
    { master_disabled: true },
    { $set: { master_enabled: false } }
  ).catch((err) => {
    console.log('migration User model failed: ', err);
  });

  console.log('migration successful!');
};
