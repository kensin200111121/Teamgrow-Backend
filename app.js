const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const morgan = require('morgan');
const { logger, verifyToken, morganFormat } = require('@teamgrow/common');
const Sentry = require('@sentry/node');
// const timeout = require('connect-timeout');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const YAML = require('yaml');

const materialRouter = require('./src/routes/material_play');
const appRouter = require('./src/routes/index');
const microRouter = require('./src/routes/micro');
const adminRouter = require('./src/routes/admin');
const apiRouter = require('./src/routes/api');

const {
  DOMAIN_ORIGIN,
  MAIN_DOMAIN,
  VORTEX_ORIGIN,
} = require('./src/constants/urls');

const app = express();
const swaggerYaml = fs.readFileSync(
  path.join(__dirname, 'swagger.yaml'),
  'utf8'
);
const swaggerDocument = YAML.parse(swaggerYaml);

const corsConfig = {
  credentials: true,
  origin: true,
};

// app.use(timeout('120s'));
// GOAL: the frontend test automation script is not working
// because there is no origin header in the request
app.use((req, _, next) => {
  if (process.env.NODE_ENV !== 'production') {
    if (
      !req.header.origin &&
      (req.headers.referer?.includes(MAIN_DOMAIN) ||
        req.headers.referer?.includes(VORTEX_ORIGIN))
    ) {
      const pathSplits = req.headers.referer?.split('/') || [];
      req.headers.origin = pathSplits[0] + '//' + pathSplits[2];
    }
  }
  next();
});
app.use(cors(corsConfig));
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'pug');

// app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'src/public')));
app.use((req, res, next) => {
  const { decoded, isPublic } = verifyToken(req, res);
  req.decoded = decoded;
  req.isPublic = isPublic;
  logIncomingRequest(req);
  next();
});

app.use(
  morgan(morganFormat, {
    stream: logger.stream,
  })
);
// app.use(express.static('../crmgrow/dist'));

app.use('/app', appRouter);
app.use('/api', appRouter); // keep this for a month
app.use('/micro', microRouter);
app.use('/admin', adminRouter);
app.use('/api-v2', apiRouter);
app.use('/', materialRouter);
app.use(
  '/embed',
  (req, _, next) => {
    req.isEmbed = true;
    next();
  },
  materialRouter
);
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customfavIcon: 'https://app.crmgrow.com/favicon.ico',
    customSiteTitle: 'CRMGROW API DOCS',
  })
);

process.on('uncaughtException', (err) => {
  console.log('uncaughtException', err);
  Sentry.captureException(err);
});

const logIncomingRequest = (req) => {
  // eslint-disable-next-line no-nested-ternary
  const user = req.decoded
    ? req.decoded.id
    : req.isPublic
    ? 'Public'
    : 'Auth failed';
  const endpoint = req.path;
  const time = new Date().toISOString();
  const id = uuidv4();
  req.id = id;
  console.log(
    JSON.stringify({
      type: 'incoming',
      user,
      time,
      endpoint,
      method: req.method,
      id,
    })
  );
};

module.exports = app;
