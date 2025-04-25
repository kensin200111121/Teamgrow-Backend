const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const FollowUpCtrl = require('../controllers/follow_up');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(FollowUpCtrl.create)
);
router.get('/', checkAppJwtAuth, catchError(FollowUpCtrl.get));
router.get('/date', checkAppJwtAuth, catchError(FollowUpCtrl.getByDate));
router.put('/:id', checkAppJwtAuth, catchError(FollowUpCtrl.update));
router.post(
  '/leave-comment',
  checkAppJwtAuth,
  catchError(FollowUpCtrl.leaveComment)
);
router.post('/load', checkAppJwtAuth, catchError(FollowUpCtrl.load));
router.post('/completed', checkAppJwtAuth, catchError(FollowUpCtrl.completed));
router.post(
  '/uncompleted',
  checkAppJwtAuth,
  catchError(FollowUpCtrl.uncompleted)
);
router.post(
  '/checked',
  checkAppJwtAuth,
  catchError(FollowUpCtrl.updateChecked)
);
router.post(
  '/archived',
  checkAppJwtAuth,
  catchError(FollowUpCtrl.updateArchived)
);
router.post(
  '/create',
  checkAppJwtAuth,
  checkSuspended,
  catchError(FollowUpCtrl.bulkCreate)
);
router.post('/update', checkAppJwtAuth, catchError(FollowUpCtrl.bulkUpdate));
router.post('/select-all', checkAppJwtAuth, catchError(FollowUpCtrl.selectAll));

router.post(
  '/get-autolist',
  checkAppJwtAuth,
  catchError(FollowUpCtrl.getAutoList)
);

module.exports = router;
