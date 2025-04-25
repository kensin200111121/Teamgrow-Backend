const express = require('express');
const user = require('./user');
const follow_up = require('./follow_up');
const folder = require('./folder');
const contact = require('./contact');
const activity = require('./activity');
const note = require('./note');
const phone_log = require('./phone_log');
const appointment = require('./appointment');
const tag = require('./tag');
const file = require('./file');
const email = require('./email');
const video = require('./video');
const pdf = require('./pdf');
const text = require('./text');
const payment = require('./payment');
const template = require('./email_template');
const image = require('./image');
const notification = require('./notification');
const garbage = require('./garbage');
const automation = require('./automation');
const timeline = require('./time_line');
const page = require('./page');
const guest = require('./guest');
const label = require('./label');
const assets = require('./assets');
const affiliate = require('./affiliate');
const team = require('./team');
const team_call = require('./team_call');
const material = require('./material');
const developer = require('./developer');
const integration = require('./integration');
const theme = require('./material_theme');
const mail_list = require('./mail_list');
const campaign = require('./campaign');
const deal = require('./deal');
const deal_stage = require('./deal_stage');
const filter = require('./filter');
const draft = require('./draft');
const call = require('./call');
const pipe_line = require('./pipe_line');
const extension = require('./extension');
const scheduler = require('./scheduler');
const task = require('./task');
const automationline = require('./automation_line');
const outbound = require('./outbound');
const inbound = require('./inbound');
const lead_form = require('./lead_form');
const personality = require('./personality');
const agent_filter = require('./agent_filter');
const sphere_bucket = require('./sphere_bucket');
const event = require('./event');
const landing_page = require('./landing_page');
const custom_field = require('./custom_field');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const {
  SPECIAL_WHITELIST,
  EXTENSION_WHITELIST,
  FRONT_WHITELIST,
  ZAPIER_WHITELIST,
  AGENTFIRE_WHITELIST,
  TWILIO_WHITELIST,
} = require('../constants/cors');

router.get('/health', (req, res) => {
  res.send('OK Cool!');
});

router.get('/health1', (req, res) => {
  res.render('ping_dom');
});

// User Dashboard api
router.use('/user', user);
router.use('/follow', cors(generateCorsOptions(FRONT_WHITELIST)), follow_up);
router.use('/folder', cors(generateCorsOptions(FRONT_WHITELIST)), folder);
router.use('/contact', contact);
router.use('/activity', cors(generateCorsOptions(FRONT_WHITELIST)), activity);
router.use('/note', cors(generateCorsOptions(FRONT_WHITELIST)), note);
router.use('/phone', phone_log);
router.use(
  '/appointment',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  appointment
);
router.use('/tag', cors(generateCorsOptions(FRONT_WHITELIST)), tag);
router.use('/file', cors(generateCorsOptions(SPECIAL_WHITELIST)), file);
router.use('/video', video);
router.use('/image', image);
router.use('/pdf', pdf);
router.use('/sms', text);
router.use('/payment', payment);
router.use('/template', template);
router.use('/email', email);
router.use(
  '/notification',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  notification
);
router.use('/garbage', cors(generateCorsOptions(FRONT_WHITELIST)), garbage);
router.use(
  '/automation',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  automation
);
router.use('/timeline', cors(generateCorsOptions(FRONT_WHITELIST)), timeline);
router.use('/page', page);
router.use('/guest', cors(generateCorsOptions(FRONT_WHITELIST)), guest);
router.use('/label', cors(generateCorsOptions(FRONT_WHITELIST)), label);
router.use('/assets', cors(generateCorsOptions(FRONT_WHITELIST)), assets);
router.use('/affiliate', cors(generateCorsOptions(FRONT_WHITELIST)), affiliate);
router.use('/team', cors(generateCorsOptions(FRONT_WHITELIST)), team);
router.use('/team-call', cors(generateCorsOptions(FRONT_WHITELIST)), team_call);
router.use('/material', material);
router.use(
  '/developer',
  cors(generateCorsOptions(ZAPIER_WHITELIST)),
  checkOrigin,
  developer
);
router.use(
  '/integration',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  integration
);
router.use('/campaign', cors(generateCorsOptions(FRONT_WHITELIST)), campaign);
router.use('/mail-list', cors(generateCorsOptions(FRONT_WHITELIST)), mail_list);
router.use('/theme', cors(generateCorsOptions(FRONT_WHITELIST)), theme);
router.use('/deal', cors(generateCorsOptions(FRONT_WHITELIST)), deal);
router.use(
  '/deal-stage',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  deal_stage
);
router.use('/filter', cors(generateCorsOptions(FRONT_WHITELIST)), filter);
router.use('/draft', cors(generateCorsOptions(FRONT_WHITELIST)), draft);
router.use(
  '/call',
  cors(generateCorsOptions(TWILIO_WHITELIST)),
  checkOrigin,
  call
);
router.use('/pipe', cors(generateCorsOptions(FRONT_WHITELIST)), pipe_line);
router.use(
  '/extension',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  extension
);
router.use('/scheduler', scheduler);
router.use('/task', cors(generateCorsOptions(FRONT_WHITELIST)), task);
router.use(
  '/automation-line',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  automationline
);
router.use(
  '/outbound',
  cors(generateCorsOptions(ZAPIER_WHITELIST)),
  checkOrigin,
  outbound
);
router.use('/inbound', cors(generateCorsOptions(FRONT_WHITELIST)), inbound);
router.use('/lead-form', lead_form);
router.use(
  '/personality',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  personality
);
router.use(
  '/agent-filter',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  agent_filter
);
router.use(
  '/sphere_bucket',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  sphere_bucket
);
router.use(
  '/event',
  cors(generateCorsOptions(AGENTFIRE_WHITELIST)),
  checkOrigin,
  event
);
router.use('/landing-page', checkOrigin, landing_page);
router.use('/custom_field', checkOrigin, custom_field);

module.exports = router;
