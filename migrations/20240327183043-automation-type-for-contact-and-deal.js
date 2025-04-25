module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const automations = await db.collection('automations').find().toArray();
    console.log('Number of automations: ', automations.length);
    automations.forEach(async (automation) => {
      console.log('processing automation: ', automation._id);
      let auto_type = 'any';
      let has_automation = false;
      for (let i = 0; i < automation.automations.length; i++) {
        const type = automation.automations[i].action.type;
        if (type === 'automation') {
          has_automation = true;
          break;
        } else if (type === 'move_deal') {
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
      if (!has_automation && auto_type !== automation.type) {
        console.log('updated automation:', automation._id, auto_type);
        await db
          .collection('automations')
          .updateOne({ _id: automation._id }, { $set: { type: auto_type } });
      }
    });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
