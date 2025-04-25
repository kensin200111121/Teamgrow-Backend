const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const AssetsCtrl = require('../controllers/assets');
const { checkAppJwtAuth } = require('../middleware/auth');
const api = require('../configs/api');
const multer = require('multer');
var multerS3 = require('multer-s3');
const { v1: uuidv1 } = require('uuid');

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
        'assets/' +
          uuidv1() +
          '-' +
          Date.now().toString() +
          '.' +
          mime.extension(file.mimetype)
      );
    },
  }),
});

router.get('/load/:page', checkAppJwtAuth, AssetsCtrl.load);
router.post('/update', checkAppJwtAuth, AssetsCtrl.update);
router.post('/create', checkAppJwtAuth, AssetsCtrl.create);
router.post('/replace', checkAppJwtAuth, AssetsCtrl.replace);
router.post('/delete', checkAppJwtAuth, AssetsCtrl.remove);
router.post(
  '/upload',
  checkAppJwtAuth,
  upload.array('assets'),
  AssetsCtrl.bulkCreate
);

module.exports = router;
