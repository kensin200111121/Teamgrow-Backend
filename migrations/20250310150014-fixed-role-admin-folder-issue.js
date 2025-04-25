module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const users = await db.collection('users').find({ del: false }).toArray();
    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      await db
        .collection('folders')
        .updateOne(
          { user: user._id, role: 'admin' },
          { $unset: { role: true } }
        );
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
