const Sentry = require('@sentry/node');
const { SENTRY_DSN } = require('./src/configs/api');

Sentry.init({
  dsn: SENTRY_DSN,
  environment:
    process.env.NODE_ENV === 'production' ? 'production' : 'development',
  tracesSampleRate: 1.0,
  ignoreErrors: [
    /Sentry syntheticException/i,
    /Unauthorized/i,
    /Error: socket hang up/i,
    /getaddrinfo ENOTFOUND/i,
    /read ECONNRESET/i,
  ],
});
