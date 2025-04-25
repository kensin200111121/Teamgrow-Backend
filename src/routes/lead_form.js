const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const LeadFormCtrl = require('../controllers/lead_form');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/', checkAppJwtAuth, catchError(LeadFormCtrl.get));

router.get(
  '/response-count',
  checkAppJwtAuth,
  catchError(LeadFormCtrl.getTrackingCount)
);

router.get('/:id', checkAppJwtAuth, catchError(LeadFormCtrl.getById));

router.post('/', checkAppJwtAuth, catchError(LeadFormCtrl.create));

router.post(
  '/with-history/:id',
  checkAppJwtAuth,
  catchError(LeadFormCtrl.getTrackingHistory)
);

router.put('/:id', checkAppJwtAuth, catchError(LeadFormCtrl.update));

router.delete('/:id', checkAppJwtAuth, catchError(LeadFormCtrl.remove));

router.post('/open', catchError(LeadFormCtrl.openForm));

router.post('/submit', catchError(LeadFormCtrl.submitForm));

module.exports = router;
