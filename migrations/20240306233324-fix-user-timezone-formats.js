module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

    const timezones = await db
      .collection('users')
      .aggregate([
        { $match: { time_zone_info: { $regex: ".*{.*" } } },
        { $group: { _id: '$time_zone_info', users: { $push: '$_id' } } },
      ])
      .toArray();
    console.log('timezones.length', timezones.length);
    timezones.forEach(async (timezone) => {
      const old_timezone = timezone._id;
      const users = timezone.users;
      if (old_timezone && users.length) {
        let newTimezone;
        try {
          newTimezone = JSON.parse(old_timezone).tz_name;
        } catch (err) {
          newTimezone = 'America/New_York';
        }
        await db
          .collection('users')
          .updateMany(
            { _id: { $in: users || [] } },
            { $set: { time_zone_info: newTimezone } }
          );
      }
    });
    await db
      .collection('users')
      .updateMany(
        { time_zone_info: null },
        { $set: { time_zone_info: 'America/New_York' } }
      );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
