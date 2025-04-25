module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const timezones = await db
      .collection('users')
      .aggregate([
        { $group: { _id: '$time_zone_info', users: { $push: '$_id' } } },
      ]);
    timezones.forEach(async (timezone) => {
      const old_timezone = timezone._id;
      const users = timezone.users;
      if (old_timezone && users.length) {
        let newTimezone;
        try {
          newTimezone = JSON.parse(old_timezone).tz_name;
        } catch (err) {
          newTimezone = old_timezone;
        }
        await db
          .collection('users')
          .updateMany(
            { _id: { $in: users || [] } },
            { $set: { time_zone_info: newTimezone } }
          );
      }
    });
    await db.collection('users').update({}, { $unset: { time_zone: '' } });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
