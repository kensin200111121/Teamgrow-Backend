const request = require('request-promise');

const X_API_KEY = process.env.X_API_KEY;

const domain = 'http://127.0.0.1:3000';
const MICRO_APP_URL = `${domain}/micro`;

const appClient = request.defaults({
  baseUrl: MICRO_APP_URL,
  forever: true,
  json: true,
  headers: {
    'x-api-key': `${X_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

const testRes = (data) => {
  return new Promise((res) => {
    appClient
      .post({
        uri: `/contact/test-res`,
        body: {
          ...data,
        },
      })
      .then((result) => res(result))
      .catch((err) => res({ statusCode: err.statusCode, ...err.error }));
  });
};

const runFunc = (val) => {
  if (
    testRes({ inputVal: val })
      .then((res) => {
        console.log('---res ', res);
      })
      .catch((err) => {
        console.log('=----run err', err);
      })
  );
};

runFunc(0);

// controller
/**
 * 
 * const testRes = async (req, res) => {
  const { inputVal } = req.body;
  console.log('-----------input val', inputVal);
  if (inputVal === 1) {
    return res.send({
      status: true,
      data: {
        queue: 'success',
      },
    });
  } else {
    return res.status(500).json({
      status: false,
      error: 'failed',
    });
  }
};
 * 
 */

// route
/**
 * router.post('/test-res', catchError(testRes));
 */
