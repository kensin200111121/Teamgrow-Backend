const express = require('express');

const { catchError } = require('../../controllers/error');
const { updateOrganization } = require('../../controllers/team');
const { checkMicroRequest } = require('../../middleware/auth');

const router = express.Router();

router.post('/update', checkMicroRequest, catchError(updateOrganization));

module.exports = router;
