const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { getAll } = require('../../controllers/label');

const router = express.Router();

router.get('/', checkMicroAuth, catchError(getAll));

module.exports = router;
