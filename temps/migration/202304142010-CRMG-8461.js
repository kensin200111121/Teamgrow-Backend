const mongoose = require('mongoose');
const Payment = require('../../models/payment');
const { ENV_PATH } = require('../../config/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../config/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migratePaymentStripProductKey();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migratePaymentStripProductKey = async () => {
  console.log('migrating Replace PRO strip key ..........');
  await Payment.updateMany(
    { plan_id: 'price_1IsjprHtGFAPJAKZydOaOjoL' },
    { $set: { plan_id: 'price_1MrkH6Dzvdh5jXRdEd61jjJK' } }
  ).catch((err) => {
    console.log('migration failed: ', err);
  });

  console.log('migrating Replace LITE strip key ..........');
  await Payment.updateMany(
    { plan_id: 'price_1It5GCHtGFAPJAKZMzucU98p' },
    { $set: { plan_id: 'price_1MrkGiDzvdh5jXRdIMFqLYyS' } }
  ).catch((err) => {
    console.log('migration failed: ', err);
  });

  console.log('migrating Replace ELITE strip key ..........');
  await Payment.updateMany(
    { plan_id: 'price_1IqDHWHtGFAPJAKZTOiSsZw9' },
    { $set: { plan_id: 'price_1MrkHQDzvdh5jXRdtPrFsriT' } }
  ).catch((err) => {
    console.log('migration failed: ', err);
  });

  console.log('migration successful!');
};
