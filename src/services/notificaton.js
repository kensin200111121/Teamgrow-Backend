const { appClient } = require('../constants/clients');

const createNotification = (data) =>
  appClient
    .post({
      uri: `/notification/create`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('cron notification error', err));

module.exports = {
  createNotification,
};
