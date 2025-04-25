module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const automation_lines = await db
      .collection('automation_lines')
      .find({ status: 'stopped' })
      .toArray();
    const time_lines = [];
    await automation_lines.forEach(async (element) => {
      const temp_timelines = await db
        .collection('time_lines')
        .find({ automation_line: element._id })
        .toArray();
      if (temp_timelines.length > 0) {
        time_lines.push(temp_timelines.map((ele) => ele._id));
      }
    });
    await db.collection('time_lines').deleteMany({ _id: { $in: time_lines } });

    const now = new Date();
    const _automation_lines = await db
      .collection('automation_lines')
      .find({ status: 'running' })
      .toArray();

    await _automation_lines.forEach(async (element) => {
      const temp_timeline = await db
        .collection('time_lines')
        .findOne({ automation_line: element._id });
      if (!temp_timeline) {
        await db
          .collection('automation_lines')
          .updateOne({ _id: element?._id }, { $set: { status: 'stopped' } });
      }
    });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
