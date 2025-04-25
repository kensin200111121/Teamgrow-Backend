const { identityClient } = require('../src/constants/clients');

const createToken = async (data) => {
  const { userId, body } = data;
  const result = await identityClient
    .post({
      uri: `/oauth/users/${userId}`,
      body,
    })
    .catch((err) => console.log('Identity token create error', err));
  return result;
};

const getAllTokens = async (data) => {
  const { userId, queryString } = data;
  const result = await identityClient
    .get({
      uri: `/oauth/users/${userId}?${queryString}`,
    })
    .catch((err) => console.log('Identity token get error', err));
  console.log('----result', result);
  return result;
};

const deleteToken = async (data) => {
  const { userId, body } = data;
  const result = await identityClient
    .delete({
      uri: `/oauth/users/${userId}`,
      body,
    })
    .catch((err) => console.log('Identity token delete error', err));
  return result;
};

const updateTokenById = async (data) => {
  const { userId, tokenId, body } = data;
  const result = await identityClient
    .put({
      uri: `/oauth/users/${userId}/tokens/${tokenId}`,
      body,
    })
    .catch((err) => console.log('Identity token update error', err));
  return result;
};

const getTokenById = async (data) => {
  const { userId, tokenId } = data;
  const result = await identityClient
    .get({
      uri: `/oauth/users/${userId}/tokens/${tokenId}`,
    })
    .catch((err) => console.log('Identity token update error', err));
  return result;
};
const deleteTokenById = async (data) => {
  const { userId, tokenId, body } = data;
  await identityClient
    .delete({
      uri: `/oauth/users/${userId}/tokens/${tokenId}`,
      body,
    })
    .catch((err) => console.log('Identity token update error', err));
};

const query = {
  account: 'rui@crmgrow.com',
  provider: 'google',
  omitDetails: false,
};
const queryString = 'account=rui@crmgrow.com&provider=google&omitDetails=true';
getAllTokens({ userId: 2435283, queryString });
