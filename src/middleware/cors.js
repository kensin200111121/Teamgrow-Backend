const { CALLER_DIC } = require('../constants/cors');
const OriginLog = require('../models/origin_log');

const generateCorsOptions = (whiteListNames) => {
  let whitelist = [];
  whiteListNames.forEach((e) => {
    if (Array.isArray(CALLER_DIC[e])) {
      whitelist = [...whitelist, ...CALLER_DIC[e]];
    } else {
      whitelist.push(CALLER_DIC[e]);
    }
  });
  var corsOptions = {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      const checkResult = whitelist.some((e) => {
        if (e === '*' || origin.includes(e)) {
          return true;
        }
      });
      if (checkResult) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  };
  return corsOptions;
};

const checkOrigin = (req, res, next) => {
  const endpoint = req.path;
  const origin = req.get('origin');
  OriginLog.findOrCreate(
    {
      endpoint,
      origin,
    },
    {
      endpoint,
      origin,
    }
  )
    .then((data) => {})
    .catch((err) => {});
  next();
};

module.exports = {
  generateCorsOptions,
  checkOrigin,
};
