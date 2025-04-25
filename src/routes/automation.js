const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mime = require('mime-types');
const { v1: uuidv1 } = require('uuid');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const AutomationCtrl = require('../controllers/automation');
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

router.get('/', checkAppJwtAuth, catchError(AutomationCtrl.getAll));

router.post('/load-own', checkAppJwtAuth, catchError(AutomationCtrl.load));
router.post(
  '/req-folderid',
  checkAppJwtAuth,
  catchError(AutomationCtrl.getParentFolderId)
);
router.post('/search', checkAppJwtAuth, catchError(AutomationCtrl.search));

router.post(
  '/search-contact',
  checkAppJwtAuth,
  catchError(AutomationCtrl.searchContact)
);

router.post(
  '/search-deal',
  checkAppJwtAuth,
  catchError(AutomationCtrl.searchDeal)
);

router.post(
  '/get-titles',
  checkAppJwtAuth,
  catchError(AutomationCtrl.loadIncludings)
);

router.post(
  '/get-all-titles',
  checkAppJwtAuth,
  catchError(AutomationCtrl.loadAllIncludings)
);

router.post(
  '/load-library',
  checkAppJwtAuth,
  catchError(AutomationCtrl.loadLibrary)
);

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AutomationCtrl.create)
);
router.post(
  '/download',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AutomationCtrl.download)
);
router.post(
  '/bulk-download',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AutomationCtrl.bulkDownload)
);
router.put(
  '/:id',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AutomationCtrl.update)
);

router.post('/get-detail', checkAppJwtAuth, catchError(AutomationCtrl.get));

router.post('/remove/:id', checkAppJwtAuth, catchError(AutomationCtrl.remove));

router.get('/list/own', checkAppJwtAuth, catchError(AutomationCtrl.loadOwn));

router.get('/list/:page', checkAppJwtAuth, catchError(AutomationCtrl.getPage));

router.get(
  '/assigned-contacts/:id',
  checkAppJwtAuth,
  catchError(AutomationCtrl.getAssignedContacts)
);

router.post(
  '/contact-detail',
  checkAppJwtAuth,
  catchError(AutomationCtrl.getContactDetail)
);

// Default Video Edit
router.post('/remove', checkAppJwtAuth, catchError(AutomationCtrl.bulkRemove));
router.post(
  '/update-admin',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AutomationCtrl.updateDefault)
);

router.post('/move', checkAppJwtAuth, catchError(AutomationCtrl.moveFile));
router.post(
  '/remove-folder',
  checkAppJwtAuth,
  catchError(AutomationCtrl.removeFolder)
);
router.post(
  '/remove-folders',
  checkAppJwtAuth,
  catchError(AutomationCtrl.removeFolders)
);
router.post(
  '/download-folder',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AutomationCtrl.downloadFolder)
);
router.get(
  '/select-all/:id',
  checkAppJwtAuth,
  catchError(AutomationCtrl.selectAllContacts)
);
router.get(
  '/select-all-deals/:id',
  checkAppJwtAuth,
  catchError(AutomationCtrl.selectAllDeals)
);

router.get('/:id', checkAppJwtAuth, catchError(AutomationCtrl.getDetail));

router.post(
  '/upload-audio',
  checkAppJwtAuth,
  checkSuspended,
  s3Upload.single('audio'),
  catchError(AutomationCtrl.uploadAudio)
);

router.post(
  '/contacts-automation',
  checkAppJwtAuth,
  catchError(AutomationCtrl.getContactsAutomation)
);

router.get(
  '/parent-folder/:id',
  checkAppJwtAuth,
  catchError(AutomationCtrl.getParentFolderByAutomation)
);

router.post(
  '/get-active-counts',
  checkAppJwtAuth,
  catchError(AutomationCtrl.getActiveCounts)
);

// count of the contacts by automation status
router.post(
  '/count-by-automation',
  checkAppJwtAuth,
  catchError(AutomationCtrl.groupByAutomations)
);

module.exports = router;
