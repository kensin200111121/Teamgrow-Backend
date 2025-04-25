const mongoose = require('mongoose');
const CustomField = require('../src/models/custom_field');
const Garbage = require('../src/models/garbage');
const User = require('../src/models/user');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));
// TODO write your migration here.
// See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
// Example:
// await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

const test = async () => {
  const users = await User.find({ del: false }).catch((e) => {
    console.log('---get users error', e?.error);
  });
  for (let index = 0; index < users.length; index++) {
    const user = users[index];
    const garbage = await Garbage.findOne({ user: user._id }).catch((e) => {
      console.log('---get garbage error', e?.error);
    });
    if (garbage == null) continue;
    const { additional_fields } = garbage;
    if (additional_fields && additional_fields.length) {
      for (let j = 0; j < additional_fields.length; j++) {
        const field = additional_fields[j];
        const { id, status, ...rest } = field;
        console.log('field:', rest);
      }
    }
  }
};

test();
