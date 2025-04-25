const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { create } = require('../../controllers/note');

const router = express.Router();

router.post('/create', checkMicroAuth, catchError(create));
router.post('/v2/create', checkMicroAuth, catchError(create));

module.exports = router;
