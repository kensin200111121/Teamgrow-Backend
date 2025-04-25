const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const AgentFilterCtrl = require('../controllers/agent_filter');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/', checkAppJwtAuth, catchError(AgentFilterCtrl.get));

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AgentFilterCtrl.create)
);

router.put('/:id', checkAppJwtAuth, catchError(AgentFilterCtrl.update));

router.delete('/:id', checkAppJwtAuth, catchError(AgentFilterCtrl.remove));

module.exports = router;
