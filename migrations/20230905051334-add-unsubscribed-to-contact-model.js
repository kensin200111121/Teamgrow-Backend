module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    await db.collection('contacts').updateMany(
      {
        tags: { $in: ['text_unsubscribed'] },
      },
      {
        $set: {
          'unsubscribed.text': true,
        },
      }
    );

    await db.collection('contacts').updateMany(
      {
        tags: { $in: ['email_unsubscribed'] },
      },
      {
        $set: {
          'unsubscribed.email': true,
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
