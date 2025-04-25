const express = require('express');
const { checkApiJwtAuth, checkSuspended } = require('../../middleware/auth');
const InboundCtrl = require('../../controllers/inbound');
const { catchError } = require('../../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkApiJwtAuth,
  checkSuspended,
  catchError(InboundCtrl.getInboundFields)
);

module.exports = router;
