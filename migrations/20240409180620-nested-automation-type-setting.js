module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

    // sub automations are any and other actions can be any (doesn't contact/deal only action)
    const checkDBStatus = async () => {
      const automationStatus = await db
        .collection('automations')
        .aggregate([
          {
            $match: {
              automations: { $elemMatch: { 'action.type': 'automation' } },
              is_migrated: { $ne: true },
            },
          },
          { $unwind: '$automations' },
          { $match: { 'automations.action.type': 'automation' } },
          {
            $addFields: {
              sub_automation_id: {
                $convert: {
                  input: '$automations.action.automation_id',
                  to: 'objectId',
                },
              },
            },
          },
          {
            $group: {
              _id: '$_id',
              automation_ids: { $push: '$sub_automation_id' },
            },
          },
          {
            $lookup: {
              from: 'automations',
              localField: 'automation_ids',
              foreignField: '_id',
              as: 'details',
            },
          },
          {
            $match: {
              details: { $not: { $elemMatch: { type: { $ne: 'any' } } } },
            },
          },
          { $project: { details: -1 } },
        ])
        .toArray();

      if (!automationStatus.length) {
        return;
      }

      console.log('automationstatus length', automationStatus.length);
      let updated = 0;
      for (let i = 0; i < automationStatus.length; i++) {
        const automationDetail = await db
          .collection('automations')
          .findOne({ _id: automationStatus[i]._id });

        let auto_type = 'any';
        for (let i = 0; i < automationDetail.automations.length; i++) {
          const type = automationDetail.automations[i].action.type;
          if (type === 'move_deal') {
            auto_type = 'deal';
          } else if (
            type === 'deal' ||
            type === 'move_contact' ||
            type === 'contact_condition' ||
            type === 'share_contact'
          ) {
            auto_type = 'contact';
          }
        }

        console.log(
          'auto type',
          i,
          automationDetail._id,
          automationDetail.type,
          auto_type
        );
        const updateQuery = {};
        if (automationDetail.type !== auto_type) {
          updateQuery['type'] = auto_type;
          updated++;
        }
        updateQuery['is_migrated'] = true;

        await db
          .collection('automations')
          .update({ _id: automationDetail._id }, { $set: updateQuery })
          .then(() => {
            console.log('saved');
          })
          .catch((err) => {
            console.log('saving is failed');
          });
      }

      console.log('updated', updated);
      await checkDBStatus();
    };

    await checkDBStatus();
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
