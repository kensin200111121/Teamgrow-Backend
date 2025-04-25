const express = require('express');

const { checkAdminJwtAuth } = require('../../middleware/auth');
const TeamCtrl = require('../../controllers/team');
const { catchError } = require('../../controllers/error');

const router = express.Router();

router.post('/load', checkAdminJwtAuth, catchError(TeamCtrl.getAll));

module.exports = router;
