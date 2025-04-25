const express = require('express');
const fs = require('fs');
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mime = require('mime-types');
const { v1: uuidv1 } = require('uuid');
const VideoCtrl = require('../controllers/video');
const {
  checkAppJwtAuth,
  checkAuthExtension,
  checkSuspended,
} = require('../middleware/auth');
const { catchError } = require('../controllers/error');
const api = require('../configs/api');
const { TEMP_PATH } = require('../configs/path');
const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const {
  RECORDER_WHITELIST,
  EXTENSION_WHITELIST,
  FRONT_WHITELIST,
  MICRO_SERVICE_WHITELIST,
  LAMBDA_WHITELIST,
} = require('../constants/cors');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const router = express.Router();

const fileStorage = multer.diskStorage({
  destination: function fn(req, file, cb) {
    if (!fs.existsSync(TEMP_PATH)) {
      fs.mkdirSync(TEMP_PATH);
    }
    cb(null, TEMP_PATH);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: fileStorage });

const bucketStorage = multerS3({
  s3,
  bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
  key: (req, file, cb) => {
    const fileKey =
      'sources/' +
      new Date().getTime() +
      '-' +
      uuidv1() +
      '.' +
      mime.extension(file.mimetype);
    cb(null, fileKey);
  },
});
const s3Upload = multer({
  storage: bucketStorage,
});

const rawBucketStorage = multerS3({
  s3,
  bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
  key: (req, file, cb) => {
    const fileKey = 'raws/' + req.params.id + '/' + file.originalname;
    cb(null, fileKey);
  },
});
const s3RawUpload = multer({
  storage: rawBucketStorage,
});
const chunkBucketStorage = multerS3({
  s3,
  bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
  key: (req, file, cb) => {
    const fileKey = 'chunks/' + req.params.id + '/' + file.originalname;
    cb(null, fileKey);
  },
});
const chunkRawUpload = multer({
  storage: chunkBucketStorage,
});

const singleChunkStorage = multerS3({
  s3,
  bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
  key: (req, file, cb) => {
    const fileKey = 'sources/' + req.params.id;
    cb(null, fileKey);
  },
});
const singleUpload = multer({
  storage: singleChunkStorage,
});

// For create the social video, duplicate the video, or download the video
router.post(
  '/create',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(VideoCtrl.createVideo)
);

// Upload a video
router.post(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.single('video'),
  catchError(VideoCtrl.create)
);

// Upload a thumbnail and detail info when upload a video at first
router.put(
  '/detail/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.updateDetail)
);

router.put(
  '/converting/:id',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.updateConvertStatus)
);

// Upload a thumbnail and detail info
router.put(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(VideoCtrl.update)
);

// Upload a thumbnail and detail info
router.get('/thumbnail/:name', catchError(VideoCtrl.getThumbnail));

router.post(
  '/publish/:id',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAuthExtension,
  catchError(VideoCtrl.publish)
);

router.get(
  '/trash/:id',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.trash)
);

// Sms Content
router.post(
  '/sms-content',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.createSmsContent)
);

// Streaming video
router.get(
  '/pipe/:name',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(VideoCtrl.pipe)
);

// Get Conver progress of a video
router.post(
  '/convert-status',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.getConvertStatus)
);

// Get Convert progress of a video
router.post(
  '/convert-status1',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  catchError(VideoCtrl.getConvertStatus)
);

router.get(
  '/latest-sent/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.getContactsByLatestSent)
);

router.get(
  '/analytics/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.getAnalytics)
);

// Get easy load video
router.get(
  '/easy-load',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.getEasyLoad)
);

// Download video
router.get(
  '/download/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.downloadVideo)
);

// Play video
router.get(
  '/play/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(VideoCtrl.downloadVideo)
);

// Get all video
router.get(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.getAll)
);

router.get(
  '/download/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.downloadVideo)
);

router.get(
  '/:id',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  catchError(VideoCtrl.get)
);

// Delete a video
router.delete(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(VideoCtrl.remove)
);

// Remove videos
router.post(
  '/remove',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.bulkRemove)
);

router.post(
  '/upload',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  s3Upload.single('video'),
  catchError(VideoCtrl.uploadVideo)
);

/**
 * Inititalize the recording. Get the available time limit
 */
router.post(
  '/init-record',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAuthExtension,
  checkSuspended,
  catchError(VideoCtrl.initRecord)
);

/**
 * Upload the recorded video chunks to aws (for recording)
 */
router.post(
  '/upload-chunk/:id',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAuthExtension,
  s3RawUpload.array('file'),
  catchError(VideoCtrl.uploadChunk)
);

/**
 * Complete the recording: save or cancel
 */
router.post(
  '/complete-record',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAuthExtension,
  checkSuspended,
  catchError(VideoCtrl.completeRecord)
);

/**
 * Get video converting status
 */
router.post(
  '/get-convert-status',
  checkAuthExtension,
  catchError(VideoCtrl.getConvertStatus2)
);

/**
 * Uploading the video chunks for large file (for uploading)
 */
router.post(
  '/upload-split/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  chunkRawUpload.single('file'),
  catchError(VideoCtrl.uploadChunk)
);

router.post(
  '/upload-single/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  singleUpload.single('file'),
  catchError(VideoCtrl.uploadSingle)
);

router.post(
  '/merge-chunks',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.mergeFiles)
);

router.post(
  '/update-status',
  checkOrigin,
  cors(generateCorsOptions(LAMBDA_WHITELIST)),
  catchError(VideoCtrl.updateStatus)
);

router.post(
  '/embed-info',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(VideoCtrl.getEmbedInfo)
);

module.exports = router;
