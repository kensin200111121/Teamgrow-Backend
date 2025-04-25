const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const FolderCtrl = require('../controllers/folder');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/getAllParents',
  checkAppJwtAuth,
  catchError(FolderCtrl.getAllParents)
);

module.exports = router;
