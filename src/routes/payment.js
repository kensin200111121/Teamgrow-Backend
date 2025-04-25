const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const PaymentCtrl = require('../controllers/payment');
const { catchError } = require('../controllers/error');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const { FRONT_WHITELIST, STRIPE_WHITELIST } = require('../constants/cors');

router.post(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.update)
);

router.post(
  '/add-card',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.addCard)
);
router.post(
  '/set-primary-card',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.setPrimaryCard)
);
router.post(
  '/delete-card',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.deleteCard)
);

router.post(
  '/update-card',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.updateCard)
);
router.post(
  '/transactions',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.getTransactions)
);
router.post(
  '/failed',
  cors(generateCorsOptions(STRIPE_WHITELIST)),
  checkOrigin,
  catchError(PaymentCtrl.paymentFailedHook)
);
router.post(
  '/succeed',
  cors(generateCorsOptions(STRIPE_WHITELIST)),
  checkOrigin,
  catchError(PaymentCtrl.paymentSucceedHook)
);
router.post(
  '/ended',
  cors(generateCorsOptions(STRIPE_WHITELIST)),
  checkOrigin,
  catchError(PaymentCtrl.subscriptionEndHook)
);
router.post(
  '/paused',
  cors(generateCorsOptions(STRIPE_WHITELIST)),
  checkOrigin,
  catchError(PaymentCtrl.paymentPausedHook)
);
router.post(
  '/resumed',
  cors(generateCorsOptions(STRIPE_WHITELIST)),
  checkOrigin,
  catchError(PaymentCtrl.paymentResumedHook)
);

router.post(
  '/subscription-created',
  cors(generateCorsOptions(STRIPE_WHITELIST)),
  checkOrigin,
  catchError(PaymentCtrl.subscriptionCreatedHook)
);
router.post(
  '/proceed-invoice',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.proceedInvoice)
);
router.get(
  '/get-primary-card',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.getPrimaryCard)
);
router.get(
  '/cards',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.getCards)
);
router.get(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PaymentCtrl.get)
);

module.exports = router;
