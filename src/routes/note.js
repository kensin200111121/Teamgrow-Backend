const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mime = require('mime-types');
const { v1: uuidv1 } = require('uuid');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const NoteCtrl = require('../controllers/note');
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

router.post('/', checkAppJwtAuth, checkSuspended, catchError(NoteCtrl.create));
router.get('/', checkAppJwtAuth, catchError(NoteCtrl.get));
router.post(
  '/v2/create',
  checkAppJwtAuth,
  checkSuspended,
  s3Upload.single('audio'),
  catchError(NoteCtrl.create)
);
router.post(
  '/v2/bulk-create',
  checkAppJwtAuth,
  checkSuspended,
  s3Upload.single('audio'),
  catchError(NoteCtrl.bulkCreate)
);
router.post(
  '/create',
  checkAppJwtAuth,
  checkSuspended,
  catchError(NoteCtrl.bulkCreate)
);
router.put(
  '/v2/:id',
  checkAppJwtAuth,
  s3Upload.single('audio'),
  catchError(NoteCtrl.update)
);
router.put('/:id', checkAppJwtAuth, catchError(NoteCtrl.update));
router.post('/:id', checkAppJwtAuth, catchError(NoteCtrl.remove));

module.exports = router;
