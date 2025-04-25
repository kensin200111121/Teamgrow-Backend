const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { requestOutboundApi } = require('../../controllers/outbound');

const router = express.Router();

router.post('/', checkMicroAuth, catchError(requestOutboundApi));

module.exports = router;
