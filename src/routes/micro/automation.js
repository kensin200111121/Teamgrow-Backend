const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { triggerAutomation, loadOwn } = require('../../controllers/automation');

const router = express.Router();

router.post('/trigger', checkMicroAuth, catchError(triggerAutomation));
router.get('/list/own', checkMicroAuth, catchError(loadOwn));

module.exports = router;
