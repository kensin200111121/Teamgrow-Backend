const express = require('express');
const {
  loadAllTestHistory,
  runWorkflow,
  loadProgressingTests,
} = require('../../controllers/admin/test');
const { catchError } = require('../../controllers/error');

const router = express.Router();

router.get('/load', catchError(loadAllTestHistory));
router.post('/run', catchError(runWorkflow));
router.get('/pending', catchError(loadProgressingTests));

module.exports = router;
