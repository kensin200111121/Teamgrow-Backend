const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { loadLadingPages } = require('../../controllers/page');

const router = express.Router();

router.get('/list', checkMicroAuth, catchError(loadLadingPages));

module.exports = router;
