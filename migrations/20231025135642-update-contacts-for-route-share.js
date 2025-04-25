module.exports = {
  async up(db, client) {
    // transfer user
    const t_contacts = await db
      .collection('contacts')
      .find({
        transfering_user: { $exists: true, $ne: null },
      })
      .toArray();
    for (let i = 0; i < t_contacts.length; i++) {
      await db.collection('contacts').updateOne(
        { _id: t_contacts[i]._id },
        {
          $set: {
            type: 'transfer',
            pending_users: [t_contacts[i].transfering_user],
          },
        }
      );
    }
    // clone user
    const c_contacts = await db
      .collection('contacts')
      .find({
        is_pending: true,
        original_id: { $exists: true, $ne: null },
        original_user: { $exists: true, $ne: null },
      })
      .toArray();
    for (let i = 0; i < c_contacts.length; i++) {
      await db.collection('contacts').updateOne(
        { _id: c_contacts[i]._id },
        {
          $set: {
            type: 'clone',
            pending_users: [c_contacts[i].user],
            user: null,
          },
        }
      );
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
