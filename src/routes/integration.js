const express = require('express');

const IntegrationCtrl = require('../controllers/integration');
const DeveloperCtrl = require('../controllers/developer');
const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get(
  '/jwt-token',
  checkAppJwtAuth,
  catchError(DeveloperCtrl.createApiJwtToken)
);
router.get(
  '/crypto-token',
  checkAppJwtAuth,
  catchError(DeveloperCtrl.createApiCryptoToken)
);
router.post(
  '/calendly/check-auth',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.checkAuthCalendly)
);
router.get(
  '/calendly',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.getCalendly)
);
router.post(
  '/calendly/set-event',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.setEventCalendly)
);
router.get(
  '/calendly/disconnect',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.disconnectCalendly)
);

router.post(
  '/verify-smtp',
  checkAppJwtAuth,
  checkSuspended,
  catchError(IntegrationCtrl.verifySMTP)
);

router.post(
  '/verify-smtp-code',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.verifySMTPCode)
);

router.post('/dialer', checkAppJwtAuth, catchError(IntegrationCtrl.addDialer));

router.get(
  '/dialer-token',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.getDialerToken)
);

router.post(
  '/zoom-create-meeting',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.createMeetingZoom)
);

router.put(
  '/zoom-update-meeting',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.updateMeetingZoom)
);

router.post(
  '/connect-smtp',
  checkAppJwtAuth,
  catchError(IntegrationCtrl.connectSMTP)
);

router.post('/chat-gpt', checkAppJwtAuth, catchError(IntegrationCtrl.chatGPT));

module.exports = router;
