const express = require('express');

const { checkAdminJwtAuth } = require('../../middleware/auth');
const AutomationCtrl = require('../../controllers/automation');
const { catchError } = require('../../controllers/error');

const router = express.Router();

router.post('/load-own', checkAdminJwtAuth, catchError(AutomationCtrl.load));

module.exports = router;
