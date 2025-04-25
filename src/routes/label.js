const express = require('express');

const {
  checkAppJwtAuth,
  checkSuspended,
  checkGlobalAuth,
} = require('../middleware/auth');
const LabelCtrl = require('../controllers/label');
const { catchError } = require('../controllers/error');

const router = express.Router();

// Create label
router.post('/', checkAppJwtAuth, checkSuspended, catchError(LabelCtrl.create));

// Create label
router.post(
  '/bulk-create',
  checkAppJwtAuth,
  checkSuspended,
  catchError(LabelCtrl.bulkCreate)
);

router.post(
  '/contacts',
  checkAppJwtAuth,
  checkSuspended,
  catchError(LabelCtrl.getLabelDetails)
);

// TODO: update the auth middleware for only api call
// Get all labels
router.get('/', checkGlobalAuth, catchError(LabelCtrl.getAll));

router.get('/load', checkAppJwtAuth, catchError(LabelCtrl.loadLabels));
// load the labels with contacts sub docs
router.get(
  '/load-with-contacts',
  checkAppJwtAuth,
  catchError(LabelCtrl.loadLabelsWithContacts)
);
// Update label by id
router.put('/:id', checkAppJwtAuth, catchError(LabelCtrl.update));
// Remove label by id
router.delete('/:id', checkAppJwtAuth, catchError(LabelCtrl.remove));
// Remove multi Labels
router.post('/delete', checkAppJwtAuth, catchError(LabelCtrl.removeLabels));
// Merge Labels
router.post('/merge', checkAppJwtAuth, catchError(LabelCtrl.mergeLabels));
// Change Label orders
router.post('/order', checkAppJwtAuth, catchError(LabelCtrl.changeOrder));
router.get(
  '/shared-contacts',
  checkAppJwtAuth,
  catchError(LabelCtrl.getSharedAll)
);
router.post(
  '/contact-label',
  checkAppJwtAuth,
  catchError(LabelCtrl.getContactLabel)
);

module.exports = router;
