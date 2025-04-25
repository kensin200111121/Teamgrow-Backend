const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const FilterCtrl = require('../controllers/filter');
const { catchError } = require('../controllers/error');

const router = express.Router();

// Create fitler
router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(FilterCtrl.create)
);
// Get all fitlers
router.get('/', checkAppJwtAuth, catchError(FilterCtrl.getAll));
// Update fitler by id
router.put('/:id', checkAppJwtAuth, catchError(FilterCtrl.update));
// Remove fitler by id
router.delete('/:id', checkAppJwtAuth, catchError(FilterCtrl.remove));

module.exports = router;
