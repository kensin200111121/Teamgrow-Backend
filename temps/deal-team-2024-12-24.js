const mongoose = require('mongoose');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const User = require('../src/models/user');
const PipeLine = require('../src/models/pipe_line');
const Deal = require('../src/models/deal');

const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrateUserDealTeam();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateUserDealTeam = async () => {
  const users = await User.find({ email: 'wang@crmgrow.com', del: false });
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.organization) {
      console.log(
        'updated user pipeline and deals: user: ',
        user._id.toString(),
        'organization: ',
        user.organization.toString()
      );
      await PipeLine.updateMany(
        { user: user._id },
        { $set: { organization: user.organization } }
      );

      await Deal.updateMany(
        { user: user._id },
        { $set: { organization: user.organization } }
      );
    }
  }
  console.log('Completed.');
};
