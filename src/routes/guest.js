const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const GuestCtrl = require('../controllers/guest');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/load', checkAppJwtAuth, catchError(GuestCtrl.load));
router.post('/', checkAppJwtAuth, catchError(GuestCtrl.create));
router.get('/', checkAppJwtAuth, catchError(GuestCtrl.get));
router.put('/:id', checkAppJwtAuth, catchError(GuestCtrl.edit));
router.delete('/:id', checkAppJwtAuth, catchError(GuestCtrl.remove));

module.exports = router;
