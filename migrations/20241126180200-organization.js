module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    await db.collection('users').updateMany(
      {
        is_primary: true,
        del: false,
      },
      {
        $set: {
          'organization_info.is_owner': true,
          'organization_info.is_enabled': true,
        },
      }
    );

    await db.collection('users').updateMany(
      {
        is_primary: false,
        del: false,
      },
      {
        $set: {
          'organization_info.is_owner': false,
          'organization_info.is_enabled': true,
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
