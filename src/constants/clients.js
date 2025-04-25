const request = require('request-promise');
const {
  MICRO_APP_URL,
  MICRO_AUTOMATION_URL,
  IDENTITY_API_URL,
  VORTEX_API_URL,
  WAVV_URL,
} = require('./urls');
const {
  MICRO_ACCESS_TOKEN,
  IDENTITY_TOKEN,
  DIALER,
} = require('../configs/api');

module.exports.appClient = request.defaults({
  baseUrl: MICRO_APP_URL,
  forever: true,
  json: true,
  headers: {
    'x-api-key': `${MICRO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

module.exports.automationClient = request.defaults({
  baseUrl: MICRO_AUTOMATION_URL,
  forever: true,
  json: true,
  headers: {
    'x-api-key': `${MICRO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});
module.exports.identityClient = request.defaults({
  baseUrl: IDENTITY_API_URL,
  forever: true,
  json: true,
  headers: {
    'x-api-key': `${IDENTITY_TOKEN}`,
    'Content-Type': 'application/json',
  },
});
module.exports.vortexApiClient = request.defaults({
  baseUrl: VORTEX_API_URL,
  forever: true,
  json: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

module.exports.wavvClient = request.defaults({
  baseUrl: WAVV_URL,
  forever: true,
  json: true,
  headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    user: DIALER.VENDOR_ID,
    password: DIALER.API_KEY,
  },
});

module.exports.wavvVortexClient = request.defaults({
  baseUrl: WAVV_URL,
  forever: true,
  json: true,
  headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    user: DIALER.VORTEX_VENDOR_ID,
    password: DIALER.VORTEX_API_KEY,
  },
});
