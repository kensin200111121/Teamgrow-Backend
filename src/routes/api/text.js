const express = require('express');
const { catchError } = require('../../controllers/error');
const TextCtrl = require('../../controllers/text');
const { checkOrigin } = require('../../middleware/cors');

const router = express.Router();

router.post(
  '/receive-twilio',
  checkOrigin,
  catchError(TextCtrl.receiveTextTwilio)
);

router.post(
  '/update-twilio-message-status',
  checkOrigin,
  catchError(TextCtrl.updateTwilioMessageStatus)
);

module.exports = router;
