const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

const ImageCtrl = require('../controllers/image');
const {
  checkAppJwtAuth,
  checkSuspended,
  checkAuthExtension,
} = require('../middleware/auth');
const { catchError } = require('../controllers/error');
const api = require('../configs/api');

const cors = require('cors');
const { generateCorsOptions } = require('../middleware/cors');
const { EXTENSION_WHITELIST, FRONT_WHITELIST } = require('../constants/cors');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const router = express.Router();

const storage = multerS3({
  s3,
  bucket: api.AWS.AWS_S3_BUCKET_NAME,
  acl: 'public-read',
  metadata(req, file, cb) {
    cb(null, { fieldName: file.fieldname });
  },
  key(req, file, cb) {
    const today = new Date();
    const year = today.getYear();
    const month = today.getMonth();
    cb(null, 'image' + year + '/' + month + '/' + file.originalname);
  },
});

const upload = multer({
  storage,
});

// Upload a image
router.post(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.array('image'),
  catchError(ImageCtrl.create)
);

// Image Creating new one from existing one
router.post(
  '/create',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(ImageCtrl.createImage)
);

// Upload a preview and detail info
router.put(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  upload.array('image'),
  catchError(ImageCtrl.updateDetail)
);

// Upload a preview and detail info
router.get('/preview/:name', catchError(ImageCtrl.getPreview));

// Get all image
router.get(
  '/easy-load',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ImageCtrl.getEasyLoad)
);

router.get(
  '/download/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ImageCtrl.downloadImage)
);

router.get(
  '/analytics/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ImageCtrl.getAnalytics)
);

// Get all image
router.get(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ImageCtrl.getAll)
);

// Get a image
router.get(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(ImageCtrl.get)
);

// Sms Content
router.post(
  '/sms-content',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(ImageCtrl.createSmsContent)
);

// Delete a image
router.delete(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(ImageCtrl.remove)
);

module.exports = router;
