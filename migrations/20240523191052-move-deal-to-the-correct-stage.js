const { default: mongoose } = require('mongoose');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

    const angela = mongoose.Types.ObjectId('623f4ed69544620016c33217');
    const jimmy = mongoose.Types.ObjectId('634ddac7af9e97001607af97');
    const angela_pipeline = mongoose.Types.ObjectId('624311529e8da70015243c05');
    const jimmy_pipeline = mongoose.Types.ObjectId('65e8df52dc0fa179c1ec9b50');

    const dealStages = await db
      .collection('deal_stages')
      .find({
        user: jimmy,
        pipe_line: jimmy_pipeline,
      })
      .toArray();

    for (const dealStage of dealStages) {
      const angela_deal_stage = await db
        .collection('deal_stages')
        .findOne({
          pipe_line: angela_pipeline,
          user: angela,
          priority: dealStage?.priority,
        })
        .catch((err) => console.log(err));
      console.log('angela_deal_stage: ', angela_deal_stage?._id);
      for (const deal of dealStage.deals) {
        const deal_doc = await db
          .collection('deals')
          .findOne({ _id: deal })
          .catch((err) => console.log(err));
        console.log('deal checking', deal_doc?._id);

        if (deal_doc?.user.toString() === angela.toString()) {
          console.log('updating this deal', deal_doc._id);
          await db
            .collection('deal_stages')
            .updateOne(
              {
                _id: angela_deal_stage?._id,
              },
              { $addToSet: { deals: { $each: [deal_doc?._id] } } }
            )
            .catch((err) =>
              console.log('angel_deal_stage update error: ', err)
            );
          await db
            .collection('deal')
            .updateOne(
              { _id: deal_doc?._id },
              { $set: { deal_stage: angela_deal_stage?._id } }
            )
            .catch((err) => console.log('angela_deal update error: ', err));
          await db
            .collection('deal_stages')
            .updateOne(
              { _id: dealStage?._id },
              { $pull: { deals: deal_doc?._id } }
            )
            .catch((err) =>
              console.log('jimmy_deal_stage update error: ', err)
            );
        }
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
