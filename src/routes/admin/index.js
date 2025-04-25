const express = require('express');

const user = require('./user');
const automation = require('./automation');
const template = require('./template');
const material = require('./material');
const team = require('./team');
const test = require('./test');
const blacklist = require('./blacklist');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions } = require('../../middleware/cors');
const { SUPPORT_WHITELIST } = require('../../constants/cors');

// Admin Dashboard api
router.use('/user', cors(generateCorsOptions(SUPPORT_WHITELIST)), user);
router.use('/template', cors(generateCorsOptions(SUPPORT_WHITELIST)), template);
router.use('/material', cors(generateCorsOptions(SUPPORT_WHITELIST)), material);
router.use('/team', cors(generateCorsOptions(SUPPORT_WHITELIST)), team);
router.use(
  '/automation',
  cors(generateCorsOptions(SUPPORT_WHITELIST)),
  automation
);
router.use('/test', cors(generateCorsOptions(SUPPORT_WHITELIST)), test);
router.use(
  '/blacklist',
  cors(generateCorsOptions(SUPPORT_WHITELIST)),
  blacklist
);

module.exports = router;
