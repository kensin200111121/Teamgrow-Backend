const mongoose = require('mongoose');
const {
  DB_PORT,
  DB_MATERIAL_PORT,
  DB_AUTOMATION_PORT,
} = require('../src/configs/database');

/**
 * Connect Monogo Database.
 */
mongoose.set('strictQuery', false);
mongoose
  .connect(DB_PORT, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connecting to database successful');
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const materialCon = mongoose.createConnection(
  DB_MATERIAL_PORT,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
  (err) => {
    if (err) {
      console.log('material db connect err', err);
    } else {
      console.log('material db connected');
    }
  }
);

const automationCon = mongoose.createConnection(
  DB_AUTOMATION_PORT,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
  (err) => {
    if (err) {
      console.log('automation db connect err', err);
    } else {
      console.log('automation db connected');
    }
  }
);

module.exports = { materialCon, automationCon };
