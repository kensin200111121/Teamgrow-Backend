module.exports = {
  async up(db, client) {
    const users = await db
      .collection('users')
      .find({ del: false, is_primary: true })
      .toArray();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];

      const members = await db
        .collection('users')
        .find({
          del: false,
          is_primary: false,
          primary_account: user._id,
        })
        .toArray();

      if (members && members.length > 0) {
        console.log('Update Internal Team Information for user', user._id);

        await db
          .collection('teams')
          .deleteMany({ owner: user._id, is_internal: true })
          .then(() => {
            console.log('Internal Teams are deleted');
          })
          .catch(() => {
            console.log('Internal Teams delete error');
          });

        console.log('Create Internal team.');
        await db
          .collection('teams')
          .insertOne({
            name: user.user_name,
            owner: user._id,
            is_internal: true,
            members: members.map((e) => e._id),
          })
          .then(() => {
            console.log('Success to create Internal Team.');
          })
          .catch(() => {
            console.log('Failed to create Internal Team');
          });
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
