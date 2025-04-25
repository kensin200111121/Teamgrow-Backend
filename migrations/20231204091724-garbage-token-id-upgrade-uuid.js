const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(db, client) {
    const garbages = await db.collection('garbages').find().toArray();
    for (let i = 0; i < garbages.length; i++) {
      const garbage = garbages[i];
      if (garbage?.template_tokens?.length) {
        const tokens = garbage.template_tokens.map(
          (token) => (token.id = uuidv4())
        );
        await db
          .collection('garbages')
          .updateOne(
            { _id: garbage._id },
            { $set: { template_tokens: tokens } }
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
