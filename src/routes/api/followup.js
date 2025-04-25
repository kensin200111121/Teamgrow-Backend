const express = require('express');

const { checkApiJwtAuth, checkSuspended } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');
const FollowUpCtrl = require('../../controllers/follow_up');

const router = express.Router();

router.post(
  '/',
  checkApiJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(FollowUpCtrl.create)
);

module.exports = router;
