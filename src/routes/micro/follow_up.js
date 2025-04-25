const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { create, update, completed } = require('../../controllers/follow_up');

const router = express.Router();

router.post('/create', checkMicroAuth, catchError(create));
router.put('/:id', checkMicroAuth, catchError(update));
router.post('/completed', checkMicroAuth, catchError(completed));

module.exports = router;
