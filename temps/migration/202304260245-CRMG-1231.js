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
    migrateUserPaymentInvalidSubscription();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateUserPaymentInvalidSubscription = async () => {
  const users = await User.find({
    payment: { $exists: true, $ne: null },
  }).populate('payment');

  const invalid_user_ids = [];
  const invalid_payment_ids = [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    if (!user.payment) {
      invalid_user_ids.push(user._id.toString());
    } else {
      await stripe.subscriptions.retrieve(
        user.payment?.subscription,
        function (err, subscription) {
          if (err) {
            console.log(
              'invalid: ',
              user._id.toString(),
              user.email,
              user.payment?._id.toString(),
              user.payment?.subscription
            );
            invalid_user_ids.push(user._id.toString());
            invalid_payment_ids.push(user.payment?._id.toString());
          } else {
            console.log(
              'valid: ',
              user._id.toString(),
              user.email,
              user.payment?._id.toString(),
              user.payment?.subscription
            );
          }
        }
      );
    }
  }
  console.log(invalid_user_ids);
  console.log(invalid_payment_ids);

  await User.updateMany(
    { _id: { $in: invalid_user_ids } },
    { $set: { payment: null } }
  );

  await Payment.deleteMany({ _id: { $in: invalid_payment_ids } });
  console.log('migration successful!');
};
