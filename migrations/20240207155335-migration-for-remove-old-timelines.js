module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const auto_lines = await db
      .collection('automation_lines')
      .find({ status: 'completed' })
      .toArray();
    if (!auto_lines?.length) return;
    const auto_line_ids = auto_lines.map((a) => a._id);
    await db
      .collection('time_lines')
      .deleteMany({ automation_line: { $elemMatch: { $in: auto_line_ids } } })
      .catch((e) => console.log('timeline delete error', e?.message));
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
