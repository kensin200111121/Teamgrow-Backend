const express = require('express');
const { catchError } = require('../../controllers/error');
const PaymentCtrl = require('../../controllers/payment');
const { checkOrigin } = require('../../middleware/cors');

const router = express.Router();

router.post(
  '/subscription-created',
  checkOrigin,
  catchError(PaymentCtrl.subscriptionCreatedHook)
);

router.post('/failed', checkOrigin, catchError(PaymentCtrl.paymentFailedHook));

router.post(
  '/succeed',
  checkOrigin,
  catchError(PaymentCtrl.paymentSucceedHook)
);

router.post('/ended', checkOrigin, catchError(PaymentCtrl.subscriptionEndHook));

module.exports = router;
