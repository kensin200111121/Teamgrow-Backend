const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const TimeLineCtrl = require('../controllers/time_line');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/create', checkAppJwtAuth, catchError(TimeLineCtrl.create));

router.post('/load', checkAppJwtAuth, catchError(TimeLineCtrl.load));
router.post(
  '/get-automation-timelines',
  checkAppJwtAuth,
  catchError(TimeLineCtrl.getAutomationTimelines)
);

module.exports = router;
