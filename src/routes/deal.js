const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mime = require('mime-types');
const { v1: uuidv1 } = require('uuid');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const DealCtrl = require('../controllers/deal');
const { catchError } = require('../controllers/error');
const api = require('../configs/api');

const router = express.Router();

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const audioStorage = multerS3({
  s3,
  bucket: api.AWS.AWS_S3_BUCKET_NAME,
  key: (req, file, cb) => {
    const fileKey =
      'audios/' +
      new Date().getTime() +
      '-' +
      uuidv1() +
      '.' +
      mime.extension(file.mimetype);
    cb(null, fileKey);
  },
  acl: 'public-read',
});
const s3Upload = multer({
  storage: audioStorage,
});

router.post('/', checkAppJwtAuth, checkSuspended, catchError(DealCtrl.create));
router.get('/', checkAppJwtAuth, catchError(DealCtrl.getAll));

router.post('/get-activity', checkAppJwtAuth, catchError(DealCtrl.getActivity));

router.post('/get-deals', checkAppJwtAuth, catchError(DealCtrl.getDeals));
router.post(
  '/contacts-by-stage',
  checkAppJwtAuth,
  catchError(DealCtrl.getContactsByStage)
);

router.post('/add-note', checkAppJwtAuth, catchError(DealCtrl.createNote));
router.post('/edit-note', checkAppJwtAuth, catchError(DealCtrl.editNote));

router.post(
  '/v2/add-note',
  checkAppJwtAuth,
  checkSuspended,
  s3Upload.single('audio'),
  catchError(DealCtrl.createNote)
);
router.post(
  '/v2/edit-note',
  checkAppJwtAuth,
  checkSuspended,
  s3Upload.single('audio'),
  catchError(DealCtrl.editNote)
);

router.post('/get-note', checkAppJwtAuth, catchError(DealCtrl.getNotes));
router.post('/remove-note', checkAppJwtAuth, catchError(DealCtrl.removeNote));

router.post(
  '/add-follow',
  checkAppJwtAuth,
  catchError(DealCtrl.createFollowUp)
);

router.post(
  '/update-follow',
  checkAppJwtAuth,
  catchError(DealCtrl.updateFollowUp)
);
router.post(
  '/complete-follow',
  checkAppJwtAuth,
  catchError(DealCtrl.completeFollowUp)
);
router.post(
  '/remove-follow',
  checkAppJwtAuth,
  catchError(DealCtrl.removeFollowUp)
);

router.post(
  '/move-deal',
  checkAppJwtAuth,
  checkSuspended,
  catchError(DealCtrl.moveDeal)
);

router.post('/send-email', checkAppJwtAuth, catchError(DealCtrl.sendEmails));
router.post('/get-email', checkAppJwtAuth, catchError(DealCtrl.getEmails));
router.post('/send-text', checkAppJwtAuth, catchError(DealCtrl.sendTexts));

router.post(
  '/create-appointment',
  checkAppJwtAuth,
  catchError(DealCtrl.createAppointment)
);
router.post(
  '/get-appointments',
  checkAppJwtAuth,
  catchError(DealCtrl.getAppointments)
);
router.post(
  '/update-appointment',
  checkAppJwtAuth,
  catchError(DealCtrl.updateAppointment)
);
router.post(
  '/remove-appointment',
  checkAppJwtAuth,
  catchError(DealCtrl.removeAppointment)
);

router.post(
  '/create-team-call',
  checkAppJwtAuth,
  catchError(DealCtrl.createTeamCall)
);
router.post(
  '/get-team-calls',
  checkAppJwtAuth,
  catchError(DealCtrl.getTeamCalls)
);

router.post(
  '/update-contact/:id',
  checkAppJwtAuth,
  catchError(DealCtrl.updateContact)
);

router.get(
  '/material-activity/:id',
  checkAppJwtAuth,
  catchError(DealCtrl.getMaterialActivity)
);

router.get(
  '/get-timelines/:id',
  checkAppJwtAuth,
  catchError(DealCtrl.getTimeLines)
);

router.get(
  '/get-all-timelines',
  checkAppJwtAuth,
  catchError(DealCtrl.getAllTimeLines)
);

router.post('/bulk-create', checkAppJwtAuth, catchError(DealCtrl.bulkCreate));

router.post(
  '/bulk-create-csv',
  checkAppJwtAuth,
  catchError(DealCtrl.bulkCreateCSV)
);

router.post(
  '/set-primary-contact',
  checkAppJwtAuth,
  catchError(DealCtrl.setPrimaryContact)
);

router.delete('/:id', checkAppJwtAuth, catchError(DealCtrl.remove));
router.post('/bulk-remove', checkAppJwtAuth, catchError(DealCtrl.bulkRemove));
router.delete(
  '/only/:id',
  checkAppJwtAuth,
  catchError(DealCtrl.removeOnlyDeal)
);
router.put('/:id', checkAppJwtAuth, catchError(DealCtrl.edit));
router.get('/siblings/:id', checkAppJwtAuth, catchError(DealCtrl.getSiblings));

router.get('/count', checkAppJwtAuth, catchError(DealCtrl.getCount));

router.get('/get-tasks/:id', checkAppJwtAuth, catchError(DealCtrl.getTasks));

router.get('/:id', checkAppJwtAuth, catchError(DealCtrl.getDetail));

module.exports = router;
