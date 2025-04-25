const { deleteWavvUser, getWavvUserState } = require('../src/services/message');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const delPrimaryUsers = await db
      .collection('users')
      .find({
        is_primary: true,
        vortex_id: { $exists: false },
        del: true,
      })
      .toArray();

    console.log('Number of removed primary users: ', delPrimaryUsers.length);

    for (let i = 0; i < delPrimaryUsers.length; i++) {
      const user = delPrimaryUsers[i];
      console.log('call delete wavv user API on this user: ', user._id);
      deleteWavvUser(user._id);
      console.log('delete wavv user field on this user: ', user._id);
      await db
        .collection('users')
        .updateOne({ _id: user._id }, { $unset: { wavv_number: true } });
    }

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
      const wavvUser = await getWavvUserState(user._id);
      let dialerInfoLevel = null;
      if (wavvUser?.subscriptions?.single) {
        console.log(
          'update user dialer_info with SINGLE field on this user: ',
          user._id
        );
        dialerInfoLevel = 'SINGLE';
      } else if (wavvUser?.subscriptions?.multi) {
        console.log(
          'update user dialer_info with MULTI field on this user: ',
          user._id
        );
        dialerInfoLevel = 'MULTI';
      }
      if (dialerInfoLevel) {
        await db.collection('users').updateOne(
          { _id: user._id },
          {
            $set: {
              'dialer_info.is_enabled': true,
              'dialer_info.level': dialerInfoLevel,
            },
          }
        );
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
