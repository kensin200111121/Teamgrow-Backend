const express = require('express');

const { checkAdminJwtAuth } = require('../../middleware/auth');
const TemplateCtrl = require('../../controllers/email_template');
const { catchError } = require('../../controllers/error');

const router = express.Router();

router.post('/load-own', checkAdminJwtAuth, catchError(TemplateCtrl.loadOwn));

module.exports = router;
