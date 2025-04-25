const express = require('express');
const { checkApiJwtAuth, checkSuspended } = require('../middleware/auth');
const OutboundCtrl = require('../controllers/outbound');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/subscribe',
  checkApiJwtAuth,
  checkSuspended,
  catchError(OutboundCtrl.outboundSubscribe)
);

router.delete(
  '/unsubscribe/:id',
  checkApiJwtAuth,
  checkSuspended,
  catchError(OutboundCtrl.outboundUnsubscribe)
);

router.get(
  '/perform/:action',
  checkApiJwtAuth,
  checkSuspended,
  catchError(OutboundCtrl.outboundPerform)
);
module.exports = router;
