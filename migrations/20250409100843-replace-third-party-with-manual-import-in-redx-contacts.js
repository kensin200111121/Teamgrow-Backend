module.exports = {
  async up(db, client) {
    const contacts = await db
      .collection('contacts')
      .find({
        source: { $regex: '^redx$', $options: 'i' },
        tags: { $elemMatch: { $regex: '^third-party$', $options: 'i' } },
      })
      .toArray();

    let updatedCount = 0;
    let totalChecked = 0;

    for (const contact of contacts) {
      const originalTags = contact.tags;
      if (!Array.isArray(originalTags)) continue;

      const hasThirdParty = originalTags.some(
        (tag) => tag.toLowerCase() === 'third-party'
      );
      const hasManualImport = originalTags.some(
        (tag) => tag.toLowerCase() === 'manual import'
      );

      const newTags = originalTags.filter(
        (tag) => tag.toLowerCase() !== 'third-party'
      );

      if (hasThirdParty && !hasManualImport) {
        newTags.push('manual import');
      }

      console.log('RedX Contact:', {
        _id: contact._id,
        source: contact.source,
        originalTags,
        newTags,
        hasThirdParty,
      });

      if (hasThirdParty) {
        await db
          .collection('contacts')
          .updateOne({ _id: contact._id }, { $set: { tags: newTags } });
        updatedCount++;
      }

      totalChecked++;
    }

    console.log('Contact tag migration complete.');
    console.log(`Total documents checked: ${totalChecked}`);
    console.log(`Total documents updated: ${updatedCount}`);
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
