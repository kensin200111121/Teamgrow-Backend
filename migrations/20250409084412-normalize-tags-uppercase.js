module.exports = {
  async up(db, client) {
    const tags = await db.collection('tags').find({}).toArray();
    let updatedCount = 0;

    for (const tagDoc of tags) {
      if (!Array.isArray(tagDoc.tags)) continue;

      const normalized = [
        ...new Set(tagDoc.tags.map((tag) => tag.toLowerCase())),
      ];

      const isChanged =
        JSON.stringify(tagDoc.tags) !== JSON.stringify(normalized);

      if (isChanged) {
        await db
          .collection('tags')
          .updateOne({ _id: tagDoc._id }, { $set: { tags: normalized } });
        updatedCount++;
        console.log(
          `Updated tag _id=${tagDoc._id} to ${JSON.stringify(normalized)}`
        );
      }
    }

    console.log(`Tag migration complete. ${updatedCount} documents updated.`);
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
