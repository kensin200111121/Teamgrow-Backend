const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const Automation = require('../src/models/automation');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    triggerTest();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const triggerTest = async () => {
  console.log(DB_PORT);
  const query = {
    'trigger.type': 'contact_tags_added',
    'trigger.detail.tags': { $in: ['30DayWarmAttraction1', 'ABC'] },
  };

  const automations = await Automation.find(query).catch((err) =>
    console.log(err.message)
  );
  console.log(automations);
};
