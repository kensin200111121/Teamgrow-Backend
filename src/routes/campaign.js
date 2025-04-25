const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const CampaignCtrl = require('../controllers/campaign');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(CampaignCtrl.create)
);

router.get('/', checkAppJwtAuth, catchError(CampaignCtrl.getAll));
router.get(
  '/await-campaign',
  checkAppJwtAuth,
  catchError(CampaignCtrl.getAwaitingCampaigns)
);

router.get(
  '/day-status',
  checkAppJwtAuth,
  catchError(CampaignCtrl.getDayStatus)
);

router.get('/:id', checkAppJwtAuth, catchError(CampaignCtrl.get));

router.put('/:id', checkAppJwtAuth, catchError(CampaignCtrl.update));

router.post(
  '/sessions',
  checkAppJwtAuth,
  catchError(CampaignCtrl.loadSessions)
);

router.post(
  '/activities',
  checkAppJwtAuth,
  catchError(CampaignCtrl.loadActivities)
);

router.post(
  '/remove-session',
  checkAppJwtAuth,
  catchError(CampaignCtrl.removeSession)
);

router.post(
  '/remove-contact',
  checkAppJwtAuth,
  catchError(CampaignCtrl.removeContact)
);

router.post('/publish', checkAppJwtAuth, catchError(CampaignCtrl.publish));

router.post('/save-draft', checkAppJwtAuth, catchError(CampaignCtrl.saveDraft));

router.post('/remove', checkAppJwtAuth, catchError(CampaignCtrl.remove));

router.post('/load-draft', checkAppJwtAuth, catchError(CampaignCtrl.loadDraft));

router.post(
  '/load-contacts',
  checkAppJwtAuth,
  catchError(CampaignCtrl.loadDraftContacts)
);

router.post(
  '/bulk-remove',
  checkAppJwtAuth,
  catchError(CampaignCtrl.bulkRemove)
);

router.get('/load-own', checkAppJwtAuth, catchError(CampaignCtrl.load));
module.exports = router;
