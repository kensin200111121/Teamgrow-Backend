const express = require('express');

const { checkApiJwtAuth } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const { getMe } = require('../../controllers/user');

const router = express.Router();

router.get('/', checkApiJwtAuth, catchError(getMe));

module.exports = router;
