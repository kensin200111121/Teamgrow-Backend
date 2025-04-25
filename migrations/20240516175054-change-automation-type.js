module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const contact_types = [
      'move_contact',
      'contact_condition',
      'share_contact',
      'deal',
    ];

    const deal_type = 'move_deal';
    await db
      .collection('automations')
      .updateMany({}, { $set: { type: 'any' } })
      .catch((err) =>
        console.log(
          'update the automation type error --- any-type: ',
          err.message
        )
      );

    await db
      .collection('automations')
      .updateMany(
        { 'automations.action.type': { $in: contact_types } },
        { $set: { type: 'contact' } }
      )
      .catch((err) =>
        console.log(
          'update the automation type error --- contact-type: ',
          err.message
        )
      );

    await db
      .collection('automations')
      .updateMany(
        { 'automations.action.type': deal_type },
        { $set: { type: 'deal' } }
      )
      .catch((err) =>
        console.log(
          'update the automation type error --- deal-type: ',
          err.message
        )
      );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
