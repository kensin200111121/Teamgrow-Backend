const { DEFAULT_BUCKETS } = require('../src/constants/bucket');

module.exports = {
  async up(db, client) {
    const users = await db
      .collection('users')
      .find({ del: { $ne: true } })
      .toArray();
    const buckets = [];
    for (let i = 0; i < users.length; i++) {
      for (let j = 0; j < DEFAULT_BUCKETS.length; j++) {
        buckets.push({
          ...DEFAULT_BUCKETS[j],
          user: users[i]._id,
        });
      }
    }

    await db
      .collection('sphere_buckets')
      .insertMany(buckets)
      .catch((err) => {
        console.log(err);
      });
    console.log('buckets inited');
  },

  async down(db, client) {
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
