module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const garbages = await db.collection('garbages').find().toArray();
    for (let i = 0; i < garbages.length; i++) {
      console.log('updated this garbage lead form', garbages[i]._id);
      const garbage = garbages[i];
      if (
        garbage?.capture_field &&
        Object.keys(garbage.capture_field).length > 0
      ) {
        for (let j = 0; j < Object.keys(garbage.capture_field).length; j++) {
          const key = Object.keys(garbage.capture_field)[j];
          const leadForm = {
            ...garbage.capture_field[key],
            form_id: key,
            user: garbage.user[0],
          };
          if (key === 'default') {
            leadForm.isDefault = true;
          }
          db.collection('lead_forms').insertOne(leadForm);
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
