const express = require('express');
const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const InboundCtrl = require('../controllers/inbound');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(InboundCtrl.getInboundFields)
);

module.exports = router;
