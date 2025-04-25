const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const PersonalityCtrl = require('../controllers/personality');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/load', checkAppJwtAuth, catchError(PersonalityCtrl.load));
router.post('/', checkAppJwtAuth, catchError(PersonalityCtrl.create));
router.put('/:id', checkAppJwtAuth, catchError(PersonalityCtrl.update));
router.delete('/:id', checkAppJwtAuth, catchError(PersonalityCtrl.remove));

module.exports = router;
