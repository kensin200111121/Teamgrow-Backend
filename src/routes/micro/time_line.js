const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { create } = require('../../controllers/time_line');

const router = express.Router();

router.post('/create', checkMicroAuth, catchError(create));

module.exports = router;
