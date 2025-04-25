module.exports = {
  async up(db, client) {
    const contacts = await db.collection('contacts').find({}).toArray();
    let updatedCount = 0;
    let totalChecked = 0;

    for (const contact of contacts) {
      if (!Array.isArray(contact.tags)) continue;

      const original = contact.tags;
      const normalized = [...new Set(original.map((tag) => tag.toLowerCase()))];
      const isChanged = JSON.stringify(original) !== JSON.stringify(normalized);

      console.log('Checking contact document:');
      console.log({
        _id: contact._id,
        user: contact.user,
        original_tags: original,
        normalized_tags: normalized,
        changed: isChanged ? 'YES' : 'NO',
      });
      console.log('---');

      if (isChanged) {
        await db
          .collection('contacts')
          .updateOne({ _id: contact._id }, { $set: { tags: normalized } });
        updatedCount++;
        console.log(`Updated contact _id=${contact._id}`);
        console.log();
      }

      totalChecked++;
    }

    console.log('Contact tags normalization migration complete.');
    console.log(`Total documents checked: ${totalChecked}`);
    console.log(`Total documents updated: ${updatedCount}`);
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
