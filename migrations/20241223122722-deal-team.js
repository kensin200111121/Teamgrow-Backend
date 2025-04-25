module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const users = await db.collection('users').find({ del: false }).toArray();
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      if (user.organization) {
        console.log(
          'user: ',
          user._id.toString(),
          'organization: ',
          user.organization.toString()
        );
        await db
          .collection('pipe_lines')
          .updateMany(
            { user: user._id },
            { $set: { organization: user.organization } }
          );
        await db
          .collection('deals')
          .updateMany(
            { user: user._id },
            { $set: { organization: user.organization } }
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
