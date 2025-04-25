module.exports = {
  async up(db, client) {
    const labels = await db.collection('labels').find({}).toArray();
    let totalChecked = 0;
    let totalHasNoName = 0;
    let totalNeedsUpdate = 0;

    for (const doc of labels) {
      totalChecked++;

      if (!doc.name) {
        console.log('Skipping label document with no name');
        totalHasNoName++;
        continue;
      }

      const normalized = doc.name.toLowerCase();
      const isChanged = doc.name !== normalized;
      console.log('Checking label document:');
      console.log({
        _id: doc._id,
        name: doc.name,
        normalized_name: normalized,
        changed: isChanged ? 'YES' : 'NO',
      });
      console.log('---');

      if (!isChanged) continue;

      totalNeedsUpdate++;

      await db
        .collection('labels')
        .updateOne({ _id: doc._id }, { $set: { name: normalized } });
      console.log(`Updated label _id=${doc._id} to ${normalized}`);
    }

    console.log(`Migration complete.`);
    console.log(`Documents checked: ${totalChecked}`);
    console.log(`Documents needing update: ${totalNeedsUpdate}`);
    console.log(`Documents has no name: ${totalHasNoName}`);
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
