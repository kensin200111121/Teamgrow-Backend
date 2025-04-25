const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { easyLoadMaterials } = require('../../controllers/material');

const router = express.Router();

router.get('/', checkMicroAuth, catchError(easyLoadMaterials));

module.exports = router;
