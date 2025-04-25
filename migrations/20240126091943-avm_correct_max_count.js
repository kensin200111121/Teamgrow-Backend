module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    await db.collection('users').updateMany(
      {
        package_level: 'LITE',
        $or: [
          { 'agent_vending_info.is_enabled': true },
          { 'agent_vending_info.max_count': { $exists: true } },
        ],
      },
      {
        $set: {
          'agent_vending_info.is_enabled': false,
        },
        $unset: {
          'agent_vending_info.max_count': 1,
        },
      }
    );

    await db.collection('users').updateMany(
      {
        package_level: 'PRO',
        $or: [
          { 'agent_vending_info.is_enabled': false },
          { 'agent_vending_info.max_count': { $ne: 5 } },
        ],
      },
      {
        $set: {
          'agent_vending_info.is_enabled': true,
          'agent_vending_info.max_count': 5,
        },
      }
    );

    await db.collection('users').updateMany(
      {
        package_level: 'ELITE',
        $or: [
          { 'agent_vending_info.is_enabled': false },
          { 'agent_vending_info.max_count': { $ne: 10 } },
        ],
      },
      {
        $set: {
          'agent_vending_info.is_enabled': true,
          'agent_vending_info.max_count': 10,
        },
      }
    );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
