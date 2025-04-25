var mongoose = require('mongoose');
const { getWavvUserState } = require('../src/services/message');
// const subscribers = require('../temps/wavv_status_checking'); // const subscribers = [];

module.exports = {
  async up(db, client) {
    /**
     * From the activated users, check the wavv account
     * And set up the dialer_info
     */
    const existPrimaryUsers = await db
      .collection('users')
      .find({
        is_primary: true,
        del: { $ne: true },
      })
      .toArray();
    console.log('Number of exist primary users: ', existPrimaryUsers.length);
    for (let i = 0; i < existPrimaryUsers.length; i++) {
      const user = existPrimaryUsers[i];
      console.log('call get wavv user API on this user: ', user._id);
      const wavvUser = await getWavvUserState(user._id).catch(() => {});
      let dialerInfoLevel = null;
      if (
        wavvUser?.subscriptions?.single ||
        wavvUser?.subscriptions?.['single-no-rvm']
      ) {
        dialerInfoLevel = 'SINGLE';
      } else if (
        wavvUser?.subscriptions?.multi ||
        wavvUser?.subscriptions?.['multi-no-rvm']
      ) {
        dialerInfoLevel = 'MULTI';
      }
      if (dialerInfoLevel) {
        console.log('Dialer Info Level', dialerInfoLevel);
        if (
          user.dialer_info?.is_enabled &&
          user.dialer_info?.level === dialerInfoLevel
        ) {
          console.log('no need to update');
        } else if (user.dialer_info?.is_enabled) {
          console.log('level has been changed.');
        } else {
          console.log('need to set up');
          await db
            .collection('users')
            .updateOne(
              { _id: user._id },
              {
                $set: {
                  'dialer_info.is_enabled': true,
                  'dialer_info.level': dialerInfoLevel,
                },
              }
            )
            .then(() => {
              console.log('set up succeed');
            })
            .catch(() => {
              console.log('set up failed');
            });
        }
      }
      // if (dialerInfoLevel) {
      //   await db.collection('users').updateOne(
      //     { _id: user._id },
      //     {
      //       $set: {
      //         'dialer_info.is_enabled': true,
      //         'dialer_info.level': dialerInfoLevel,
      //       },
      //     }
      //   );
      // }
      if (
        wavvUser?.subscriptions?.sms &&
        wavvUser?.subscriptions?.smsBrandRegistration
      ) {
        console.log(
          'current user information',
          user.text_info,
          user.wavv_status
        );
        // await db.collection('users').updateOne(
        //   { _id: user._id },
        //   {
        //     $set: {
        //       'text_info.initial_credit': true,
        //     },
        //   }
        // );
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};

/**
 * This is executed from the csv subscribers (csv data)
 * check the db user and wavv user subscriptions
 * compare between both items
 */
const migrateLogic2 = async (db) => {
  for (let i = 0; i < subscribers.length; i++) {
    let vendorUserId = subscribers[i].vendorUserId;
    try {
      vendorUserId = mongoose.Types.ObjectId(vendorUserId);
    } catch (err) {
      continue;
    }
    console.log('wavv user checking ', i, ' ', vendorUserId);
    // get wavv state
    const wavvUser = await getWavvUserState(vendorUserId).catch(() => {});
    // get user data
    const dbUser = await db
      .collection('users')
      .findOne({ _id: vendorUserId })
      .catch(() => {});
    if (!dbUser) {
      console.log('not found');
      continue;
    }
    if (dbUser?.del) {
      console.log('deleted already');
    } else {
      let dialerInfoLevel = '';
      if (
        wavvUser?.subscriptions?.single ||
        wavvUser?.subscriptions?.['single-no-rvm']
      ) {
        dialerInfoLevel = 'SINGLE';
      } else if (
        wavvUser?.subscriptions?.multi ||
        wavvUser?.subscriptions?.['multi-no-rvm']
      ) {
        dialerInfoLevel = 'MULTI';
      }
      if (dialerInfoLevel) {
        console.log('Dialer Info Level', dialerInfoLevel);
        if (
          dbUser.dialer_info?.is_enabled &&
          dbUser.dialer_info?.level === dialerInfoLevel
        ) {
          console.log('no need to update');
        } else if (dbUser.dialer_info?.is_enabled) {
          console.log('level has been changed.');
        } else {
          console.log('need to set up');
          await db
            .collection('users')
            .updateOne(
              { _id: dbUser._id },
              {
                $set: {
                  'dialer_info.is_enabled': true,
                  'dialer_info.level': dialerInfoLevel,
                },
              }
            )
            .then(() => {
              console.log('set up succeed');
            })
            .catch(() => {
              console.log('set up failed');
            });
        }
      }

      if (
        wavvUser?.subscriptions?.sms &&
        wavvUser?.subscriptions?.smsBrandRegistration
      ) {
        console.log(
          'current user information',
          dbUser.text_info,
          dbUser.wavv_status
        );
      }
    }
  }
};
