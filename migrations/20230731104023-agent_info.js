module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    await db.collection('users').updateMany(
      {
        package_level: { $in: ['ELITE', 'EVO_ELITE'] },
        del: false,
      },
      {
        $set: {
          agent_vending_info: {
            is_limit: true,
            is_enabled: true,
            max_count: 5,
          },
        },
      }
    );
    await db.collection('users').updateMany(
      {
        package_level: { $in: ['PRO', 'EVO_PRO'] },
        del: false,
      },
      {
        $set: {
          agent_vending_info: {
            is_limit: true,
            is_enabled: true,
            max_count: 2,
          },
        },
      }
    );
    await db.collection('users').updateMany(
      {
        package_level: { $nin: ['ELITE', 'EVO_ELITE', 'PRO', 'EVO_PRO'] },
        del: false,
      },
      {
        $set: {
          agent_vending_info: {
            is_limit: true,
            is_enabled: false,
            max_count: 0,
          },
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
