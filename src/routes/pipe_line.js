const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const PipeLineCtrl = require('../controllers/pipe_line');

const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(PipeLineCtrl.create)
);
router.get('/get/:id', checkAppJwtAuth, catchError(PipeLineCtrl.loadPipelines));

router.get('/load', checkAppJwtAuth, catchError(PipeLineCtrl.loadPipelines));
router.get('/', checkAppJwtAuth, catchError(PipeLineCtrl.get));
router.get('/:id', checkAppJwtAuth, catchError(PipeLineCtrl.getById));

router.put('/:id', checkAppJwtAuth, catchError(PipeLineCtrl.update));
router.delete('/:id', checkAppJwtAuth, catchError(PipeLineCtrl.remove));
router.post(
  '/delete',
  checkAppJwtAuth,
  catchError(PipeLineCtrl.deletePipeline)
);

router.post(
  '/load-library',
  checkAppJwtAuth,
  catchError(PipeLineCtrl.loadLibrary)
);

module.exports = router;
