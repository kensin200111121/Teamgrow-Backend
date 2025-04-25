const mongoose = require('mongoose');
const User = require('../../models/user');
const { ENV_PATH } = require('../../config/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../config/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrateUserBillingEnabled();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateUserBillingEnabled = async () => {
  await User.updateMany(
    { is_primary: true },
    { $set: { billing_access_enabled: true } }
  ).catch((err) => {
    console.log('migration User model failed: ', err);
  });
  console.log('migration successful!');
};
