const request = require('request-promise');

const api = require('../configs/api');
const urls = require('../constants/urls');
const { decryptInfo, encryptInfo } = require('./utility');
const Garbage = require('../models/garbage');

const requestAuth = (code) => {
  const options = {
    method: 'POST',
    url: 'https://zoom.us/oauth/token',
    qs: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: urls.ZOOM_AUTHORIZE_URL,
    },
    headers: {
      /** The credential below is a sample base64 encoded credential. Replace it with "Authorization: 'Basic ' + Buffer.from(your_app_client_id + ':' + your_app_client_secret).toString('base64')"
       * */
      Authorization:
        'Basic ' +
        Buffer.from(api.CLIENT_ID + ':' + api.CLIENT_SECRET).toString('base64'),
    },
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    console.log(body);
  });
};

const listMeeting = (data) => {
  const { access_token } = data;
  const options = {
    method: 'GET',
    url: 'https://api.zoom.us/v2/users/me/meetings',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    json: true,
  };

  return request(options);
};

const createMeeting = (data, access_token) => {
  const options = {
    method: 'POST',
    url: 'https://api.zoom.us/v2/users/me/meetings',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    body: { ...data },
    json: true,
  };

  return request(options);
};

const removeMeeting = (data) => {
  const { meeting_id, access_token } = data;
  const options = {
    method: 'DELETE',
    url: `https://api.zoom.us/v2/meetings/${meeting_id}`,
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
  };

  return request(options);
};

const refreshToken = (refresh_token) => {
  const options = {
    method: 'POST',
    url: 'https://zoom.us/oauth/token',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          api.ZOOM_CLIENT.ZOOM_CLIENT_ID +
            ':' +
            api.ZOOM_CLIENT.ZOOM_CLIENT_SECRET
        ).toString('base64'),
      'Content-Type': 'application/json',
    },
    qs: {
      grant_type: 'refresh_token',
      refresh_token,
    },
  };

  return new Promise((resolve, reject) => {
    request(options, function (error, response, body) {
      if (error) {
        console.log('zoom refresh token error', error);
        reject(error);
      }

      resolve(JSON.parse(body));
    });
  });
};

const updateRefreshToken = async (user, refresh_token, email) => {
  let auth_client = {};
  await refreshToken(refresh_token)
    .then((response) => {
      auth_client = response;
    })
    .catch((err) => {
      console.log('zoom refresh token err', err);
    });
  if (auth_client && auth_client.refresh_token) {
    // Update the User Garbage
    const newZoomInfo = {
      refresh_token: auth_client.refresh_token,
      email,
    };
    const zoomInfoStr = encryptInfo(newZoomInfo, user);
    Garbage.updateOne({ user }, { $set: { zoom: zoomInfoStr } }).catch(
      (err) => {
        console.log('garbage update err', err.message);
      }
    );
    return auth_client;
  }
};

const createUserMeeting = ({
  user,
  start_time,
  timezone,
  duration,
  topic,
  agenda,
}) => {
  return new Promise((resolve, reject) => {
    Garbage.findOne({ user })
      .then(async (_garbage) => {
        if (_garbage.zoom) {
          const { refresh_token, email } = decryptInfo(_garbage.zoom, user);
          // Generate the new access token and refresh token and save them
          const auth_client = await updateRefreshToken(
            user,
            refresh_token,
            email
          );
          if (!auth_client || !auth_client.refresh_token) {
            reject('zoom token expired');
          }
          const { access_token } = auth_client;
          const meeting = {
            agenda,
            topic,
            duration,
            start_time,
            timezone,
            type: 2,
            // default password, password, schedule_for, template_id
          };
          // create the meeting
          await createMeeting(meeting, access_token)
            .then((_meeting) => {
              resolve(_meeting);
            })
            .catch((err) => {
              reject(err);
            });
        } else {
          reject();
        }
      })
      .catch((err) => {
        reject(err);
      });
  });
};

module.exports = {
  requestAuth,
  refreshToken,
  createMeeting,
  removeMeeting,
  listMeeting,
  createUserMeeting,
};
