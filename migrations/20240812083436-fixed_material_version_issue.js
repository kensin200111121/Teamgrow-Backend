module.exports = {
  async up(db, client) {
    await db
      .collection('videos')
      .updateMany({ version: { $exists: false } }, { $set: { version: 0 } })
      .then(() => console.log('=== video updated ==='))
      .catch((err) => console.log('video update failed: ', err));

    await db
      .collection('images')
      .updateMany({ version: { $exists: false } }, { $set: { version: 0 } })
      .then(() => console.log('=== image updated ==='))
      .catch((err) => console.log('image update failed: ', err));

    await db
      .collection('pdfs')
      .updateMany({ version: { $exists: false } }, { $set: { version: 0 } })
      .then(() => console.log('=== pdf updated ==='))
      .catch((err) => console.log('pdf update failed: ', err));

    await db
      .collection('automations')
      .updateMany({ version: { $exists: false } }, { $set: { version: 0 } })
      .then(() => console.log('=== automation updated ==='))
      .catch((err) => console.log('automation update failed: ', err));

    await db
      .collection('email_templates')
      .updateMany({ version: { $exists: false } }, { $set: { version: 0 } })
      .then(() => console.log('=== email template updated ==='))
      .catch((err) => console.log('email template update failed: ', err));

    await db
      .collection('pipe_lines')
      .updateMany({ version: { $exists: false } }, { $set: { version: 0 } })
      .then(() => console.log('=== pipeline updated ==='))
      .catch((err) => console.log('pipeline update failed: ', err));
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
