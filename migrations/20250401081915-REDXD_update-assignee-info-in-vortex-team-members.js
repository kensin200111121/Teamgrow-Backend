module.exports = {
  async up(db, client) {
    const orgCursor = db.collection('organizations').find({
      vortex_team: { $exists: true, $ne: null },
    });

    let updatedUserCount = 0;
    let processedOrgCount = 0;

    while (await orgCursor.hasNext()) {
      const organization = await orgCursor.next();
      console.log(`Processing organization _id: ${organization._id}`);

      const members = organization.members || [];

      for (const member of members) {
        if (member.status === 'ACTIVE' && member.user) {
          const userId = member.user;
          const user = await db.collection('users').findOne({ _id: userId });

          if (user) {
            console.log(`Updating users._id: ${userId}`);
            await db.collection('users').updateOne(
              { _id: userId },
              {
                $set: {
                  'assignee_info.is_enabled': true,
                  'assignee_info.is_editable': true,
                },
              }
            );
            updatedUserCount++;
          } else {
            console.log(`User not found for users._id: ${userId}`);
          }
        }
      }

      processedOrgCount++;
    }

    console.log(
      `Migration complete. organizations processed: ${processedOrgCount}, users updated: ${updatedUserCount}`
    );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
