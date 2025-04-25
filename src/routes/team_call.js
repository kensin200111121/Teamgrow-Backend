const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const TeamCallCtrl = require('../controllers/team_call');
const { catchError } = require('../controllers/error');

const router = express.Router();

// Team call for 3 way

router.get('/call', checkAppJwtAuth, catchError(TeamCallCtrl.getInquireCall));

router.get(
  '/nth-call/:id',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.getInquireCall)
);

router.get(
  '/call/:id',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.getDetailInquireCall)
);

router.get(
  '/call-planned',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.getPlannedCall)
);
router.get(
  '/call-planned/:id',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.getPlannedCall)
);

router.get(
  '/call-finished',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.getFinishedCall)
);
router.get(
  '/call-finished/:id',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.getFinishedCall)
);

router.post(
  '/request-call',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.requestCall)
);

router.post(
  '/accept-call',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.acceptCall)
);

router.post(
  '/reject-call',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.rejectCall)
);

router.put('/call/:id', checkAppJwtAuth, catchError(TeamCallCtrl.updateCall));
router.delete(
  '/call/:id',
  checkAppJwtAuth,
  catchError(TeamCallCtrl.removeCall)
);
router.delete('/call', checkAppJwtAuth, catchError(TeamCallCtrl.removeCall));

router.post('/load-call', checkAppJwtAuth, catchError(TeamCallCtrl.loadCalls));

module.exports = router;
