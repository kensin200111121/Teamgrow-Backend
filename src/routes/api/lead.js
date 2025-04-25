const express = require('express');

const { checkApiJwtAuth } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');

const router = express.Router();

router.get('/', checkApiJwtAuth, catchError(DeveloperCtrl.getLeadSources));
router.get(
  '/types',
  checkApiJwtAuth,
  catchError(DeveloperCtrl.getLeadSourceTypes)
);

module.exports = router;
