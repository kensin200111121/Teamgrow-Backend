const express = require('express');
const { create, remove, load } = require('../../controllers/admin/blacklist');
const { catchError } = require('../../controllers/error');
const { checkAdminJwtAuth } = require('../../middleware/auth');

const router = express.Router();

router.post('/', checkAdminJwtAuth, catchError(create));
router.get('/', checkAdminJwtAuth, catchError(load));
router.delete('/:id', checkAdminJwtAuth, catchError(remove));

module.exports = router;
