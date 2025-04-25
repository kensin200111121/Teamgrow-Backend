const express = require('express');
const contact = require('./contact');
const automation = require('./automation');
const followup = require('./followup');
const note = require('./note');
const label = require('./label');
const template = require('./template');
const material = require('./material');
const inbound = require('./inbound');
const outbound = require('./outbound');
const lead = require('./lead');
const user = require('./user');
const phone = require('./phone');
const payment = require('./payment');
const email = require('./email');
const text = require('./text');
const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../../middleware/cors');
const {
  ZAPIER_WHITELIST,
  FRONT_WHITELIST,
  STRIPE_WHITELIST,
  WAVV_WHITELIST,
  TWILIO_WHITELIST,
} = require('../../constants/cors');

const router = express.Router();

router.use('/contact', cors(generateCorsOptions(ZAPIER_WHITELIST)), contact);

router.use(
  '/automation',
  cors(generateCorsOptions(ZAPIER_WHITELIST)),
  automation
);

router.use('/followup', cors(generateCorsOptions(ZAPIER_WHITELIST)), followup);

router.use('/note', cors(generateCorsOptions(ZAPIER_WHITELIST)), note);

router.use(
  '/label',
  cors(generateCorsOptions(ZAPIER_WHITELIST)),
  checkOrigin,
  label
);

router.use('/template', cors(generateCorsOptions(ZAPIER_WHITELIST)), template);

router.use('/material', cors(generateCorsOptions(ZAPIER_WHITELIST)), material);

router.use('/inbound', cors(generateCorsOptions(FRONT_WHITELIST)), inbound);

router.use('/outbound', cors(generateCorsOptions(ZAPIER_WHITELIST)), outbound);

router.use('/lead', cors(generateCorsOptions(ZAPIER_WHITELIST)), lead);

router.use('/user', cors(generateCorsOptions(ZAPIER_WHITELIST)), user);

router.use('/payment', cors(generateCorsOptions(STRIPE_WHITELIST)), payment);

router.use('/phone', cors(generateCorsOptions(WAVV_WHITELIST)), phone);

router.use('/email', email);

router.use('/text', cors(generateCorsOptions(TWILIO_WHITELIST)), text);

module.exports = router;
