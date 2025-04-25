module.exports = {
  async up(db, client) {
    const cursor = await db
      .collection('automations')
      .find({
        $or: [
          { 'automations.action.condition_field': 'cell_phone' },
          { 'automations.action.condition_field': 'secondary_phone' },
        ],
      })
      .toArray();

    console.log('automations length', cursor.length);
    for (let i = 0; i < cursor.length; i++) {
      const doc = cursor[i];
      let updated = false;
      const filtered_automations = doc.automations.filter(
        (auto) =>
          auto?.action?.condition_field === 'cell_phone' ||
          auto?.action?.condition_field === 'secondary_phone'
      );
      let conditions = [];
      for (const auto of filtered_automations) {
        const contact_conditions = auto?.action?.contact_conditions;
        conditions = [...new Set([...conditions, ...contact_conditions])];
      }

      for (const automation of doc.automations) {
        const condition_case = automation?.condition?.case;
        const item_condition_field = automation?.action?.condition_field;
        if (condition_case && conditions.includes(condition_case)) {
          automation.condition.case = condition_case
            ? '+' + condition_case.replace(/\D/g, '')
            : '';
          updated = true;
        }
        if (
          item_condition_field === 'cell_phone' ||
          item_condition_field === 'secondary_phone'
        ) {
          const item_conditions = automation?.action?.contact_conditions;
          const new_conditions = item_conditions.map((item) =>
            item ? '+' + item.replace(/\D/g, '') : ''
          );
          automation.action.contact_conditions = new_conditions;
          updated = true;
        }
      }

      if (updated) {
        await db.collection('automations').replaceOne({ _id: doc._id }, doc);
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
