const express = require('express');
const { catchError } = require('../../controllers/error');
const PhoneLogCtrl = require('../../controllers/phone_log');
const { checkOrigin } = require('../../middleware/cors');

const router = express.Router();

router.post('/event', checkOrigin, catchError(PhoneLogCtrl.handleEvent));

module.exports = router;
