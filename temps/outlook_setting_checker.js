const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { AuthorizationCode } = require('simple-oauth2');

const { DB_PORT } = require('../src/configs/database');
const User = require('../src/models/user');
const api = require('../src/configs/api');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    checkOutlookSettings();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const oldCredentials = {
  client: {
    id: api.OUTLOOK_CLIENT.OLD_OUTLOOK_CLIENT_ID,
    secret: api.OUTLOOK_CLIENT.OLD_OUTLOOK_CLIENT_SECRET,
  },
  auth: {
    authorizeHost: 'https://login.microsoftonline.com/common/',
    authorizePath: 'oauth2/v2.0/authorize',
    tokenHost: 'https://login.microsoftonline.com/common/',
    tokenPath: 'oauth2/v2.0/token',
  },
};

const oldOauth2 = new AuthorizationCode(oldCredentials);

const checkOutlookSettings = async () => {
  const users = await User.find({
    outlook_version: { $exists: false },
    connected_email_type: { $in: ['outlook', 'microsoft'] },
    del: false,
  }).catch((err) => {});

  let correctSettingCount = 0;
  for (let i = 0; i < users.length; i++) {
    const currentUser = users[i];
    console.log('i user getting', i, currentUser.email);
    let accessToken = '';
    const token = oldOauth2.createToken({
      refresh_token: currentUser.outlook_refresh_token,
      expires_in: 0,
    });
    await new Promise((resolve, reject) => {
      token
        .refresh()
        .then((data) => resolve(data.token))
        .catch((err) => reject(err));
    })
      .then((token) => {
        accessToken = token.access_token;
      })
      .catch((error) => {
        console.log(
          'access token getting issue',
          currentUser.email,
          currentUser._id,
          error?.data?.payload?.error
        );
      });

    if (accessToken) {
      correctSettingCount++;
      console.log('succeed', currentUser.email, currentUser._id);
    }
  }
  console.log('correctSettingCount', correctSettingCount);
};
