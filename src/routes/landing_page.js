const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const LandingPageCtrl = require('../controllers/landing_page');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/', checkAppJwtAuth, catchError(LandingPageCtrl.load));

router.post(
  '/load-by-material',
  checkAppJwtAuth,
  catchError(LandingPageCtrl.getByMaterial)
);
router.post(
  '/material-tracks/:id',
  checkAppJwtAuth,
  catchError(LandingPageCtrl.getMaterialTrackingHistory)
);
router.post(
  '/form-tracks/:id',
  checkAppJwtAuth,
  catchError(LandingPageCtrl.getFormTrackingHistory)
);
router.post(
  '/count-of-tracks',
  checkAppJwtAuth,
  catchError(LandingPageCtrl.getCountOfTracks)
);

router.post('/', checkAppJwtAuth, catchError(LandingPageCtrl.create));
router.get('/:id', checkAppJwtAuth, catchError(LandingPageCtrl.getById));
router.put('/:id', checkAppJwtAuth, catchError(LandingPageCtrl.update));
router.delete('/:id', checkAppJwtAuth, catchError(LandingPageCtrl.remove));
router.post('/preview', checkAppJwtAuth, catchError(LandingPageCtrl.preview));

module.exports = router;
