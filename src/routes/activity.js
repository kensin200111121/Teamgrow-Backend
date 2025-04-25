const express = require('express');

const ActivityCtrl = require('../controllers/activity');
const ExtensionCtrl = require('../controllers/extension');
const { catchError } = require('../controllers/error');
const {
  checkAppJwtAuth,
  checkSuspended,
  checkLastLogin,
} = require('../middleware/auth');

const router = express.Router();

router.post('/remove-all', checkAppJwtAuth, catchError(ActivityCtrl.removeAll));
router.post('/remove', checkAppJwtAuth, catchError(ActivityCtrl.removeBulk));
router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(ActivityCtrl.create)
);
router.post('/update', checkAppJwtAuth, catchError(ActivityCtrl.update));
router.get(
  '/',
  checkAppJwtAuth,
  catchError(checkLastLogin),
  catchError(ActivityCtrl.get)
);
router.get('/:id', checkAppJwtAuth, catchError(ActivityCtrl.get));
router.post('/get', checkAppJwtAuth, catchError(ActivityCtrl.load));
router.post('/sent', checkAppJwtAuth, catchError(ExtensionCtrl.sendActivity));

module.exports = router;
