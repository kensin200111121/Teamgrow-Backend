const winston = require('winston');
const clfDate = require('clf-date');
const jwt = require('jsonwebtoken');
const api = require('./src/configs/api');
const morgan = require('morgan');
const Sentry = require('@sentry/node');

morgan.token('user-id', (req) => {
  // eslint-disable-next-line no-nested-ternary
  return req.decoded ? req.decoded.id : req.isPublic ? 'Public' : 'Auth failed';
});

morgan.token('detail', (req) => {
  return `${req.ip} - [${clfDate(new Date())}] - ${req.headers['user-agent']}`;
});

morgan.token('is-guest', (req) => {
  return req.decoded && req.decoded.guest_loggin
    ? 'Guest(' + (req.decoded.guest_id || '') + ')'
    : '';
});

morgan.token('user-email', (req) => {
  return req.currentUser ? req.currentUser.email : '';
});

morgan.token('id', (req) => {
  return req.id || '';
});

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf((info) => `${info.message}`)
);

const transports = [new winston.transports.Console()];

const logger = winston.createLogger({
  level: 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  format,
  transports,
});

logger.stream = {
  write(message) {
    logger.info(message.trim());
  },
};

// token validation middleware
const verifyToken = (req) => {
  const token = req.get('Authorization');
  let decoded;
  let isPublic;

  if (token) {
    isPublic = false;
    try {
      decoded = jwt.verify(token, api.APP_JWT_SECRET);
    } catch (err) {
      //
    }
  } else {
    isPublic = true;
  }
  return {
    decoded,
    isPublic,
  };
};

const morganFormat = (tokens, req, res) => {
  const duration = tokens['response-time'](req, res);
  const endpoint = tokens['url'](req, res);
  if (duration > 120000) {
    Sentry.captureException(
      new Error(
        `It took long time (${duration}) to response for local when ${req.decoded?.id} call ${endpoint}`
      ),
      {
        user: {
          id: req.decoded?.id,
        },
        extra: {
          endpoint,
        },
      }
    );
  }
  return JSON.stringify({
    time: tokens['date'](req, res, 'iso'),
    user: tokens['user-id'](req),
    email: tokens['user-email'](req),
    guest: tokens['is-guest'](req),
    method: tokens['method'](req, res),
    endpoint,
    status: tokens['status'](req, res),
    size: tokens['res'](req, res, 'content-length'),
    detail: tokens['detail'](req),
    remoteAddress: tokens['remote-addr'](req, res),
    duration,
    id: tokens['id'](req),
  });
};

module.exports = {
  logger,
  verifyToken,
  morganFormat,
};
