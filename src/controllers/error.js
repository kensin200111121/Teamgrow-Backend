const Sentry = require('@sentry/node');
const { logger } = require('@teamgrow/common');

const catchError = (callback) => {
  return async (req, res, next) => {
    try {
      // await callback(req, res, next).catch((err) => {
      //   console.log('err in catch', err.message);
      //   return res.status(500).send({
      //     status: false,
      //     error: 'internal_server_error',
      //   });
      // });
      if (callback) {
        await callback(req, res, next);
      } else {
        Sentry.captureException(
          new Error(
            'callback is not defined for this endpoint ' + req.originalUrl
          ),
          {
            user: {
              id: req.currentUser ? req.currentUser.id : 'No user',
            },
          }
        );
      }
    } catch (e) {
      console.error(e);
      Sentry.captureException(e, {
        user: {
          id: req.currentUser ? req.currentUser.id : 'No user',
        },
      });
      logger.error('exception caught:', e);

      return res.status(500).send({
        status: false,
        error: 'internal_server_error',
      });
    }
  };
};

module.exports = {
  catchError,
};
