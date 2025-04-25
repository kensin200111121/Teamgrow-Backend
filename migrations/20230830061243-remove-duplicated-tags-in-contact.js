module.exports = {
  async up(db, client) {
    const contacts = await db.collection('contacts').aggregate(
      [
        { $match: { 'tags.1': { $exists: true } } },
        { $unwind: '$tags' },
        {
          $group: {
            _id: { contact: '$_id', tag: '$tags' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gte: 2 } } },
      ],
      { allowDiskUse: true }
    );
    contacts.forEach(async (e) => {
      const contact_id = e._id.contact;
      const contact = await db
        .collection('contacts')
        .findOne({ _id: contact_id });
      const tags = contact.tags;
      const uniqueTags = [...new Set(tags)];
      console.log(uniqueTags);
      await db
        .collection('contacts')
        .updateOne({ _id: contact_id }, { $set: { tags: uniqueTags } });
    });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
