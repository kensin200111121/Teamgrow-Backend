const express = require('express');

const { receiveEvent } = require('../controllers/agentfire');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/', catchError(receiveEvent));

module.exports = router;
