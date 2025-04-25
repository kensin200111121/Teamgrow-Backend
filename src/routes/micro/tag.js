const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { getAll, getTagsDetail } = require('../../controllers/tag');

const router = express.Router();

router.get('/getAll', checkMicroAuth, catchError(getAll));
router.post('/load-contacts', checkMicroAuth, catchError(getTagsDetail));

module.exports = router;
