module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    try {
      const issue_docs = await db
        .collection('deal')
        .aggregate([
          {
            $and: [
              {
                $or: [
                  { primary_contact: { $exists: false } },
                  { primary_contact: null },
                  {
                    $expr: {
                      $not: {
                        $in: [
                          '$primary_contact',
                          {
                            $map: {
                              input: '$contacts',
                              as: 'contact',
                              in: { $toObjectId: '$$contact' }, // Convert each contact to ObjectId
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              { contacts: { $exists: true, $not: { $size: 0 } } }, // Ensure contacts array is not empty
            ],
          },
          {
            $count: 'count',
          },
        ])
        .toArray();
      console.log('issue_document-count: ', issue_docs[0]?.count);

      const result = await db.collection('deal').updateMany(
        {
          $and: [
            {
              $or: [
                { primary_contact: { $exists: false } },
                { primary_contact: null },
                {
                  $expr: {
                    $not: {
                      $in: [
                        '$primary_contact',
                        {
                          $map: {
                            input: '$contacts',
                            as: 'contact',
                            in: { $toObjectId: '$$contact' }, // Convert each contact to ObjectId
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
            { contacts: { $exists: true, $not: { $size: 0 } } }, // Ensure contacts array is not empty
          ],
        },
        [
          {
            $set: {
              primary_contact: { $arrayElemAt: ['$contacts', 0] },
            },
          },
        ]
      );
      console.log(`Matched ${result?.matchedCount} documents`);
      console.log(`Updated ${result?.modifiedCount} documents`);
    } catch (err) {
      console.log(' --- migration is failed ---', err);
    }
    console.log('=== migration-complete ===');
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
