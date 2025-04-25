const api = require('../configs/api');
const system_settings = require('../configs/system_settings');
const Payment = require('../models/payment');
const Card = require('../models/card');
const User = require('../models/user');
const Notification = require('../models/notification');
const { sendNotificationEmail } = require('../helpers/notification');
const { sendErrorToSentry, getUserTimezone } = require('../helpers/utility');
const {
  suspendData,
  activeUser: activeUserHelper,
  checkRecaptchaToken,
} = require('../helpers/user');
const {
  addCard: addCardHelper,
  getPrimaryCard: getPrimaryCardHelper,
  setPrimaryCard: setPrimaryCardHelper,
  deleteCard: deleteCardHelper,
  updateCard: updateCardHelper,
  create: createHelper,
  cancelSubscription,
} = require('../helpers/payment');

const moment = require('moment-timezone');
const Sentry = require('@sentry/node');

const stripeKey = api.STRIPE.STRIPE_SECRET_KEY;
const stripe = require('stripe')(stripeKey);

const sleep = (waitTimeInMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, waitTimeInMs);
  });

const get = async (req, res) => {
  const { currentUser } = req;
  try {
    if (!currentUser.payment) {
      throw new Error('Payment doesn`t exist.');
    }

    const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (error) => {
        throw new Error('payment doesn`t exist', error);
      }
    );
    const subscription = await stripe.subscriptions
      .retrieve(payment['subscription'])
      .catch((error) => {
        throw new Error('subscription doesn`t exist', error);
      });

    const data = {
      payment,
      subscription: {
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        amount: subscription.items.data[0].plan.amount,
        currency: subscription.currency,
        interval: subscription.items.data[0].plan.interval,
      },
    };
    return res.status(200).json({
      status: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const getCards = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.payment) {
    return res.status(200).json({
      status: true,
      cards: [],
    });
  }

  const cards = await Card.find({ payment: currentUser.payment });
  return res.status(200).json({
    status: true,
    cards: cards || [],
  });
};

const addCard = async (req, res) => {
  const { currentUser } = req;
  const { token, captchaToken } = req.body;
  if (!captchaToken) {
    return res.status(400).json({
      status: false,
      error: 'Invalid Request!',
    });
  }

  try {
    if (!(await checkRecaptchaToken(captchaToken))) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Request!',
      });
    }
    let is_valid_payment = true;
    if (!currentUser.payment) is_valid_payment = false;
    const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      () => {
        is_valid_payment = false;
      }
    );
    if (!is_valid_payment || !payment) {
      sendErrorToSentry(currentUser, new Error('invalid payment'));
      // this user has no payment. so create the payment.
      const { payment: new_payment, card: new_card } = await createHelper({
        user_name: currentUser.user_name,
        email: currentUser.email,
        token,
        level: currentUser.package_level,
        is_trial: true,
      }).catch((error) => {
        throw new Error(error);
      });
      User.updateOne(
        { _id: currentUser._id },
        { $set: { payment: new_payment._id } }
      ).catch((error) => {
        throw new Error(error.message);
      });
      return res
        .status(200)
        .send({ status: true, payment: new_payment._id, card: new_card });
    }

    if (!currentUser.is_primary) {
      // this is the case that sub account has no card.
      const has_card = await Card.findOne({ payment: currentUser.payment });
      if (!has_card) {
        const { payment: new_payment, card: new_card } = await createHelper({
          user_name: currentUser.user_name,
          email: currentUser.email,
          token,
          level: currentUser.package_level,
        }).catch((error) => {
          throw new Error(error);
        });
        await User.updateOne(
          { _id: currentUser._id },
          { $set: { payment: new_payment._id } }
        ).catch((error) => {
          throw new Error(error.message);
        });

        // old subscription and payment delete.
        await cancelSubscription({
          subscription: payment.subscription,
          shouldDeletePayment: true,
        }).catch((error) => {
          throw new Error(error.message);
        });
        return res
          .status(200)
          .send({ status: true, payment: new_payment._id, card: new_card });
      }
    }
    await stripe.tokens.retrieve(token.id).catch((error) => {
      throw new Error('Card is invalid', error);
    });
    await stripe.customers.retrieve(payment['customer_id']).catch((error) => {
      throw new Error('Customer is invalid', error);
    });

    const card = await addCardHelper({
      payment: payment._id,
      customer_id: payment['customer_id'],
      token,
      is_primary: false,
    }).catch((error) => {
      throw new Error(error);
    });
    return res.status(200).send({ status: true, payment: payment._id, card });
  } catch (error) {
    return res.status(400).send({ status: false, error: error.message });
  }
};

const setPrimaryCard = async (req, res) => {
  const { currentUser } = req;
  const { card_id } = req.body;
  await setPrimaryCardHelper({ card_id, payment_id: currentUser.payment })
    .then(() => {
      return res.status(200).send({ status: true });
    })
    .catch(() => {
      return res
        .status(400)
        .send({ status: false, error: 'set primary card failed.' });
    });
};

const getPrimaryCard = async (req, res) => {
  const { currentUser } = req;
  await getPrimaryCardHelper({
    payment_id: currentUser.payment,
  })
    .then((card) => {
      return res.status(200).send({ card, status: true });
    })
    .catch(() => {
      return res
        .status(400)
        .send({ status: false, error: 'get primary card failed.' });
    });
};

const deleteCard = async (req, res) => {
  const { currentUser } = req;
  const { card_id } = req.body;
  deleteCardHelper({ card_id, payment_id: currentUser.payment })
    .then(() => {
      return res.status(200).send({ status: true });
    })
    .catch(() => {
      return res
        .status(400)
        .send({ status: false, error: 'delete the card failed.' });
    });
};

const updateCard = async (req, res) => {
  const { currentUser } = req;
  const { card_id, exp_year, exp_month } = req.body;
  try {
    const result = await updateCardHelper({
      payment_id: currentUser.payment,
      card_id,
      exp_year,
      exp_month,
    }).catch((error) => {
      throw new Error(error);
    });
    if (!result) {
      throw new Error('update card failed.');
    }
    return res.status(200).send({
      status: true,
    });
  } catch (error) {
    return res.status(400).send({
      status: false,
      error: error.message,
    });
  }
};

// const update = async (req, res) => {
//   const { token, offer } = req.body;
//   const { currentUser } = req;
//   let level;
//   if (currentUser.user_version === 1 && currentUser.package_level === 'PRO') {
//     level = 'LITE';
//   } else {
//     level = currentUser.package_level || system_settings.DEFAULT_PACKAGE;
//   }

//   if (currentUser.is_minimal) {
//     level = system_settings.MINIMAL_PACKAGE;
//   }

//   try {
//     if (!currentUser.payment) throw new Error('No exist payment');
//     const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
//       (err) => {
//         throw new Error(err);
//       }
//     );
//     if (!payment) throw new Error('Not found payment');
//     // await cancelSubscription(payment['subscription'], true);
//     const customer = await stripe.customers
//       .retrieve(payment['customer_id'])
//       .catch((err) => {
//         throw new Error('customer retrieve error', err);
//       });

//     if (customer['deleted']) throw new Error('customer is already deleted.');

//     const _token = await stripe.tokens.retrieve(token.id).catch((err) => {
//       throw new Error('Card is not valid', err);
//     });

//     if (payment['fingerprint'] !== _token.card.fingerprint) {
//       // Replace new card
//       const card = await stripe.customers
//         .createSource(payment['customer_id'], { source: token.id })
//         .catch((err) => {
//           throw new Error('Card is not valid', err);
//         });
//       if (!card) throw new Error('Card is not valid');

//       await stripe.customers
//         .update(payment['customer_id'], {
//           default_source: card.id,
//         })
//         .catch((err) => {
//           throw new Error('update customer failed.', err);
//         });

//       // Save card information to DB.
//       await Payment.updateOne(
//         { _id: payment.id },
//         {
//           $set: {
//             card_id: card.id,
//             card_name: token.card_name,
//             card_brand: token.card.brand,
//             exp_month: token.card.exp_month,
//             exp_year: token.card.exp_year,
//             last4: token.card.last4,
//             fingerprint: card.fingerprint,
//           },
//         }
//       ).catch((err) => {
//         console.log('err', err);
//         throw new Error('err', err);
//       });
//       console.log(' remove old card');
//       // remove old card
//       await stripe.customers
//         .deleteSource(payment['customer_id'], payment['card_id'])
//         .catch((err) => {
//           if (err) throw new Error('delete source err', err);
//         });
//       if (!payment['subscription'] || !customer.subscriptions) {
//         throw new Error('subscription invalid');
//       }

//       await upgradeSubscription(payment, level, card)
//         .then((payment) => {
//           return res.send({
//             status: true,
//             data: payment,
//           });
//         })
//         .catch((err) => {
//           throw new Error('err', err);
//         });
//     } else {
//       // this  is the case of new card nd old one are same
//       const customer_id = payment['customer_id'];
//       const card_id = payment['card_id'];
//       await stripe.customers
//         .retrieveSource(customer_id, card_id)
//         .catch((err) => {
//           throw new Error('Invalid customer', err);
//         });

//       // Update card
//       const card = {
//         name: token.card.name,
//         exp_month: token.card.exp_month,
//         exp_year: token.card.exp_year,
//       };

//       delete card.id;

//       updateCard(payment._id, customer_id, card_id, card, token).catch(
//         (err) => {
//           throw new Error(err);
//         }
//       );

//       if (!payment['subscription']) {
//         throw new Error('subscription invalid');
//       }

//       // He is trying with same card but want update card or procceed payment
//       await upgradeSubscription(payment, level, card)
//         .then((payment) => {
//           return res.send({
//             status: true,
//             data: payment,
//           });
//         })
//         .catch((err) => {
//           throw new Error('err', err);
//         });
//     }
//   } catch (err) {
//     return res.status(400).send({
//       status: false,
//       err,
//     });
//   }
// };

const updateCustomerEmail = async (customer_id, email) => {
  // Create new customer
  return new Promise((resolve, reject) => {
    stripe.customers.update(
      customer_id,
      { metadata: { email } },
      async (error) => {
        if (error) {
          console.log('err', error);
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
};

const paymentFailedHook = async (req, res) => {
  const invoice = req.body.data;
  const customer_id = invoice['object']['customer'];
  const subscription = invoice['object']['subscription'];
  const attempt_count = invoice['object']['attempt_count'];
  const charge = invoice['object']['charge'];

  await sleep(1000); // wait about one second because this hookapi is called before payment model is created.

  if (!subscription) {
    console.log('subscription is invalid');
    return res.status(200).json({
      status: true,
    });
  }
  const payment = await Payment.findOne({
    customer_id,
    subscription,
  }).catch((error) => {
    console.log('payment find err', error.message);
  });

  if (payment) {
    const user = await User.findOne({
      payment: payment._id,
      del: false,
    }).catch((error) => {
      console.log('user find err', error.message);
    });

    if (user) {
      User.updateOne(
        { _id: user._id },
        {
          $set: {
            subscription: {
              is_failed: true,
              updated_at: new Date(),
              attempt_count,
              amount: invoice['object']['amount_due'],
            },
          },
        }
      ).catch((error) => {
        console.log('user updated failed', error.message);
      });

      const charge_detail = await stripe.charges.retrieve(charge);
      if (!charge_detail) {
        console.log(`can't find the card.`);
      }

      await Notification.replaceOne(
        {
          type: 'personal',
          criteria: 'subscription_failed',
          user: user.id,
        },
        {
          type: 'personal',
          criteria: 'subscription_failed',
          user: user.id,
          is_banner: true,
          banner_style: 'danger',
          del: false,
          content:
            `<span>Pay your overdue account balance by updating ` +
            charge_detail.payment_method_details.card.brand +
            ` **** ` +
            charge_detail.payment_method_details.card.last4 +
            `, which was declined, or contact your bank to resolve the issue.</span><a href='javascript: paynow()'>Pay now</a>`,
        },
        { upsert: true }
      ).catch((error) => {
        console.log('Notification replace failed', error);
      });

      return res.status(200).json({
        status: true,
      });
    } else {
      return res.status(400).json({
        status: false,
        error: 'no_user',
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'no_payment',
    });
  }
};

const paymentSucceedHook = async (req, res) => {
  const invoice = req.body.data;
  const customer_id = invoice['object']['customer'];
  const subscription = invoice['object']['subscription'];

  await sleep(1000); // wait about one second because this hookapi is called before payment model is created.

  if (!subscription) {
    console.log('subscription is invalid');
    return res.status(200).json({
      status: true,
    });
  }

  const payment = await Payment.findOne({ customer_id, subscription }).catch(
    (error) => {
      console.log('error', error);
    }
  );

  // if (payment && payment.type === 'crmgrow') {

  if (payment) {
    const user = await User.findOne({ payment: payment._id, del: false }).catch(
      (error) => {
        console.log('error', error);
      }
    );

    if (user) {
      const subscription = {
        is_trial: false,
        'subscription.attempt_count': 0,
        'subscription.updated_at': new Date(),
        'subscription.amount': invoice['object']['amount_paid'],
      };

      activeUserHelper(user._id, subscription);

      return res.send({
        status: true,
      });
    } else {
      console.log('Payment not found for user: ', customer_id);
      return res.status(400).json({
        status: false,
        error: `Couldn't find user`,
      });
    }
  } else {
    Sentry.captureException(new Error('payment not found.'), {
      extra: {
        subscription,
        customer_id,
      },
    });

    return res.status(400).json({
      status: false,
      error: 'No user',
    });
  }
};

const subscriptionEndHook = async (req, res) => {
  const response = req.body.data;
  const customer_id = response['object']['customer'];
  const subscription = response['object']['id'];

  const payment = await Payment.findOne({
    customer_id,
    subscription,
  }).catch((error) => {
    console.log('payment find error', error.message);

    sendErrorToSentry(
      { _id: customer_id },
      new Error(subscription + 'invalid payment')
    );
  });

  if (!payment || !payment._id)
    return res.status(400).json({
      status: false,
    });

  const user = await User.findOne({
    payment: payment._id,
    del: false,
  }).catch((error) => {
    console.log('user find err', error.message);
  });

  if (!user)
    return res.status(400).json({
      status: false,
    });

  suspendData(user.id);
  const request_sendemail = !user.user_disabled;
  User.updateOne(
    { _id: user.id },
    {
      $set: {
        user_disabled: true,
        'subscription.is_failed': true,
        'subscription.is_suspended': true,
        data_released: false,
        data_cleaned: false,
        disabled_at: new Date(),
      },
    }
  ).catch((error) => {
    console.log('user error', error.message);
  });

  if (request_sendemail) {
    const time_zone = getUserTimezone(user);
    const data = {
      template_data: {
        user_name: user.user_name,
        created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
        amount: user.subscription.amount / 100 || 29,
        last_4_cc: payment.last4 || 'Unknown',
      },
      template_name: 'SuspendNotification',
      required_reply: true,
      email: user.email,
      source: user.source,
    };

    sendNotificationEmail(data);
  }

  Notification.replaceOne(
    {
      type: 'personal',
      criteria: 'subscription_ended',
      user: user.id,
    },
    {
      type: 'personal',
      criteria: 'subscription_ended',
      user: user.id,
      is_banner: true,
      banner_style: 'warning',
      del: false,
      content: `<span>You don't have any active subscriptions now because you closed your account or your account is suspended due to failed payment.</span><a href='javascript: renew()'>Renew subscription</a>`,
    },
    { upsert: true }
  ).catch((error) => {
    console.log('Notification replace failed', error);
  });

  return res.send({
    status: true,
  });
};

const getTransactions = async (req, res) => {
  const { currentUser } = req;
  const { starting_after, ending_before, limit } = req.body;
  let payment;

  if (currentUser.payment) {
    payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (error) => {
        console.log('err', error.message);
      }
    );
  } else {
    return res.send({
      status: true,
      data: [],
    });
  }

  if (payment) {
    const customer_id = payment.customer_id;
    const subscription_id = payment.subscription;
    let invoices = [];
    if (currentUser.is_primary) {
      invoices = await stripe.invoices.list({
        customer: customer_id,
        limit: limit || 20,
        starting_after,
        ending_before,
      });
    } else {
      invoices = await stripe.invoices.list({
        customer: customer_id,
        subscription: subscription_id,
        limit: limit || 20,
        starting_after,
        ending_before,
      });
    }
    if (invoices) {
      const invoice_list = invoices.data;
      const data = [];
      for (let i = 0; i < invoice_list.length; i++) {
        const charge = {
          id: invoice_list[i].id,
          amount: invoice_list[i].amount_due / 100,
          status: invoice_list[i].status,
          description: invoice_list[i].description,
          customer: invoice_list[i].customer,
          date: invoice_list[i].created * 1000,
          invoice_pdf: invoice_list[i].invoice_pdf,
        };
        data.push(charge);
      }
      return res.send({
        status: true,
        data,
      });
    } else {
      return res.send({
        status: true,
        data: [],
      });
    }
  } else {
    return res.send({
      status: true,
      data: [],
    });
  }
};

const proceedInvoice = async (req, res) => {
  const { currentUser } = req;
  try {
    const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (error) => {
        throw new Error(error.type);
      }
    );
    const subscription = await stripe.subscriptions
      .retrieve(payment['subscription'])
      .catch((error) => {
        throw new Error(error);
      });
    await stripe.invoices.pay(subscription.latest_invoice).catch((error) => {
      throw new Error(error.type);
    });
    return res.status(200).json({
      status: true,
      data: currentUser.payment,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const subscriptionCreatedHook = async (req, res) => {
  const response = req.body.data;
  const customer_id = response['object']['customer'];
  const subscription = response['object']['id'];
  const price_id = response['object']['plan']['id'];

  await sleep(1000); // wait about one second because this hookapi is called before payment model is created.

  const payment = await Payment.findOne({ customer_id, subscription }).catch(
    (error) => {
      console.log('error', error);
    }
  );

  if (payment) {
    const user = await User.findOne({ payment: payment._id, del: false }).catch(
      (error) => {
        console.log('error', error);
      }
    );
    if (user) {
      if (price_id === api.STRIPE.PLAN.SLEEP) {
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              'subscription.is_suspended': true,
              'subscription.is_failed': false,
              user_disabled: false,
            },
          }
        ).catch((error) => {
          console.log('user error', error.message);
        });
      } else {
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              'subscription.is_suspended': false,
              'subscription.is_failed': false,
              user_disabled: false,
            },
            $unset: {
              disabled_at: true,
            },
          }
        ).catch((error) => {
          console.log('user error', error.message);
        });
      }

      Notification.deleteOne({
        type: 'personal',
        criteria: 'subscription_ended',
        user: user.id,
      }).catch((error) => {
        console.log('notification delete error', error.message);
      });

      return res.send({
        status: true,
      });
    } else {
      return res.status(400).json({
        status: false,
        error: 'no_user',
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'no_payment',
    });
  }
};

module.exports = {
  get,
  getCards,
  addCard,
  getPrimaryCard,
  setPrimaryCard,
  deleteCard,
  updateCard,
  // update,
  getTransactions,
  paymentFailedHook,
  paymentSucceedHook,
  subscriptionEndHook,
  updateCustomerEmail,
  proceedInvoice,
  subscriptionCreatedHook,
};
