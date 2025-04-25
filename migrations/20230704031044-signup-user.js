const { default: mongoose } = require('mongoose');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const users = await db
      .collection('users')
      .find({
        created_at: { $gte: new Date('2023-06-09') },
        payment: { $exists: false },
        del: false,
      })
      .toArray();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const payment = await db
        .collection('payments')
        .findOne({ email: user['email'] });

      console.log('user', i, user._id);

      if (payment) {
        console.log('update');

        await db
          .collection('users')
          .updateOne({ _id: user._id }, { $set: { payment: payment._id } })
          .then(() => {
            console.log(
              'SUCCESS',
              user._id,
              ',',
              user['email'],
              ',',
              user['created_at'],
              ',',
              payment._id
            );
          })
          .catch((error) => {
            console.log(
              'FAILED',
              user['id'],
              ',',
              user['email'],
              ',',
              user['created_at'],
              ',',
              payment?.id
            );
          });
      } else {
        console.log(
          'FAILED',
          user['id'],
          ',',
          user['email'],
          ',',
          user['created_at'],
          ',',
          'no payment'
        );
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
