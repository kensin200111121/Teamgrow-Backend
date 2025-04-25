const mongoose = require('mongoose');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const Deal = require('../src/models/deal');

const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migratePrimaryContactrDeal();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migratePrimaryContactrDeal = async () => {
  const issue_docs = await Deal.aggregate([
    {
      $match: {
        $or: [
          { primary_contact: { $exists: false } },
          { primary_contact: null },
          {
            $expr: { $not: { $in: ['$primary_contact', '$contacts'] } },
          },
        ],
      },
    },
    {
      $count: 'count',
    },
  ]);
  console.log('issue_document: ', issue_docs);

  const result = await Deal.updateMany(
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

  console.log('update-result: ', result);

  const new_issue_count = await Deal.aggregate([
    {
      $match: {
        $or: [
          { primary_contact: { $exists: false } },
          { primary_contact: null },
          {
            $expr: { $not: { $in: ['$primary_contact', '$contacts'] } },
          },
        ],
      },
    },
    {
      $count: 'count',
    },
  ]);
  console.log('updated_count: ', new_issue_count[0]?.count);
};
