const express = require('express');

const BucketCtrl = require('../controllers/sphere_bucket');
const { catchError } = require('../controllers/error');
const { checkAppJwtAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', checkAppJwtAuth, catchError(BucketCtrl.create));
router.put('/:id', checkAppJwtAuth, catchError(BucketCtrl.update));
router.delete('/:id', checkAppJwtAuth, catchError(BucketCtrl.remove));
router.get('/', checkAppJwtAuth, catchError(BucketCtrl.load));
router.post('/score', checkAppJwtAuth, catchError(BucketCtrl.updateScores));

module.exports = router;
