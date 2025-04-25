const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { get } = require('../../controllers/pipe_line');

const router = express.Router();

router.get('/', checkMicroAuth, catchError(get));

module.exports = router;
