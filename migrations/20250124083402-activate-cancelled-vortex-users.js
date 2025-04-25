const { activeUser: reactivateUserHelper } = require('../src/helpers/user');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const suspendVortexUsers = await db
      .collection('users')
      .find({
        user_disabled: true,
        vortex_id: { $exists: true },
        del: false,
      })
      .toArray();

    console.log(
      'Number of cancelled vortex users: ',
      suspendVortexUsers.length
    );

    return;
    for (const user of suspendVortexUsers) {
      console.log('Calling reactivate user API on this user: ', user._id);
      try {
        await reactivateUserHelper(user._id);
        console.log('Reactivated on this user: ', user._id);
      } catch (error) {
        console.error(
          'Failed to reactivate this user: ',
          user._id,
          error.message
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
