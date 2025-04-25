const express = require('express');

const {
  checkAppJwtAuth,
  checkSuspended,
  checkGlobalAuth,
} = require('../middleware/auth');
const CustomFieldCtrl = require('../controllers/custom_field');
const { catchError } = require('../controllers/error');

const router = express.Router();

// Create label
router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(CustomFieldCtrl.create)
);

// Create label
// router.post(
//   '/bulk-create',
//   checkAppJwtAuth,
//   checkSuspended,
//   catchError(LabelCtrl.bulkCreate)
// );

// TODO: update the auth middleware for only api call
// Get all labels
router.get('/:kind', checkGlobalAuth, catchError(CustomFieldCtrl.getAll));

// load the labels with contacts sub docs

// Update label by id
router.put('/:id', checkAppJwtAuth, catchError(CustomFieldCtrl.update));
// Remove label by id
router.delete('/:id', checkAppJwtAuth, catchError(CustomFieldCtrl.remove));
// Remove multi Labels
router.post(
  '/delete',
  checkAppJwtAuth,
  catchError(CustomFieldCtrl.removeFields)
);
// Merge Labels

module.exports = router;
