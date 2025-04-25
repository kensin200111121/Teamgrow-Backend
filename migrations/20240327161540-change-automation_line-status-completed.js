module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const auto_lines = await db
      .collection('automation_lines')
      .aggregate([
        { $match: { status: 'running' } },
        {
          $lookup: {
            from: 'time_lines',
            localField: '_id',
            foreignField: 'automation_line',
            as: 'timelines',
          },
        },
        {
          $match: { 'timelines.0': { $exists: false } },
        },
      ])
      .toArray()
      .catch((err) => {
        console.log('error message', err.message);
      });
    console.log('found', auto_lines.length);
    const automationline_ids = auto_lines.map((auto) => auto?._id);
    await db
      .collection('automation_lines')
      .updateMany(
        { _id: { $in: automationline_ids } },
        { $set: { status: 'completed' } }
      )
      .catch((e) => console.log('automation_line update error', e?.message));
    console.log('completed');
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
