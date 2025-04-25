const express = require('express');
const { catchError } = require('../../controllers/error');
const EmailCtrl = require('../../controllers/email');

const router = express.Router();

router.get('/opened/:id', catchError(EmailCtrl.receiveEmail));
router.get('/opened1/:id', catchError(EmailCtrl.receiveEmailExtension));
router.get('/unsubscribe/:id', catchError(EmailCtrl.unSubscribeEmail));
router.get('/resubscribe/:id', catchError(EmailCtrl.reSubscribeEmail));

module.exports = router;
