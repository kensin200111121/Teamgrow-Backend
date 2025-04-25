const express = require('express');
const multer = require('multer');

const { checkAppJwtAuth } = require('../middleware/auth');
const PhoneLogCtrl = require('../controllers/phone_log');
const { catchError } = require('../controllers/error');

const upload = multer();

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const { FRONT_WHITELIST, WAVV_WHITELIST } = require('../constants/cors');

router.post(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.create)
);
router.get(
  '/customer',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.loadCustomer)
);
router.get(
  '/:contact',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.get)
);
router.post(
  '/event',
  cors(generateCorsOptions(WAVV_WHITELIST)),
  checkOrigin,
  catchError(PhoneLogCtrl.handleEvent)
);
router.post(
  '/recording',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.loadRecording)
);
router.post(
  '/deal',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.saveDealCall)
);
router.put(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.edit)
);

// Call Report Statistics Endpoints
router.post(
  '/statistics',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.loadStatistics)
);
router.post(
  '/logs',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.filterLogs)
);
router.post(
  '/update_logs',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PhoneLogCtrl.updateLogs)
);
module.exports = router;
