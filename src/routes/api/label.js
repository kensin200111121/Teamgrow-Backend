const express = require('express');

const { checkApiJwtAuth } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');

const router = express.Router();

router.get('/', checkApiJwtAuth, catchError(DeveloperCtrl.getLabels));

module.exports = router;
