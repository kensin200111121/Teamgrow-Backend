const { default: mongoose } = require('mongoose');

module.exports = {
  async up(db, client) {
    const users = await db
      .collection('users')
      .find({
        primary_account: mongoose.Types.ObjectId('635166787239e30015f5d098'),
        del: false,
      })
      .toArray();

    for (let i = 0; i < users.length; i++) {
      console.log('updated this user trial', users[i]._id);
      const user = users[i];
      const is_enabled = true;
      const is_editable = true;
      await db
        .collection('users')
        .updateOne(
          { _id: user._id },
          { $set: { assignee_info: { is_enabled, is_editable } } }
        );
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
