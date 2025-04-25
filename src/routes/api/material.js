const express = require('express');

const { checkApiJwtAuth } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');

const router = express.Router();

router.get('/video', checkApiJwtAuth, catchError(DeveloperCtrl.getVideos));
router.get('/pdf', checkApiJwtAuth, catchError(DeveloperCtrl.getPdfs));
router.get('/image', checkApiJwtAuth, catchError(DeveloperCtrl.getImages));
router.post(
  '/send-video',
  checkApiJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(DeveloperCtrl.sendVideo)
);
router.post(
  '/send-pdf',
  checkApiJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(DeveloperCtrl.sendPdf)
);
router.post(
  '/send-image',
  checkApiJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(DeveloperCtrl.sendImage)
);

module.exports = router;
