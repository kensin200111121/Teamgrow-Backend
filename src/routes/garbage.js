const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
var multerS3 = require('multer-s3');
const api = require('../configs/api');
const { checkAppJwtAuth } = require('../middleware/auth');
const GarbageCtrl = require('../controllers/garbage');
const { catchError } = require('../controllers/error');
const mime = require('mime-types');

const router = express.Router();

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

var upload = multer({
  storage: multerS3({
    s3,
    bucket: api.AWS.AWS_S3_BUCKET_NAME,
    acl: 'public-read',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      cb(
        null,
        `quickvideos/${Date.now().toString()}.${mime.extension(file.mimetype)}`
      );
    },
  }),
});

router.get(
  '/load-default',
  checkAppJwtAuth,
  catchError(GarbageCtrl.loadDefaults)
);
router.post('/', checkAppJwtAuth, catchError(GarbageCtrl.create));
router.get('/', checkAppJwtAuth, catchError(GarbageCtrl.get));
router.put('/', checkAppJwtAuth, catchError(GarbageCtrl.edit));
router.post(
  '/bulk-remove-token',
  checkAppJwtAuth,
  catchError(GarbageCtrl.bulkRemoveToken)
);
router.post(
  '/terminate-auto_setting',
  checkAppJwtAuth,
  catchError(GarbageCtrl.terminateAutoSetting)
);
router.post(
  '/intro_video',
  checkAppJwtAuth,
  upload.single('video'),
  catchError(GarbageCtrl.uploadIntroVideo)
);
router.get(
  '/smart-codes',
  checkAppJwtAuth,
  catchError(GarbageCtrl.loadSmartCodes)
);

router.get(
  '/team-settings',
  checkAppJwtAuth,
  catchError(GarbageCtrl.getTeamSettings)
);
router.post(
  '/team-settings',
  checkAppJwtAuth,
  catchError(GarbageCtrl.updateTeamSettings)
);

module.exports = router;
