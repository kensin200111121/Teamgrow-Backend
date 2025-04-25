module.exports = {
  async up(db, client) {
    const users = await db.collection('users').find({ del: false }).toArray();
    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      const garbage = await db
        .collection('garbages')
        .findOne({ user: user._id })
        .catch((err) => console.log('garbage error ', err));
      if (garbage == null) continue;
      const { additional_fields } = garbage;
      if (additional_fields && additional_fields.length) {
        for (let j = 0; j < additional_fields.length; j++) {
          const field = additional_fields[j];
          const { id, ...rest } = field;
          await db
            .collection('custom_fields')
            .insertOne({
              ...rest,
              user: user._id,
              order: parseInt(id),
              kind: 'contact',
            })
            .then((_d) => {
              console.log('created custom-field', _d);
            })
            .catch((_e) => {
              console.log('error in creating custom-field', _e);
            });
        }
      }
    }
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
