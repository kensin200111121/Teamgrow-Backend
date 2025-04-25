const mongoose = require('mongoose');
const User = require('../../models/user');
const Payment = require('../../models/payment');
const { ENV_PATH } = require('../../config/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../config/database');

const strip_key = 'key';
const stripe = require('stripe')(strip_key);

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrateAddPriceIdInPayment();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateAddPriceIdInPayment = async () => {
  const payments = await Payment.find();

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    if (!payment.subscription) continue;
    await stripe.subscriptions.retrieve(
      payment.subscription,
      async (err, subscription) => {
        if (!err) {
          payment['price_id'] = subscription.items['data'][0].id;
          await payment
            .save()
            .catch((err) => {
              console.log('ERROR:', payment._id, '  ', err);
            })
            .then(() => {
              console.log('SUCCESS:', payment._id);
            });
        } else {
          console.log('ERROR:', payment._id);
        }
      }
    );
  }
  console.log('migration successful!');
};
