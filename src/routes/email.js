const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const EmailCtrl = require('../controllers/email');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/receive', catchError(EmailCtrl.receiveEmailSendGrid));
// router.get('/track1/:id', catchError(EmailCtrl.openTrack));

router.get('/opened/:id', catchError(EmailCtrl.receiveEmail));
router.get('/opened1/:id', catchError(EmailCtrl.receiveEmailExtension));
router.get('/unsubscribe/:id', catchError(EmailCtrl.unSubscribeEmail));
router.get('/resubscribe/:id', catchError(EmailCtrl.reSubscribeEmail));

router.post(
  '/share-platform',
  checkAppJwtAuth,
  catchError(EmailCtrl.sharePlatform)
);

router.post('/gmail-watch', catchError(EmailCtrl.watchGmail));
router.get(
  '/get-gmail-message/:id',
  checkAppJwtAuth,
  catchError(EmailCtrl.getGmailMessage)
);
router.post(
  '/get-gmail-attachment',
  checkAppJwtAuth,
  catchError(EmailCtrl.getGmailAttachment)
);
module.exports = router;
