const mongoose = require('mongoose');
const { ENV_PATH } = require('../../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../src/configs/database');

const Automation = require('../../src/models/automation');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    replacePhoneNumber();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const replacePhoneNumber = async () => {
  // find the downloaded automations
  const cursor = await Automation.find({
    $or: [
      { 'automations.action.condition_field': 'cell_phone' },
      { 'automations.action.condition_field': 'secondary_phone' },
    ],
  }).catch((err) => console.log(err));
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
    console.log('origin-conditions-01: ', conditions);

    for (const automation of doc.automations) {
      const condition_case = automation?.condition?.case;
      const item_condition_field = automation?.action?.condition_field;
      if (condition_case && conditions.includes(condition_case)) {
        automation.condition.case = condition_case
          ? '+' + condition_case.replace(/\D/g, '')
          : '';
        updated = true;
        console.log('=== 1 update ===', automation.condition.case);
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
        console.log('=== 2 update ===', automation.action.contact_conditions);
      }
    }

    if (updated) {
      console.log('=== new document ===', doc.automations);
      // await db.collection('automations').replaceOne({ _id: doc._id }, doc);
    }
  }
};
