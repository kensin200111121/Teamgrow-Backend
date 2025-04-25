const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const TaskCtrl = require('../controllers/task');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/', checkAppJwtAuth, checkSuspended, catchError(TaskCtrl.create));
router.get('/', checkAppJwtAuth, catchError(TaskCtrl.get));
router.get('/mass-tasks', checkAppJwtAuth, catchError(TaskCtrl.getMassTasks));
router.post(
  '/create',
  checkAppJwtAuth,
  checkSuspended,
  catchError(TaskCtrl.bulkCreate)
);
router.post(
  '/remove',
  checkAppJwtAuth,
  catchError(TaskCtrl.removeScheduleItem)
);
router.post(
  '/remove-contact',
  checkAppJwtAuth,
  catchError(TaskCtrl.removeContact)
);
router.put('/:id', checkAppJwtAuth, catchError(TaskCtrl.update));
router.delete('/:id', checkAppJwtAuth, catchError(TaskCtrl.remove));

module.exports = router;
