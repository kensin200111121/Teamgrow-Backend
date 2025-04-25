const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const AutomationLineCtrl = require('../controllers/automation_line');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/:id', checkAppJwtAuth, catchError(AutomationLineCtrl.getDetail));

module.exports = router;
