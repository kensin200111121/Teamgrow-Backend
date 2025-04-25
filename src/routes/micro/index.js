const express = require('express');

const contact = require('./contact');
const label = require('./label');
const material = require('./material');
const page = require('./page');
const tag = require('./tag');
const timeline = require('./time_line');
const user = require('./user');
const notification = require('./notification');
const deal = require('./deal');
const note = require('./note');
const follow_up = require('./follow_up');
const outbound = require('./outbound');
const team = require('./team');
const automation = require('./automation');
const pipe = require('./pipe');
const dealStage = require('./deal_stage');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../../middleware/cors');
const { MICRO_SERVICE_WHITELIST } = require('../../constants/cors');

// Micro api
router.use(
  '/timeline',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  timeline
);
router.use(
  '/contact',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  contact
);
router.use(
  '/team',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  team
);
router.use(
  '/label',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  label
);
router.use(
  '/material',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  material
);
router.use(
  '/page',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  page
);
router.use(
  '/user',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  user
);
router.use(
  '/tag',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  tag
);
router.use(
  '/notification',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  checkOrigin,
  notification
);
router.use('/deal', cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)), deal);
router.use('/note', cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)), note);
router.use(
  '/follow',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  follow_up
);
router.use(
  '/outbound',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  outbound
);

router.use(
  '/automation',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  automation
);

router.use('/pipe', cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)), pipe);

router.use(
  '/deal-stage',
  cors(generateCorsOptions(MICRO_SERVICE_WHITELIST)),
  dealStage
);

module.exports = router;
