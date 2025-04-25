const api = require('../configs/api');
const system_settings = require('../configs/system_settings');
const Payment = require('../models/payment');
const Card = require('../models/card');

const stripeKey = api.STRIPE.STRIPE_SECRET_KEY;

const stripe = require('stripe')(stripeKey);

const createSubscription = async (data) => {
  return new Promise(async (resolve, reject) => {
    const {
      email,
      customer_id,
      plan_id,
      is_trial,
      trial_period_days,
      description,
      coupon,
      is_payment_new,
    } = data;

    const res = {};
    try {
      const sub_data = {
        customer: customer_id,
        items: [{ price: plan_id }],
        coupon,
        description,
      };
      if (is_trial) {
        sub_data['trial_period_days'] = trial_period_days;
      }
      const subscription = await stripe.subscriptions
        .create(sub_data)
        .catch((error) => {
          throw new Error(error);
        });
      if (is_payment_new) {
        const payment = new Payment({
          email,
          customer_id,
          plan_id,
          subscription: subscription.id,
          price_id: subscription.items['data'][0].id,
          coupon,
        });
        payment.save().catch((error) => {
          throw new Error(error);
        });
        res.payment = payment;
      }
      res.subscription = subscription;
      resolve(res);
    } catch (error) {
      reject(error);
    }
  });
};

const updateSubscription = async (data) => {
  const { payment_id, type, level, is_trial } = data;

  return new Promise(async (resolve, reject) => {
    try {
      const payment = await Payment.findOne({ _id: payment_id }).catch(
        (error) => {
          return reject(error.message);
        }
      );
      const subscriptionId = payment.subscription;

      const subscription = await stripe.subscriptions
        .retrieve(subscriptionId)
        .catch((error) => {
          throw new Error(error.message);
        });
      const updateData = {};
      switch (type) {
        case 'disable':
          updateData.cancel_at = subscription.current_period_end;
          break;
        case 'update':
          updateData.cancel_at_period_end = false;
          updateData.proration_behavior = 'always_invoice';
          updateData.items = [
            {
              id: payment['price_id'],
              price: api.STRIPE.PLAN[level],
            },
          ];
          break;
      }

      if (!subscription) reject('subscription invalid');
      stripe.subscriptions.update(
        subscriptionId,
        updateData,
        async (error, updatedSubscription) => {
          if (error) {
            console.log('update subscription error', error);
            reject(error.message);
          }
          if (type === 'update') {
            const subscriptionItem = updatedSubscription.items.data[0];
            const planId = subscriptionItem.plan.id; // Legacy Plan ID (if applicable)
            Payment.updateOne(
              {
                _id: payment_id,
              },
              {
                $set: { plan_id: planId, price_id: subscriptionItem.id },
              }
            ).catch((err) => {
              console.log('payment set package err', err.message);
            });
          }
          resolve(updatedSubscription);
        }
      );
    } catch (e) {
      reject(e.message);
    }
  });
};

const cancelSubscription = async (param) => {
  const { subscription, shouldDeletePayment = false } = param;
  return new Promise((resolve, reject) => {
    stripe.subscriptions.del(subscription, async (error) => {
      if (error != null) {
        return reject(error);
      }
      if (shouldDeletePayment)
        await Payment.deleteOne({ subscription }).catch((error) => {
          throw new Error(error.message);
        });
      resolve();
    });
  });
};

const pauseSubscription = async (subscription) => {
  return new Promise((resolve, reject) => {
    stripe.subscriptions.update(
      subscription,
      {
        pause_collection: {
          behavior: 'keep_as_draft',
        },
      },
      async (error) => {
        if (error != null) {
          return reject(error);
        }
        resolve();
      }
    );
  });
};

const resumeSubscription = async (subscription) => {
  return new Promise((resolve, reject) => {
    stripe.subscriptions.update(
      subscription,
      {
        pause_collection: '',
        cancel_at: null,
      },
      async (error) => {
        if (error != null) {
          return reject(error);
        }
        resolve();
      }
    );
  });
};

const addCard = async (param) => {
  const { payment, customer_id, token, is_primary = false } = param;
  return new Promise(async (resolve, reject) => {
    try {
      const _card = await stripe.customers
        .createSource(customer_id, { source: token.id })
        .catch((error) => {
          throw new Error('Can`t create card', error);
        });
      if (_card['cvc_check'] === 'unchecked') {
        throw new Error('CVC is unchecked');
      }
      const card = new Card({
        payment,
        card_name: token.card_name,
        card_id: _card.id,
        fingerprint: _card.fingerprint,
        card_brand: token.card.brand,
        exp_year: token.card.exp_year,
        exp_month: token.card.exp_month,
        last4: token.card.last4,
        is_primary,
      });
      card.save().catch((error) => {
        throw new Error('Card created failed.', error);
      });
      resolve(card);
    } catch (error) {
      reject(error);
    }
  });
};
const create = async (payment_data) => {
  return new Promise(async (resolve, reject) => {
    const { user_name, email, token, level, offer } = payment_data;
    let { is_trial } = payment_data;
    let trial_period_days = system_settings.SUBSCRIPTION_FREE_TRIAL;
    let coupon;
    if (offer === system_settings.OFFER.ONE_MONTH_TRIAL) {
      trial_period_days = 30;
      is_trial = true;
    } else if (offer === system_settings.OFFER.TWENTY_PERCENT_DISCOUNT) {
      coupon = api.STRIPE.DISCOUNT['TWENTY'];
    }
    try {
      const customer = await stripe.customers
        .create({
          name: user_name,
          email,
        })
        .catch((error) => {
          throw new Error(error);
        });

      if (!customer) throw new Error('Can`t create customer');
      const card = await addCard({
        customer_id: customer.id,
        token,
        is_primary: true,
      }).catch((error) => {
        throw Error(error.message);
      });

      await stripe.customers
        .update(customer.id, {
          default_source: card.card_id,
        })
        .catch((error) => {
          throw new Error(error.message);
        });
      const pricingPlan = api.STRIPE.PLAN[level];

      const sub_data = {
        customer: customer.id,
        items: [{ price: pricingPlan }],
        coupon,
        default_payment_method: card.card_id,
      };

      if (is_trial) sub_data.trial_period_days = trial_period_days;
      const subscription = await stripe.subscriptions
        .create(sub_data)
        .catch((error) => {
          throw new Error(error);
        });

      if (!subscription) throw new Error('can`t create subscription');
      // Save card information to DB.
      const payment = new Payment({
        email,
        customer_id: customer.id,
        plan_id: pricingPlan,
        token: token.id,
        subscription: subscription.id,
        price_id: subscription.items.data[0].id,
      });
      payment.save().catch((error) => {
        throw new Error(error.message);
      });

      card.payment = payment._id;
      await Card.updateOne(
        { _id: card._id },
        { $set: { payment: payment._id } }
      ).catch((error) => {
        throw new Error(error.message);
      });
      resolve({ payment, card });
    } catch (error) {
      reject(error.message);
    }
  });
};

const getPrimaryCard = async (param) => {
  const { payment_id } = param;
  return new Promise(async (resolve, reject) => {
    try {
      if (!payment_id) {
        throw new Error('Invalid payment');
      }
      const card = await Card.findOne({
        payment: payment_id,
        is_primary: true,
      });
      if (!card) {
        throw new Error('the primary Card does not exist.');
      }
      resolve(card);
    } catch (error) {
      reject(error.message);
    }
  });
};

const setPrimaryCard = async (param) => {
  const { card_id, payment_id } = param;
  return new Promise(async (resolve, reject) => {
    try {
      const payment = await Payment.findOne({ _id: payment_id });
      if (!payment) {
        throw new Error('Invalid payment.');
      }
      await stripe.customers
        .update(payment['customer_id'], {
          default_source: card_id,
        })
        .catch((error) => {
          throw new Error(error.message);
        });

      await stripe.subscriptions
        .update(payment['subscription'], {
          default_payment_method: card_id,
        })
        .catch((error) => {
          throw new Error(error.message);
        });
      await Card.updateOne(
        { payment: payment_id, is_primary: true },
        { $set: { is_primary: false } }
      ).catch((error) => {
        throw new Error(error.message);
      });
      await Card.updateOne({ card_id }, { $set: { is_primary: true } }).catch(
        (error) => {
          throw new Error(error.message);
        }
      );
      resolve(true);
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
};

const deleteCard = async (param) => {
  const { card_id, payment_id } = param;
  return new Promise(async (resolve, reject) => {
    try {
      const card = await Card.findOne({ card_id });
      if (!card) {
        throw new Error('this card does not exist');
      }
      if (card.is_primary) {
        throw new Error('this card can`t delete because it is primary.');
      }

      const payment = await Payment.findOne({ _id: payment_id });
      if (!payment) {
        throw new Error('Invalid payment.');
      }
      await stripe.customers
        .deleteSource(payment['customer_id'], card_id)
        .catch((error) => {
          throw new Error(error.message);
        });

      await Card.deleteOne({ card_id }).catch((error) => {
        throw new Error(error.message);
      });

      resolve(true);
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
};

const updateCard = async (param) => {
  const { payment_id, card_id, exp_year, exp_month } = param;
  return new Promise(async (resolve, reject) => {
    try {
      const payment = await Payment.findOne({ _id: payment_id });
      if (!payment) {
        throw new Error('Pament does not exist.');
      }
      await stripe.customers
        .updateSource(payment['customer_id'], card_id, { exp_year, exp_month })
        .catch((error) => {
          throw new Error(error.message);
        });
      await Card.updateOne(
        { card_id },
        {
          $set: { exp_year, exp_month },
        }
      ).catch((error) => {
        throw new Error(error.message);
      });
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
};

const createCharge = async (data) => {
  const { customer_id, amount, description } = data;
  return stripe.charges.create({
    amount,
    currency: 'usd',
    customer: customer_id,
    description,
  });
};

const deleteCustomer = async (id) => {
  return new Promise((resolve, reject) => {
    stripe.customers.del(id, (err, confirmation) => {
      if (err) reject(err);
      resolve(confirmation);
    });
  });
};

module.exports = {
  addCard,
  getPrimaryCard,
  setPrimaryCard,
  deleteCard,
  updateCard,
  create,
  createCharge,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  deleteCustomer,
};
