const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const DealStageCtrl = require('../controllers/deal_stage');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(DealStageCtrl.create)
);
router.post(
  '/add',
  checkAppJwtAuth,
  checkSuspended,
  catchError(DealStageCtrl.add)
);

router.get('/init', checkAppJwtAuth, catchError(DealStageCtrl.init));

router.get('/easy-load', checkAppJwtAuth, catchError(DealStageCtrl.getStages));

router.get(
  '/with-contact',
  checkAppJwtAuth,
  catchError(DealStageCtrl.getStageWithContact)
);

router.get('/', checkAppJwtAuth, catchError(DealStageCtrl.getAll));

router.post(
  '/search',
  checkAppJwtAuth,
  catchError(DealStageCtrl.searchDealsByKeyword)
);

router.put('/:id', checkAppJwtAuth, catchError(DealStageCtrl.edit));

router.post('/remove', checkAppJwtAuth, catchError(DealStageCtrl.remove));

router.post('/load', checkAppJwtAuth, catchError(DealStageCtrl.load));

router.post('/load-more', checkAppJwtAuth, catchError(DealStageCtrl.loadMore));

router.post(
  '/search-deals',
  checkAppJwtAuth,
  catchError(DealStageCtrl.searchDeals)
);

router.post(
  '/change-order',
  checkAppJwtAuth,
  catchError(DealStageCtrl.changeOrder)
);

router.post(
  '/easy-load',
  checkAppJwtAuth,
  catchError(DealStageCtrl.getEasyLoad)
);
router.get(
  '/easy-load',
  checkAppJwtAuth,
  catchError(DealStageCtrl.getEasyLoad)
);
router.get('/:id', checkAppJwtAuth, catchError(DealStageCtrl.getStage));

module.exports = router;
