const request = require('request-promise');
const api = require('../configs/api');

const sendSlackNotification = (data) => {
  const options = {
    method: 'POST',
    url: api.SLACK.NEW_EXTENSION_USERS,
    headers: {
      'Content-Type': 'application/json',
    },
    body: { text: data },
    json: true,
  };

  request(options, function (error, response, data) {
    if (error) throw new Error(error);
  });
};

module.exports = {
  sendSlackNotification,
};
