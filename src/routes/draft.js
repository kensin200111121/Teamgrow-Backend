const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const DraftCtrl = require('../controllers/draft');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/create',
  checkAppJwtAuth,
  checkSuspended,
  catchError(DraftCtrl.create)
);
router.post('/', checkAppJwtAuth, catchError(DraftCtrl.get));

router.put('/:id', checkAppJwtAuth, catchError(DraftCtrl.update));
router.delete('/:id', checkAppJwtAuth, catchError(DraftCtrl.remove));

module.exports = router;
