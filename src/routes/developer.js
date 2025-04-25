const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const DeveloperCtrl = require('../controllers/developer');
const ContactCtrl = require('../controllers/contact');
const FollowUpCtrl = require('../controllers/follow_up');
const NoteCtrl = require('../controllers/note');
const TimeLineCtrl = require('../controllers/time_line');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/contact',
  checkAppJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  catchError(ContactCtrl.create)
);

router.get('/contact', checkAppJwtAuth, catchError(DeveloperCtrl.getContact));
router.get('/video', checkAppJwtAuth, catchError(DeveloperCtrl.getVideos));
router.get('/pdf', checkAppJwtAuth, catchError(DeveloperCtrl.getPdfs));
router.get('/image', checkAppJwtAuth, catchError(DeveloperCtrl.getImages));
router.get('/label', checkAppJwtAuth, catchError(DeveloperCtrl.getLabels));
router.get(
  '/automation',
  checkAppJwtAuth,
  catchError(DeveloperCtrl.getAutomations)
);
router.get(
  '/template',
  checkAppJwtAuth,
  catchError(DeveloperCtrl.getEmailTemplates)
);
router.get('/label', checkAppJwtAuth, catchError(DeveloperCtrl.getLabels));
router.get(
  '/lead-types',
  checkAppJwtAuth,
  catchError(DeveloperCtrl.getLeadSourceTypes)
);
router.get(
  '/lead-sources',
  checkAppJwtAuth,
  catchError(DeveloperCtrl.getLeadSources)
);

router.put(
  '/contact',
  checkAppJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(ContactCtrl.update)
);
router.post(
  '/automation',
  checkAppJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(TimeLineCtrl.create)
);
router.post(
  '/followup',
  checkAppJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(FollowUpCtrl.create)
);
router.post(
  '/note',
  checkAppJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(NoteCtrl.create)
);
router.post(
  '/tag',
  checkAppJwtAuth,
  DeveloperCtrl.preprocessRequest,
  catchError(DeveloperCtrl.addNewTag)
);
router.post(
  '/send-video',
  checkAppJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(DeveloperCtrl.sendVideo)
);
router.post(
  '/send-pdf',
  checkAppJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(DeveloperCtrl.sendPdf)
);
router.post(
  '/send-image',
  checkAppJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(DeveloperCtrl.sendImage)
);

module.exports = router;
