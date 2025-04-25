const express = require('express');

const {
  checkAppJwtAuth,
  checkSuspended,
  checkUserDisabled,
} = require('../middleware/auth');
const TextCtrl = require('../controllers/text');
const { catchError } = require('../controllers/error');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const { FRONT_WHITELIST, TWILIO_WHITELIST } = require('../constants/cors');

router.post('/receive', catchError(TextCtrl.receive));

router.post(
  '/receive-twilio',
  cors(generateCorsOptions(TWILIO_WHITELIST)),
  checkOrigin,
  catchError(TextCtrl.receiveTextTwilio)
);

router.post(
  '/update-twilio-message-status',
  cors(generateCorsOptions(TWILIO_WHITELIST)),
  checkOrigin,
  catchError(TextCtrl.updateTwilioMessageStatus)
);

router.get(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.getAll)
);

router.post(
  '/get-messages-count',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.getContactMessageOfCount)
);

router.post(
  '/get-messages',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.get)
);

router.post(
  '/load-files',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.loadFiles)
);
router.post(
  '/search-numbers',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.searchNumbers)
);
router.get(
  '/get-wavv-state',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.getWavvState)
);
router.put(
  '/update-subscription',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.updateSubscription)
);
router.post(
  '/buy-numbers',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkUserDisabled,
  catchError(TextCtrl.buyNumbers)
);

router.post(
  '/buy-credit',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  checkUserDisabled,
  catchError(TextCtrl.buyCredit)
);

router.get(
  '/buy-wavv-subscription',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  checkUserDisabled,
  catchError(TextCtrl.buyWavvSubscription)
);

router.put('/mark-read/:id', checkAppJwtAuth, catchError(TextCtrl.markAsRead));

router.get(
  '/create-sub-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.createSubAccount)
);

router.get(
  '/get-twilio-brand',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.getTwilioStatus)
);

router.get(
  '/move-number',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.moveNumber)
);

router.get(
  '/clear-twilio-brand',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.clearTwilioStatus)
);

router.post(
  '/create-starter-brand',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.createStarterBrand)
);

router.put(
  '/starter-brand',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.updateStarterBrand)
);

router.post(
  '/create-standard-brand',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.createStandardBrand)
);

router.post(
  '/create-brand-campaign',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.createBrandCampaign)
);

router.get(
  '/inspect-brand',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.inspectTwilioStatus)
);

router.post(
  '/send/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.send)
);

router.get(
  '/get-starter-brand-status',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.getStarterBrandStatus)
);

router.get(
  '/send-starter-brand-otp',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.sendStarterBrandOtp)
);

router.get(
  '/create-starter-brand-messaging',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.createStarterBrandMessagingService)
);

router.get(
  '/attach-number-to-service',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TextCtrl.attachPhoneNumberToBrandService)
);

module.exports = router;
