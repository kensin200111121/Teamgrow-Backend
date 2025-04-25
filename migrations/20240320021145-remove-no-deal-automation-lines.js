module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const deal_automation_lines = await db
      .collection('automation_lines')
      .find({ deal: { $exists: true } })
      .toArray();

    if (!deal_automation_lines.length) return;
    for (let i = 0; i < deal_automation_lines.length; i++) {
      const dealId = deal_automation_lines[i].deal;
      const autoLineId = deal_automation_lines[i]._id;
      const deal = await db.collection('deals').findOne({ _id: dealId });
      if (!deal) {
        await db.collection('automation_lines').deleteOne({ _id: autoLineId });
        await db
          .collection('time_lines')
          .deleteMany({ automation_line: autoLineId });
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
