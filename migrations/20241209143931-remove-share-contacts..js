module.exports = {
  async up(db, client) {
    const users = await db.collection('users').find({ del: false }).toArray();

    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      console.log('old shared contacts migrating of user', index, user._id);

      await db
        .collection('contacts')
        .updateMany(
          {
            user: user._id,
            'shared_team.0': { $exists: false },
            'shared_members.0': { $exists: true },
          },
          {
            $set: {
              shared_members: [],
              shared_team: [],
              type: '',
              shared_all_member: false,
            },
          }
        )
        .then((result) => {
          console.log(
            `Updated ${result.modifiedCount} contacts for user ${user._id}`
          );
        })
        .catch((error) => {
          console.error(`Error updating contacts for user ${user._id}:`, error);
        });
    }
  },

  async down(db, client) {
    // Rollback logic: implement if necessary
  },
};
