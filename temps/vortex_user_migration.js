const mongoose = require('mongoose');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const User = require('../src/models/user');
const Garbage = require('../src/models/garbage');
const Folder = require('../src/models/folder');
const SphereBucket = require('../src/models/sphere_bucket');
const { createAdminFolder } = require('../src/helpers/user');
const { initContactBuckets } = require('../src/helpers/sphere_bucket');

const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrateUserRelatedData();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrate = async () => {
  var stageUsers = [
    // {
    //   CRM_CUSTOMER_ID: '64372a5b12610c5c7bd05eeb',
    //   VORTEX_CUSTOMER_ID: 93,
    //   email: 'mark@redx.com',
    // }
  ];

  const users = stageUsers;
  const userIdsToMigrate = [];
  const usersToUpdate = [];

  for (let i = 0; i < users.length; i++) {
    const userId = users[i].CRM_CUSTOMER_ID;

    const user = await User.findById(userId).catch((err) => {
      console.log('user getting error', err);
    });

    if (!user) {
      console.log('not found the user', users[i]);
      if (users[i].email) {
        const existUser = await User.findOne({ email: users[i].email }).catch(
          (err) => {
            console.log('existing user getting error', err);
          }
        );
        if (existUser) {
          console.log('found the exist user', existUser._id, existUser.email);
          usersToUpdate.push(users[i]);
        } else {
          console.log('non exist');
          userIdsToMigrate.push(users[i].CRM_CUSTOMER_ID);
        }
      } else {
        console.log('not found the email');
      }
    } else {
      console.log('vortex id and source', user.vortex_id, user.source);
      users[i].email = user.email;
    }
  }
  // console.log('users', JSON.stringify(users));
  console.log('users to migrate from dev', userIdsToMigrate);
  console.log('users to update in stage', usersToUpdate);
};

const migrateUserRelatedData = async () => {
  const userIds = [
    // '644fdef990f94a0a532fa4b0',
  ];

  for (let i = 0; i < userIds.length; i++) {
    const userId = mongoose.Types.ObjectId(userIds[i]);
    console.log('migrating i', i, userId);

    const existingGarbage = await Garbage.findOne({ user: userId }).catch(
      () => {}
    );
    if (!existingGarbage) {
      console.log('creating garbage');
      const garbage = new Garbage({
        user: userId,
      });

      await garbage
        .save()
        .then((_garbage) => {
          console.log('garbage');
        })
        .catch((err) => {
          console.log('garbage save err', err.message);
        });
    }

    const existingFolder = await Folder.findOne({
      user: userId,
      rootFolder: true,
      del: false,
    }).catch(() => {});

    if (!existingFolder) {
      console.log('creating admin folder');
      createAdminFolder(userId);
    }

    const existingBucket = await SphereBucket.findOne({ user: userId }).catch(
      () => {}
    );
    if (!existingBucket) {
      console.log('creating sphere settings');
      initContactBuckets(userId);
    }
  }
};
