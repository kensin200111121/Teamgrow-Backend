const express = require('express');

const { checkAdminJwtAuth } = require('../../middleware/auth');
const MaterialCtrl = require('../../controllers/material');
const { catchError } = require('../../controllers/error');

const router = express.Router();

router.post('/load-own', checkAdminJwtAuth, catchError(MaterialCtrl.loadOwn));

module.exports = router;
