const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

const PDFCtrl = require('../controllers/pdf');
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
    const prefix = file.fieldname || 'pdf';
    cb(
      null,
      prefix +
        '/' +
        year +
        '/' +
        month +
        '/' +
        Date.now() +
        '-' +
        file.originalname
    );
  },
});

const upload = multer({
  storage,
});

// Upload a pdf
router.post(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.single('pdf'),
  catchError(PDFCtrl.create)
);

// PDF Creating new one from existing one
router.post(
  '/create',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(PDFCtrl.createPDF)
);
// Upload a preview and detail info
router.put(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'preview', maxCount: 1 },
    { name: 'site_image', maxCount: 1 },
  ]),
  catchError(PDFCtrl.updateDetail)
);

// Get easy load pdf
router.get(
  '/easy-load',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PDFCtrl.getEasyLoad)
);

router.get(
  '/download/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PDFCtrl.downloadPDF)
);

router.get(
  '/analytics/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PDFCtrl.getAnalytics)
);

// Get all pdf
router.get(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PDFCtrl.getAll)
);

// Get a pdf
router.get('/:id', catchError(PDFCtrl.get));

// Sms Content Generate
router.post(
  '/sms-content',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PDFCtrl.createSmsContent)
);

// Delete a pdf
router.delete(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(PDFCtrl.remove)
);

module.exports = router;
