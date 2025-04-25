const express = require('express');

const { checkApiJwtAuth, checkSuspended } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');
const TimeLineCtrl = require('../../controllers/time_line');

const router = express.Router();

router.post(
  '/',
  checkApiJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(TimeLineCtrl.create)
);
router.get('/', checkApiJwtAuth, catchError(DeveloperCtrl.getAutomations));

module.exports = router;
