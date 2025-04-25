const express = require('express');

const { checkAuthExtension, checkSuspended } = require('../middleware/auth');
const ExtensionCtrl = require('../controllers/extension');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAuthExtension,
  checkSuspended,
  catchError(ExtensionCtrl.sendActivity)
);
router.post(
  '/load',
  checkAuthExtension,
  catchError(ExtensionCtrl.getActivities)
);
router.get(
  '/:id',
  checkAuthExtension,
  catchError(ExtensionCtrl.getActivityDetail)
);

module.exports = router;
