const jwt = require('jsonwebtoken');
const request = require('request-promise');
const api = require('../configs/api');
const User = require('../models/user');

const resetCacheOfUcraft = async (userId) => {
  const currentUser = await User.findOne({ _id: userId });

  const max_site_count = currentUser.landing_page_info?.max_count || 1;
  const payload = {
    email: currentUser.email,
    userId: currentUser._id,
    projectID: currentUser._id,
    orgID: api.CONVRRT.ORG_ID,
    MAX_SITES_PER_PROJECT: max_site_count,
  };
  let builder_token;
  try {
    builder_token = jwt.sign(payload, api.API_JWT_SECRET);
  } catch (err) {
    console.log('error', err.message);
  }
  if (!builder_token) {
    return;
  }

  const sites = await request({
    method: 'GET',
    uri: `https://accounts.crmgrow.cloud/api/v1/sites?token=${builder_token}`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  }).catch((err) => {
    console.log('pages get error:', err.message);
  });
  if (!sites || !sites.length) {
    return;
  }

  sites.forEach((site) => {
    request({
      method: 'GET',
      uri: `https://${site.site}/papi/default/helper/clearCache`,
      headers: {
        'Content-Type': 'application/json',
      },
      json: true,
    })
      .then((response) => {
        console.log(response);
      })
      .catch((err) => {
        console.log('pages get error:', err.message);
      });
  });
};

module.exports = { resetCacheOfUcraft };
