module.exports = {
  async up(db, client) {
    const agent_filters = await db
      .collection('agent_filters')
      .find({ period: { $exists: false } })
      .toArray();
    agent_filters.forEach(async (element) => {
      const data = {};
      data['period'] = element?.time_frame === 6 ? 'lastsixmonths' : 'lastyear';
      switch (element?.listing_type) {
        case 0:
          data['min'] = element?.time_frame === 6 ? 12 : 24;
          break;
        case 1:
          data['min'] = element?.time_frame === 6 ? 6 : 13;
          data['max'] = element?.time_frame === 6 ? 12 : 24;
          break;
        case 2:
          data['max'] = element?.time_frame === 6 ? 5 : 12;
          break;
      }
      await db
        .collection('agent_filters')
        .updateOne(
          { _id: element._id },
          { $set: data },
          { $unset: { time_frame: true, listing_type: true } }
        );
    });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
