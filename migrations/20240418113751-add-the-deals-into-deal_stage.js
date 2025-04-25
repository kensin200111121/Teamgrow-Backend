module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    const deals = await db
      .collection('deals')
      .find({ deal_stage: { $exists: true } })
      .toArray();

    if (!deals.length) return;
    for (let i = 0; i < deals.length; i++) {
      console.log('i deal', i);
      const dealStage = await db
        .collection('deal_stages')
        .findOne({ _id: deals[i].deal_stage, deals: deals[i]?._id });
      if (!dealStage) {
        console.log('i update', i);
        await db
          .collection('deal_stages')
          .updateOne(
            { _id: deals[i].deal_stage },
            { $push: { deals: deals[i]._id } }
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
