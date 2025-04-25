module.exports = {
  async up(db, client) {
    const customFields = await db
      .collection('custom_fields')
      .find({})
      .toArray();
    let totalChecked = 0;
    let totalHasNoName = 0;
    let totalNeedsUpdate = 0;

    for (const doc of customFields) {
      totalChecked++;

      if (!doc.name) {
        console.log('Skipping custom field document with no name');
        totalHasNoName++;
        continue;
      }

      const normalized = doc.name.toLowerCase();
      const isChanged = doc.name !== normalized;
      console.log('Checking custom field document:');
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
        .collection('custom_fields')
        .updateOne({ _id: doc._id }, { $set: { name: normalized } });
      console.log(`Updated custom field _id=${doc._id} to ${normalized}`);
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
