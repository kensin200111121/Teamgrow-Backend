/**
 * Author: Jian and LiWei
 * This file will backup the old contact json data again avoding the _id and email confliction on the specified user account.
 */
const mongoose = require('mongoose');
const User = require('../src/models/user');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('connected');
    matchUsers();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const vortex_users = [
  {
    crm_user_id: '63d77a067b469e272471a03d',
    vortex_id: '123456789',
    email: 'liwei@crmgrow.com',
  },
];
const ObjectId = (str) => str;
const matchUsers = async () => {
  for (let i = 0; i < vortex_users.length; i++) {
    const user = await User.findOne({
      _id: mongoose.Types.ObjectId(vortex_users[i].crm_user_id),
    }).catch(() => {});
    if (user) {
      console.log('already exists');
      await User.updateOne(
        { _id: user.id },
        { $set: { vortex_id: vortex_users[i].vortex_id, source: 'vortex' } }
      );
      continue;
    } else {
      const vortex_user = await User.findOne({
        vortex_id: vortex_users[i].vortex_id,
        email: vortex_users[i].email,
      }).catch(() => {});
      if (vortex_user) {
        console.log('user founded');
        const old_user_id = vortex_user._id;
        vortex_user._id = ObjectId(vortex_users[i].crm_user_id);
        await User.insertMany([vortex_user]);
        // await User.updateOne(
        //   { _id: vortex_user.id },
        //   {
        //     $set: { id: mongoose.Types.ObjectId(vortex_users[i].crm_user_id) },
        //   }
        // );
        await User.deleteOne({ _id: vortex_user._id });
        console.log(old_user_id);
      }
    }
  }
  console.log('matching finished');
};
