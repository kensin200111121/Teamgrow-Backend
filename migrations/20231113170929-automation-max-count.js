module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    await db
      .collection('users')
      .updateMany(
        { package_level: 'PRO' },
        { $set: { 'automation_info.max_count': 1000 } }
      );
    await db
      .collection('users')
      .updateMany(
        { package_level: 'ELITE' },
        { $set: { 'automation_info.max_count': 3000 } }
      );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
