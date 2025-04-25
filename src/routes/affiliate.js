const express = require('express');

const AffiliateCtrl = require('../controllers/affiliate');
const { checkAppJwtAuth } = require('../middleware/auth');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/', checkAppJwtAuth, catchError(AffiliateCtrl.create));
router.get('/', checkAppJwtAuth, catchError(AffiliateCtrl.get));
router.get('/referrals', checkAppJwtAuth, catchError(AffiliateCtrl.getAll));
router.get('/charge', checkAppJwtAuth, catchError(AffiliateCtrl.getCharge));
router.put('/', checkAppJwtAuth, catchError(AffiliateCtrl.updatePaypal));
router.post('/event', catchError(AffiliateCtrl.eventListener));

module.exports = router;
