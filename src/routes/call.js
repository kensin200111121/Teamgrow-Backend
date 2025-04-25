const express = require('express');

const CallCtrl = require('../controllers/call');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/forward-twilio', catchError(CallCtrl.forwardCallTwilio));

module.exports = router;
