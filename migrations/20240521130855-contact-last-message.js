const { default: mongoose } = require('mongoose');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    // const users = await db
    //   .collection('users')
    //   .find({
    //     del: { $ne: true },
    //   })
    //   .toArray();
    // for (let i = 0; i < users.length; i++) {
    //   const user = users[i];
    //   console.log('user migrating', i, user._id);
    //   const lastMessages = await db
    //     .collection('texts')
    //     .aggregate([
    //       { $match: { user: user._id } },
    //       { $unwind: '$contacts' },
    //       { $group: { _id: '$contacts', lastId: { $last: '$_id' } } },
    //     ])
    //     .toArray();

    //   console.log('lastMessages', lastMessages.length);
    //   lastMessages.forEach(async (e) => {
    //     const contactId = e._id;
    //     const lastId = e.lastId;

    //     await db
    //       .collection('contacts')
    //       .updateOne({ _id: contactId }, { $set: { 'message.last': lastId } });
    //   });

    //   const lastRecievedMessages = await db
    //     .collection('texts')
    //     .aggregate([
    //       { $match: { type: 1, user: user._id } },
    //       { $unwind: '$contacts' },
    //       { $group: { _id: '$contacts', lastId: { $last: '$_id' } } },
    //     ])
    //     .toArray();

    //   console.log('lastRecievedMessages', lastRecievedMessages.length);
    //   lastRecievedMessages.forEach(async (e) => {
    //     const contactId = e._id;
    //     const lastId = e.lastId;

    //     await db
    //       .collection('contacts')
    //       .updateOne(
    //         { _id: contactId },
    //         { $set: { 'message.last_received': lastId } }
    //       );
    //   });
    // }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
