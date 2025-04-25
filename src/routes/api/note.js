const express = require('express');

const { checkApiJwtAuth, checkSuspended } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');
const NoteCtrl = require('../../controllers/note');

const router = express.Router();

router.post(
  '/',
  checkApiJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(NoteCtrl.create)
);

module.exports = router;
