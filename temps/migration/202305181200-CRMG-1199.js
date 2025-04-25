const mongoose = require('mongoose');
const Card = require('../../models/card');
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
    migrateSeperateCardFromPayment();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateSeperateCardFromPayment = async () => {
  const payments = await Payment.find({ card_id: { $exists: true } });

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    const card = await stripe.customers
      .retrieveSource(payment['customer_id'], payment['card_id'])
      .catch((error) => {
        console.log('invalid card : ', payment['_id'], error.message);
      });
    if (!card) {
      continue;
    }

    const new_card = new Card({
      payment: payment._id,
      card_id: card.id,
      card_name: card.name,
      card_brand: card.brand,
      fingerprint: card.fingerprint,
      exp_year: card.exp_year,
      exp_month: card.exp_month,
      is_primary: true,
      last4: card.last4,
    });
    new_card
      .save()
      .then((c) => {
        console.log('success save card : ', payment['_id']);
      })
      .catch((error) => {
        console.log('failed save card : ', payment['_id'], error.message);
      });
  }
  console.log('migration successful!');
};
