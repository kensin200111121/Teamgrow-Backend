module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const groupOpts = [
      {
        $match: { '_contacts.0': { $exists: false } },
      },
      {
        $project: {
          _id: 1,
        },
      },
      {
        $group: {
          _id: null,
          aIds: { $push: '$_id' },
        },
      },
    ];
    const DealIds = await db
      .collection('automation_lines')
      .aggregate([
        {
          $match: { deal: { $exists: true } },
        },
        {
          $lookup: {
            from: 'deals',
            localField: 'deal',
            foreignField: '_id',
            as: '_contacts',
          },
        },
        ...groupOpts,
      ])
      .toArray();
    const ContactIds = await db
      .collection('automation_lines')
      .aggregate([
        {
          $match: { contact: { $exists: true } },
        },
        {
          $lookup: {
            from: 'contacts',
            localField: 'contact',
            foreignField: '_id',
            as: '_contacts',
          },
        },
        ...groupOpts,
      ])
      .toArray();
    const dealIds = DealIds?.[0]?.aIds || [];
    const contactIds = ContactIds?.[0]?.aIds || [];
    const deleteIds = [...dealIds, ...contactIds];
    await db.collection('automation_lines').deleteMany({
      _id: { $in: deleteIds },
    });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
