module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const eventTypeList = await db
      .collection('event_types')
      .find({
        link: { $exists: true, $regex: /^https:\/\// },
      })
      .toArray();
    const domainRegex = /(https?:\/\/)([^\/]+)(\/.*)/;
    if (eventTypeList && eventTypeList.length) {
      for (let i = 0; i < eventTypeList.length; i++) {
        const eventType = eventTypeList[i];
        if (eventType.link) {
          const match = eventType.link.match(domainRegex);
          if (match) {
            const refinedLink = match[3];
            await db
              .collection('event_types')
              .updateOne(
                { _id: eventType._id },
                { $set: { link: refinedLink } }
              );
          }
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
