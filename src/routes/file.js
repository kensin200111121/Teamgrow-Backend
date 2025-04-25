const express = require('express');
const { v1: uuidv1 } = require('uuid');
const mime = require('mime-types');
const fs = require('fs');
const multer = require('multer');
const FileCtrl = require('../controllers/file');
const { checkAppJwtAuth } = require('../middleware/auth');
const { catchError } = require('../controllers/error');
const { FILES_PATH } = require('../configs/path');

const router = express.Router();

const fileStorage = multer.diskStorage({
  destination: function fn(req, file, cb) {
    if (!fs.existsSync(FILES_PATH)) {
      fs.mkdirSync(FILES_PATH);
    }
    cb(null, FILES_PATH);
  },
  filename: (req, file, cb) => {
    cb(null, uuidv1() + '.' + mime.extension(file.mimetype));
  },
});

const upload = multer({ storage: fileStorage });

// Upload a file
router.post(
  '/',
  checkAppJwtAuth,
  upload.single('photo'),
  catchError(FileCtrl.create)
);

// Upload attached file
router.post('/upload', upload.single('file'), catchError(FileCtrl.upload));

router.get('/load-all', checkAppJwtAuth, catchError(FileCtrl.loadAll));

router.get('/aws_file', catchError(FileCtrl.getFileFromS3));

// Get a file
router.get('/:name', catchError(FileCtrl.get));

// Delete a file
router.delete('/:id', checkAppJwtAuth, catchError(FileCtrl.remove));

router.post(
  '/upload_base64',
  checkAppJwtAuth,
  catchError(FileCtrl.uploadBase64)
);

module.exports = router;
