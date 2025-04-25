const { identityClient, vortexApiClient } = require('../constants/clients');

const createToken = async (data) => {
  const { userId, body } = data;
  return identityClient.post({
    uri: `/oauth/users/${userId}`,
    body,
  });
};

const getAllTokens = async (data) => {
  const { userId, query } = data;
  return identityClient.get({
    uri: query ? `/oauth/users/${userId}?${query}` : `/oauth/users/${userId}`,
  });
};

const deleteToken = async (data) => {
  const { userId, body } = data;
  return identityClient.delete({
    uri: `/oauth/users/${userId}`,
    body,
  });
};

const updateTokenById = async (data) => {
  const { userId, tokenId, body } = data;
  return identityClient.put({
    uri: `/oauth/users/${userId}/tokens/${tokenId}`,
    body,
  });
};

const getTokenById = async (data) => {
  const { userId, tokenId } = data;
  return identityClient.get({
    uri: `/oauth/users/${userId}/tokens/${tokenId}`,
  });
};

const deleteTokenById = async (data) => {
  const { userId, tokenId } = data;
  return identityClient.delete({
    uri: `/oauth/users/${userId}/tokens/${tokenId}`,
  });
};

const getTeamById = async (teamId) => {
  return identityClient.get({
    uri: `/teams/${teamId}`,
  });
};

const getVirtualCustomerById = async (virtualCustomerId, accessToken) => {
  return vortexApiClient.get({
    uri: `/users/${virtualCustomerId}?access_token=${accessToken}`,
  });
};

module.exports = {
  createToken,
  getAllTokens,
  deleteToken,
  updateTokenById,
  getTokenById,
  deleteTokenById,
  getTeamById,
  getVirtualCustomerById,
};
