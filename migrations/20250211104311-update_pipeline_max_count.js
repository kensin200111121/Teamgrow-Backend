module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const result = await db
      .collection('users')
      .updateMany(
        { package_level: 'PRO', 'pipe_info.max_count': { $lt: 10 } },
        { $set: { 'pipe_info.max_count': 10 } }
      );

    console.log(`Matched ${result?.matchedCount} documents`);
    console.log(`Updated ${result?.modifiedCount} documents`);
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
