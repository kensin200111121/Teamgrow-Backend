const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { load } = require('../../controllers/deal_stage');

const router = express.Router();

router.post('/load', checkMicroAuth, catchError(load));

module.exports = router;
