const { wavvClient, wavvVortexClient } = require('../constants/clients');

const listWavvNumbers = (userId, source) => {
  const client = source === 'vortex' ? wavvVortexClient : wavvClient;

  return client
    .get({
      uri: `/sms/numbers?userId=${userId}`,
    })
    .catch((err) =>
      console.log('wavv user phone numbers error', err.error || err.message)
    );
};

const createWavvUser = (data, source) => {
  const client = source === 'vortex' ? wavvVortexClient : wavvClient;

  return client
    .post({
      uri: `/users`,
      body: {
        ...data,
      },
    })
    .catch((err) =>
      console.log('wavv user creation error', err.error || err.message)
    );
};

const getWavvUserState = (userId, source) => {
  const client = source === 'vortex' ? wavvVortexClient : wavvClient;

  return client
    .get({
      uri: `/users/${userId}`,
    })
    .catch((err) =>
      console.log('wavv user getting error', err.error || err.message)
    );
};

const getWavvBrandState = (userId, source) => {
  const client = source === 'vortex' ? wavvVortexClient : wavvClient;

  return client
    .get({
      uri: `/users/${userId}/brand-registration`,
    })
    .catch((err) =>
      console.log('wavv brand state getting error', err.error || err.message)
    );
};

const updateWavvSubscription = (userId, data, source) => {
  const client = source === 'vortex' ? wavvVortexClient : wavvClient;

  return client
    .put({
      uri: `/users/${userId}`,
      body: {
        ...data,
      },
    })
    .catch((err) =>
      console.log('wavv update user error', err.error || err.message)
    );
};

const sendMessage = (data, source) => {
  const client = source === 'vortex' ? wavvVortexClient : wavvClient;

  return client
    .post({
      uri: `/sms/messages`,
      body: {
        ...data,
      },
    })
    .catch((err) =>
      console.log('wavv send message error', err.error || err.message)
    );
};

const deleteWavvUser = (userId) =>
  wavvClient
    .delete({
      uri: `/users/${userId}`,
    })
    .catch((err) =>
      console.log('wavv user delete error', err.error || err.message)
    );

module.exports = {
  sendMessage,
  listWavvNumbers,
  getWavvUserState,
  updateWavvSubscription,
  getWavvBrandState,
  deleteWavvUser,
  createWavvUser,
};
