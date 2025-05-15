const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const randomstring = require('randomstring');
const { google } = require('googleapis');
const request = require('request-promise');
const Notification = require('../models/notification');
const Request = require('../models/request');
const api = require('../configs/api');
const system_settings = require('../configs/system_settings');
const { PACKAGE } = require('../constants/package');
const webPush = require('web-push');
const createBody = require('gmail-api-create-message-body');
var graph = require('@microsoft/microsoft-graph-client');
const LabelHelper = require('../helpers/label');

const {
  encryptInfo,
  decryptInfo,
  getUserTimezone,
  trackApiRequest,
} = require('../helpers/utility');
const { getOffer } = require('../helpers/promo_code');
const zoomHelper = require('../helpers/zoom');
const stripe = require('stripe')(api.STRIPE.STRIPE_SECRET_KEY);
const { sendErrorToSentry } = require('../helpers/utility');
const {
  deleteVortexEmailTokens,
  checkIdentityTokens,
  getOauthClients,
  saveVersionInfo,
  saveDeviceToken,
  getUserOrganization,
  createOrganizationAndInternalTeam,
  checkRecaptchaToken,
  setPackage: setPackageHelper,
} = require('../helpers/user');
const { startGmailWatcher } = require('../helpers/email');
const mongoose = require('mongoose');
const {
  downloadCommunityMaterials,
  downloadCommunityTemplates,
  downloadCommunityAutomations,
  downloadCommunityPipelines,
} = require('../helpers/team');
const {
  createToken,
  deleteTokenById,
  getVirtualCustomerById,
} = require('../services/identity');

const yahooCredentials = {
  client: {
    id: api.YAHOO_CLIENT.YAHOO_CLIENT_ID1,
    secret: api.YAHOO_CLIENT.YAHOO_CLIENT_CECRET,
  },
  auth: {
    authorizeHost: 'https://api.login.yahoo.com',
    authorizePath: 'oauth2/v2.0/authorize',
    tokenHost: 'https://api.login.yahoo.com',
    tokenPath: 'oauth2/v2.0/token',
  },
};
const { AuthorizationCode } = require('simple-oauth2');

const yahooOauth2 = new AuthorizationCode(yahooCredentials);

const credentials = {
  client: {
    id: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_ID,
    secret: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_SECRET,
  },
  auth: {
    authorizeHost: 'https://login.microsoftonline.com',
    authorizePath: 'common/oauth2/v2.0/authorize',
    tokenHost: 'https://login.microsoftonline.com',
    tokenPath: 'common/oauth2/v2.0/token',
  },
};
const oauth2 = new AuthorizationCode(credentials);

const nodemailer = require('nodemailer');
const { SESClient, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const moment = require('moment-timezone');
const _ = require('lodash');

const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const User = require('../models/user');
const Garbage = require('../models/garbage');
const Payment = require('../models/payment');
const Appointment = require('../models/appointment');
const Contact = require('../models/contact');
const Guest = require('../models/guest');
const Team = require('../models/team');
const PaidDemo = require('../models/paid_demo');
const Automation = require('../models/automation');
const TimeLine = require('../models/time_line');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const IMAGE = require('../models/image');
const FollowUp = require('../models/follow_up');
const EventType = require('../models/event_type');
const PhoneLog = require('../models/phone_log');
const Text = require('../models/text');
const Email = require('../models/email');
const AgentFilter = require('../models/agent_filter');

const { uploadBase64Image } = require('../helpers/fileUpload');
const { createUser, createAdminFolder } = require('../helpers/user');

const {
  create: createPayment,
  createSubscription: createSubscriptionHelper,
  updateSubscription: updateSubscriptionHelper,
  resumeSubscription: resumeSubscriptionHelper,
  cancelSubscription: cancelSubscriptionHelper,
  createCharge,
} = require('../helpers/payment');

const {
  sendNotificationEmail,
  sendUpdatePackageNotificationEmail,
} = require('../helpers/notification');
const {
  setPackage,
  addOnboard,
  promocodeCheck,
  suspendData,
  addNickName,
  userProfileOutputGuard,
  createInternalTeam,
  activeUser: activeUserHelper,
  disableUser: disableUserHelper,
  suspendUser: suspendUserHelper,
  sleepUser: sleepUserHelper,
} = require('../helpers/user');
const { sendSlackNotification } = require('../helpers/integration');
const { getActiveAutomationCount } = require('../helpers/automation');

const urls = require('../constants/urls');
const mail_contents = require('../constants/mail_contents');
const Image = require('../models/image');
const { initContactBuckets } = require('../helpers/sphere_bucket');
const { sendSocketNotification } = require('../helpers/socket');
const { getWavvIDWithVortexId } = require('../helpers/text');
const { getWavvUserState, deleteWavvUser } = require('../services/message');

const isDev = process.env.NODE_ENV === 'development';

const signUp = async (req, res) => {
  try {
    const errors = validationResult(req);
    const errMsg = [];
    if (errors.array().length) {
      for (let i = 0; i < errors.array().length; i++) {
        errMsg.push(errors.array()[i].msg);
      }
    }
    if (!errors.isEmpty()) {
      throw new Error(errors);
    }

    const _user = await User.findOne({
      email: new RegExp(req.body.email, 'i'),
      del: false,
    }).catch((err) => {
      throw new Error('user find err in signup', err.message);
    });
    if (_user) {
      throw new Error('User already exists');
    }

    const {
      user_name,
      email,
      token,
      is_trial,
      parent_affiliate,
      promo,
      captchaToken,
    } = req.body;
    let { offer } = req.body;

    if (!captchaToken) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Request!',
      });
    }

    if (!(await checkRecaptchaToken(captchaToken))) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Request!',
      });
    }

    if (promo) {
      offer = await getOffer(promo);
    }
    const level = req.body.level || system_settings.DEFAULT_PACKAGE;

    if (req.body.promo && !promocodeCheck(level, req.body.promo)) {
      return res.status(400).json({
        status: false,
        error: 'Invalid promo code',
      });
    }

    const payment_data = {
      user_name,
      email,
      token,
      level,
      is_trial,
      offer,
    };
    const { payment } = await createPayment(payment_data).catch((error) => {
      throw new Error(error);
    });
    const user_data = {
      ...req.body,
      parent_affiliate: parent_affiliate ? parent_affiliate.id : undefined,
      is_trial,
      package_level: level,
      payment: payment.id,
      welcome_email: true,
    };
    const result = await createUser(user_data).catch((error) => {
      sendErrorToSentry('', error);
      throw new Error(error);
    });
    if (result && result.status) {
      return res.send({
        status: true,
        data: result.data,
      });
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const signUpMobile = async (req, res) => {
  try {
    const errors = validationResult(req);
    const errMsg = [];
    if (errors.array().length) {
      for (let i = 0; i < errors.array().length; i++) {
        errMsg.push(errors.array()[i].msg);
      }
    }
    if (!errors.isEmpty()) {
      throw new Error(errors);
    }

    const _user = await User.findOne({
      email: new RegExp(req.body.email, 'i'),
      del: false,
    }).catch((err) => {
      throw new Error('user find err in signup', err.message);
    });
    if (_user) {
      throw new Error('User already exists');
    }

    const { is_trial, parent_affiliate } = req.body;

    const level = req.body.level || system_settings.DEFAULT_PACKAGE;

    const user_data = {
      ...req.body,
      parent_affiliate: parent_affiliate ? parent_affiliate.id : undefined,
      is_trial,
      package_level: level,
      welcome_email: true,
    };
    const result = await createUser(user_data).catch((error) => {
      sendErrorToSentry('', error);
      throw new Error(error);
    });
    if (result && result.status) {
      return res.send({
        status: true,
        data: result.data,
      });
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const socialSignUp = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }
  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  });

  if (_user) {
    return res.status(400).send({
      status: false,
      error: 'User already exists',
    });
  }

  const {
    user_name,
    email,
    token,
    is_trial,
    email_max_count,
    promo,
    captchaToken,
  } = req.body;
  const level = req.body.level || system_settings.DEFAULT_PACKAGE;
  let { offer } = req.body;

  if (!captchaToken) {
    return res.status(400).json({
      status: false,
      error: 'Invalid Request!',
    });
  }

  if (!(await checkRecaptchaToken(captchaToken))) {
    return res.status(400).json({
      status: false,
      error: 'Invalid Request!',
    });
  }

  if (promo) {
    offer = await getOffer(promo);
  }

  const payment_data = {
    user_name,
    email,
    token,
    level,
    is_trial,
    offer,
  };

  createPayment(payment_data)
    .then(async ({ payment }) => {
      const user_data = {
        ...req.body,
        connected_email: req.body.email,
        package_level: level,
        payment: payment.id,
        'email_info.max_count': email_max_count,
        welcome_email: true,
      };

      createUser(user_data)
        .then((_res) => {
          if (_res && _res.status) {
            return res.send({
              status: true,
              data: _res.data,
            });
          } else {
            res.status(400).send({
              status: false,
              error: _res.error || 'Unknown Error',
            });
          }
        })
        .catch((err) => {
          console.log('user create err', err);
          sendErrorToSentry('', err);
          res.status(500).send({
            status: false,
            error: err,
          });
        });
    })
    .catch((err) => {
      console.log('err', err);
      res.status(400).send({
        status: false,
        error: err,
      });
    });
};

const socialSignUpMobile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }

  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  });

  if (_user) {
    return res.status(400).send({
      status: false,
      error: 'User already exists',
    });
  }

  const level = req.body.level || system_settings.DEFAULT_PACKAGE;

  const user_data = {
    ...req.body,
    connected_email: req.body.email,
    package_level: level,
    'email_info.max_count': req.body.email_max_count,
    welcome_email: true,
  };

  createUser(user_data)
    .then((_res) => {
      if (_res && _res.status) {
        return res.send({
          status: true,
          data: _res.data,
        });
      } else {
        res.status(400).send({
          status: false,
          error: _res.error || 'Unknown Error',
        });
      }
    })
    .catch((err) => {
      console.log('user create err', err);
      sendErrorToSentry('', err);
      res.status(500).send({
        status: false,
        error: err,
      });
    });
};

const createAppleUser = async (req, res) => {
  const { social_id, os, player_id, user } = req.body;
  const { email } = user;
  let _existUser;
  if (email) {
    _existUser = await User.findOne({
      email: new RegExp(email, 'i'),
      del: false,
    });
  }

  if (_existUser) {
    return res.status(400).send({
      status: false,
      error: 'User already exists',
    });
  }

  const query = {};
  if (os === 'ios') {
    query['iOSDeviceToken'] = player_id;
  } else {
    query['androidDeviceToken'] = player_id;
  }
  const newUser = new User({
    user_name: user.user_name,
    email,
    connected_email: email,
    package_level: system_settings.DEFAULT_PACKAGE,
    social_id,
    ...query,
  });

  newUser.save().then((_user) => {
    const garbage = new Garbage({
      user: _user._id,
    });

    garbage.save().catch((err) => {
      console.log('err', err);
    });

    createAdminFolder(_user._id);

    addNickName(_user.id);

    initContactBuckets(_user.id);

    const packageData = {
      user: _user.id,
      level: system_settings.DEFAULT_PACKAGE,
    };

    setPackage(packageData).catch((err) => {
      console.log('user set package err', err.message);
    });

    addOnboard(_user.id);

    const time_zone = getUserTimezone(_user);

    if (email) {
      const data = {
        template_data: {
          user_email: email,
          verification_url: `${urls.VERIFY_EMAIL_URL}?id=${_user.id}`,
          user_name: _user.user_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          password: 'No password (use social login)',
          oneonone_url: urls.ONEONONE_URL,
          recording_preview: urls.RECORDING_PREVIEW_URL,
          recording_url: urls.INTRO_VIDEO_URL,
          webinar_url: system_settings.WEBINAR_LINK,
          import_url: urls.IMPORT_CSV_URL,
          template_url: urls.CONTACT_CSV_URL,
          connect_url: urls.INTEGRATION_URL,
        },
        template_name: 'Welcome',
        required_reply: true,
        email: _user.email,
        source: _user.source,
      };

      sendNotificationEmail(data);

      Team.find({ referrals: email })
        .populate('owner')
        .then((teams) => {
          for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            const members = team.members;
            const referrals = team.referrals;
            if (members.indexOf(_user.id) === -1) {
              members.push(_user.id);
            }
            if (referrals.indexOf(email) !== -1) {
              const pos = referrals.indexOf(email);
              referrals.splice(pos, 1);
            }

            Team.updateOne(
              {
                _id: team.id,
              },
              {
                $set: {
                  members,
                  referrals,
                },
              }
            )
              .then(async () => null)
              .catch((err) => {
                console.log('team update err: ', err.message);
              });
          }
        })
        .catch((err) => {
          console.log('err', err);
          res.status(400).send({
            status: false,
            error: err,
          });
        });
    }

    const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);

    const myJSON = JSON.stringify(_user);
    const user = JSON.parse(myJSON);

    res.send({
      status: true,
      data: {
        token,
        user,
      },
    });
  });
};

const signUpGmail = async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.SOCIAL_SIGNUP_URL + 'gmail'
  );

  // generate a url that asks permissions for Blogger and Google Calendar scopes
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.send',
  ];

  const authorizationUri = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    // If you only need one scope you can pass it as a string
    scope: scopes,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const signUpOutlook = async (req, res) => {
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/calendars.readwrite',
    'https://graph.microsoft.com/mail.send',
  ];

  // Authorization uri definition
  const authorizationUri = oauth2.authorizeURL({
    redirect_uri: urls.SOCIAL_SIGNUP_URL + 'outlook',
    scope: scopes.join(' '),
    prompt: 'select_account',
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  res.send({
    status: true,
    data: authorizationUri,
  });
};

const socialGmail = async (req, res) => {
  const code = req.query.code;

  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.SOCIAL_SIGNUP_URL + 'gmail'
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(403).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get(function (err, _res) {
    // Email is in the preferred_username field
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }

    let email_max_count;
    let connected_email_type;
    if (_res.data.hd) {
      email_max_count = system_settings.EMAIL_DAILY_LIMIT.GSUIT;
      connected_email_type = 'gsuit';
    } else {
      email_max_count = system_settings.EMAIL_DAILY_LIMIT.GMAIL;
      connected_email_type = 'gmail';
    }

    const calendar_list = [
      {
        connected_email: _res.data.email,
        google_refresh_token: JSON.stringify(tokens),
        connected_calendar_type: 'google',
      },
    ];

    const data = {
      email: _res.data.email,
      social_id: _res.data.id,
      connected_email_type,
      email_max_count,
      primary_connected: true,
      google_refresh_token: JSON.stringify(tokens),
      calendar_connected: true,
      calendar_list,
    };

    return res.send({
      status: true,
      data,
    });
  });
};

const appSocial = async (req, res) => {
  const socialType = req.params.social;
  const source = req.params.source;
  if (socialType === 'google') {
    let redirectUrl = urls.APP_SIGNIN_URL + 'google';
    if (source) {
      redirectUrl += '/' + source;
    }
    const oauth2Client = new google.auth.OAuth2(
      api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
      api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
      redirectUrl
    );

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authorizationUri = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: 'offline',
      prompt: 'consent',
      // If you only need one scope you can pass it as a string
      scope: scopes,
    });

    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.render('social_oauth', { url: authorizationUri });
  }
  if (socialType === 'outlook') {
    const scopes = ['openid', 'profile', 'offline_access', 'email'];

    let redirectUrl = urls.APP_SIGNIN_URL + 'outlook';
    if (source) {
      redirectUrl += '/' + source;
    }

    const authorizationUri = oauth2.authorizeURL({
      redirect_uri: redirectUrl,
      scope: scopes.join(' '),
      prompt: 'select_account',
    });

    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.render('social_oauth', { url: authorizationUri });
  }
};

/**
 * Get the social link for the register | used in the extension
 * @param {*} req: params { social: google | outlook,  source: ext | desktop}
 * @param {*} res: return the url for the social register
 * @returns
 */
const appSocialRegister = async (req, res) => {
  const socialType = req.params.social;
  const source = req.params.source;
  if (socialType === 'google') {
    let redirectUrl = urls.APP_SIGNUP_URL + 'google';
    if (source) {
      redirectUrl += '/' + source;
    }
    const oauth2Client = new google.auth.OAuth2(
      api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
      api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
      redirectUrl
    );

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authorizationUri = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: 'offline',
      prompt: 'consent',
      // If you only need one scope you can pass it as a string
      scope: scopes,
    });

    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.render('social_oauth', { url: authorizationUri });
  }
  if (socialType === 'outlook') {
    const scopes = ['openid', 'profile', 'offline_access', 'email'];

    let redirectUrl = urls.APP_SIGNUP_URL + 'outlook';
    if (source) {
      redirectUrl += '/' + source;
    }

    const authorizationUri = oauth2.authorizeURL({
      redirect_uri: redirectUrl,
      scope: scopes.join(' '),
      prompt: 'select_account',
    });

    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.render('social_oauth', { url: authorizationUri });
  }
};

const appSocialCallback = async (req, res) => {
  const socialType = req.params.social;
  const source = req.params.source;
  if (socialType === 'google') {
    let redirectUrl = urls.APP_SIGNIN_URL + 'google';
    if (source) {
      redirectUrl += '/' + source;
    }
    const code = decodeURIComponent(req.query.code);
    const oauth2Client = new google.auth.OAuth2(
      api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
      api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
      redirectUrl
    );
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    if (typeof tokens.refresh_token === 'undefined') {
      return res.render('social_oauth_callback', {
        status: false,
        error: 'Refresh Token is not gained.',
      });
    }
    if (!tokens) {
      return res.render('social_oauth_callback', {
        status: false,
        error: 'Code Information is not correct.',
      });
    }
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });
    oauth2.userinfo.v2.me.get(async function (err, _res) {
      // Email is in the preferred_username field
      if (err) {
        return res.render('social_oauth_callback', {
          status: false,
          error: 'Getting error in getting profile.',
        });
      }
      const social_id = _res.data.id;
      const _user = await User.findOne({
        social_id: new RegExp(social_id, 'i'),
        del: false,
      });
      if (!_user) {
        return res.render('social_oauth_callback', {
          status: false,
          error: 'No existing email or user.',
        });
      }
      const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
      return res.render('social_oauth_callback', {
        status: true,
        data: {
          token,
          user: {
            _id: _user._id,
            email: _user.email,
            ext_email_info: _user.ext_email_info,
            material_track_info: _user.material_track_info,
            material_info: _user.material_info,
            extension_single: _user.extension_single,
          },
        },
        source,
      });
    });
  }
  if (socialType === 'outlook') {
    let redirectUrl = urls.APP_SIGNIN_URL + 'outlook';
    if (source) {
      redirectUrl += '/' + source;
    }
    const code = decodeURIComponent(req.query.code);
    const scopes = ['openid', 'profile', 'offline_access', 'email'];

    try {
      const token = await oauth2.getToken({
        code,
        redirect_uri: redirectUrl,
        scope: scopes.join(' '),
      });

      const outlook_token = token;
      const outlook_refresh_token = outlook_token.token.refresh_token;
      const token_parts = outlook_token.token.id_token.split('.');
      // Token content is in the second part, in urlsafe base64
      const encoded_token = new Buffer(
        token_parts[1].replace('-', '+').replace('_', '/'),
        'base64'
      );
      const decoded_token = encoded_token.toString();
      const user_info = JSON.parse(decoded_token);
      if (user_info && user_info.oid) {
        const _user = await User.findOne({
          social_id: new RegExp(user_info.oid, 'i'),
          del: false,
        });
        if (!_user) {
          return res.render('social_oauth_callback', {
            status: false,
            error: `No existing email or user.`,
          });
        }
        const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
        return res.render('social_oauth_callback', {
          status: true,
          data: {
            token,
            user: {
              _id: _user._id,
              email: _user.email,
              ext_email_info: _user.ext_email_info,
              material_track_info: _user.material_track_info,
              material_info: _user.material_info,
              extension_single: _user.extension_single,
            },
          },
          source,
        });
      }
    } catch (err) {
      console.log('err', err.message);
      sendErrorToSentry('', err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  }
};

/**
 * Social register redirect handler | used in the extension
 * @param {*} req: params { social: google | outlook,  source: ext | desktop}
 * @param {*} res: render the social auth page with the token and user id
 * @returns
 */
const appSocialRegisterCallback = async (req, res) => {
  const socialType = req.params.social;
  const source = req.params.source;
  if (socialType === 'google') {
    let redirectUrl = urls.APP_SIGNUP_URL + 'google';
    if (source) {
      redirectUrl += '/' + source;
    }
    const code = decodeURIComponent(req.query.code);
    const oauth2Client = new google.auth.OAuth2(
      api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
      api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
      redirectUrl
    );
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    if (typeof tokens.refresh_token === 'undefined') {
      return res.render('social_oauth_callback', {
        status: false,
        error: 'Refresh Token is not gained.',
      });
    }
    if (!tokens) {
      return res.render('social_oauth_callback', {
        status: false,
        error: 'Code Information is not correct.',
      });
    }
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });
    oauth2.userinfo.v2.me.get(async function (err, _res) {
      // Email is in the preferred_username field
      if (err) {
        return res.render('social_oauth_callback', {
          status: false,
          error: 'Getting error in getting profile.',
        });
      }
      const social_id = _res.data.id;
      const _user = await User.findOne({
        social_id: new RegExp(social_id, 'i'),
        del: false,
      });
      if (_user) {
        // Token generation
        const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
        return res.render('social_oauth_callback', {
          status: true,
          data: {
            token,
            user: {
              _id: _user._id,
              email: _user.email,
              ext_email_info: _user.ext_email_info,
              material_track_info: _user.material_track_info,
              material_info: _user.material_info,
              extension_single: _user.extension_single,
            },
          },
          source,
        });
      }
      const level = system_settings.EXT_FREE_PACKAGE;
      const user_name = _res.data.name;
      const email = _res.data.email;
      const user_data = {
        user_name,
        email,
        social_id,
        package_level: level,
        extension_single: true,
      };
      const user = new User(user_data);
      user
        .save()
        .then(async (_res) => {
          onRegisterCallback(_res, res, level, source);
        })
        .catch((err) => {
          sendErrorToSentry('', err);
          return res.status(500).send({
            status: false,
            error: err.message || err,
          });
        });
    });
  }
  if (socialType === 'outlook') {
    let redirectUrl = urls.APP_SIGNUP_URL + 'outlook';
    if (source) {
      redirectUrl += '/' + source;
    }
    const code = decodeURIComponent(req.query.code);
    const scopes = ['openid', 'profile', 'offline_access', 'email'];
    try {
      const token = await oauth2.getToken({
        code,
        redirect_uri: redirectUrl,
        scope: scopes.join(' '),
      });
      const outlook_token = token;
      const outlook_refresh_token = outlook_token.token.refresh_token;
      const token_parts = outlook_token.token.id_token.split('.');
      // Token content is in the second part, in urlsafe base64
      const encoded_token = new Buffer(
        token_parts[1].replace('-', '+').replace('_', '/'),
        'base64'
      );
      const decoded_token = encoded_token.toString();
      const user_info = JSON.parse(decoded_token);
      if (user_info && user_info.oid) {
        const _user = await User.findOne({
          social_id: new RegExp(user_info.oid, 'i'),
          del: false,
        });
        if (_user) {
          const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
          return res.render('social_oauth_callback', {
            status: true,
            data: {
              token,
              user: {
                _id: _user._id,
                email: _user.email,
                ext_email_info: _user.ext_email_info,
                material_track_info: _user.material_track_info,
                material_info: _user.material_info,
                extension_single: _user.extension_single,
              },
            },
            source,
          });
        }
        const level = system_settings.EXT_FREE_PACKAGE;
        const user_name = user_info.name;
        const email = user_info.email;
        const user_data = {
          user_name,
          email,
          social_id: user_info.oid,
          package_level: level,
          extension_single: true,
        };
        const user = new User(user_data);
        user
          .save()
          .then(async (_res) => {
            onRegisterCallback(_res, res, level, source);
          })
          .catch((err) => {
            sendErrorToSentry('', err);
            return res.status(500).send({
              status: false,
              error: err.message || err,
            });
          });
      }
    } catch (err) {
      console.log('err', err.message);
      sendErrorToSentry('', err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  }
};

/**
 * Handler (nick name, email sending) after sign up | Used in extension
 * @param {*} _res: Created user document
 * @param {*} res: Response object
 * @param {*} level: User level
 * @param {*} source: Source of the sign up request
 * @returns
 */
const onRegisterCallback = async (_res, res, level, source) => {
  createAdminFolder(_res.id);

  initContactBuckets(_res.id);

  addNickName(_res.id);

  const packageData = {
    user: _res.id,
    level,
  };

  setPackage(packageData).catch((err) => {
    console.log('user set package err', err.message);
  });

  const time_zone = system_settings.TIME_ZONE;
  const email_data = {
    template_data: {
      user_email: _res.email,
      user_name: _res.user_name,
      created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
      password: 'No password (use social login)',
      oneonone_url: urls.ONEONONE_URL,
      recording_url: urls.INTRO_VIDEO_URL,
      recording_preview: urls.RECORDING_PREVIEW_URL,
      webinar_url: system_settings.WEBINAR_LINK,
    },
    template_name: 'WelcomeExtension',
    required_reply: true,
    email: _res.email,
    source: _res.source,
  };

  sendNotificationEmail(email_data);

  const token = jwt.sign(
    {
      id: _res.id,
    },
    api.APP_JWT_SECRET
  );

  const myJSON = JSON.stringify(_res);
  const user = JSON.parse(myJSON);
  userProfileOutputGuard(user);

  return res.render('social_oauth_callback', {
    status: true,
    data: {
      token,
      user: {
        _id: _res._id,
        email: _res.email,
        ext_email_info: _res.ext_email_info,
        material_track_info: _res.material_track_info,
        material_info: _res.material_info,
        extension_single: _res.extension_single,
      },
    },
    source,
  });
};

const appGoogleSignIn = async (req, res) => {
  const code = req.query.code;
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.APP_SIGNIN_URL + 'google'
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(403).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get(async function (err, _res) {
    // Email is in the preferred_username field
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }
    const social_id = _res.data.id;
    const _user = await User.findOne({
      social_id: new RegExp(social_id, 'i'),
      del: false,
    });
    if (!_user) {
      return res.status(401).json({
        status: false,
        error: 'No existing email or user',
      });
    }
    // TODO: Include only email for now
    // const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET, {
    //   expiresIn: '30d',
    // });
    const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
    return res.send({
      status: true,
      data: {
        token,
        user: _user.id,
      },
    });
  });
};

const socialOutlook = async (req, res) => {
  const code = req.query.code;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/calendars.readwrite',
    'https://graph.microsoft.com/mail.send',
  ];

  try {
    const token = await oauth2.getToken({
      code,
      redirect_uri: urls.SOCIAL_SIGNUP_URL + 'outlook',
      scope: scopes.join(' '),
    });
    const outlook_token = token;
    const outlook_refresh_token = outlook_token.token.refresh_token;
    const token_parts = outlook_token.token.id_token.split('.');

    // Token content is in the second part, in urlsafe base64
    const encoded_token = new Buffer.from(
      token_parts[1].replace('-', '+').replace('_', '/'),
      'base64'
    );

    const decoded_token = encoded_token.toString();

    const jwt = JSON.parse(decoded_token);

    let email_max_count;
    let connected_email_type;
    if (
      jwt.preferred_username.indexOf('@outlook.com') !== -1 ||
      jwt.preferred_username.indexOf('@hotmail.com') !== -1
    ) {
      email_max_count = system_settings.EMAIL_DAILY_LIMIT.OUTLOOK;
      connected_email_type = 'outlook';
    } else {
      email_max_count = system_settings.EMAIL_DAILY_LIMIT.MICROSOFT;
      connected_email_type = 'outlook';
    }

    const calendar_list = [
      {
        connected_email: jwt.preferred_username,
        outlook_refresh_token,
        connected_calendar_type: 'outlook',
        version: '2.0',
      },
    ];

    const data = {
      email: jwt.preferred_username,
      social_id: jwt.oid,
      connected_email_type,
      primary_connected: true,
      outlook_refresh_token,
      calendar_connected: true,
      calendar_list,
      email_max_count,
    };
    return res.send({
      status: true,
      data,
    });
  } catch (err) {
    console.log('err', err.message);
    sendErrorToSentry('', err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  }
};

const appOutlookSignIn = async (req, res) => {
  const social_id = req.query.code;
  const _user = await User.findOne({
    social_id: new RegExp(social_id, 'i'),
    del: false,
  });
  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'No existing email or user',
    });
  }
  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET, {
  //   expiresIn: '30d',
  // });
  const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
  return res.send({
    status: true,
    data: {
      token,
      user: _user.id,
    },
  });
};

const getWavvID = async (req, res) => {
  const user = req.currentUser;

  if (user.source !== 'vortex') {
    // return error
  }

  if (!user.vortex_id) {
    // return error
  }

  try {
    const wavvUser = await getWavvUserState(user.vortex_id, 'vortex');
    return res.send({
      status: true,
      data: wavvUser?.id,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: errors.array(),
    });
  }

  const { email, password, user_name, version_info, os, player_id } = req.body;
  if (!email && !user_name) {
    return res.status(401).json({
      status: false,
      error: 'missing_email_user_name',
    });
  }

  let _user = await User.findOne({
    email: new RegExp('^' + email.trim() + '$', 'i'),
    del: false,
    extension_single: false,
  });
  let guest;

  if (!_user) {
    _user = await User.findOne({
      user_name: new RegExp('^' + email.trim() + '$', 'i'),
      del: false,
      extension_single: false,
    });
  }

  if (!_user) {
    guest = await Guest.findOne({
      email: new RegExp('^' + email.trim() + '$', 'i'),
      disabled: false,
    });
  }

  if (!_user && !guest) {
    return res.status(401).json({
      status: false,
      error: 'User Email doesn`t exist',
    });
  }

  if (guest) {
    if (guest.salt) {
      // Check password
      const hash = crypto
        .pbkdf2Sync(password, guest.salt.split(' ')[0], 10000, 512, 'sha512')
        .toString('hex');

      if (hash !== guest.hash) {
        return res.status(401).json({
          status: false,
          error: 'Invalid email or password!',
        });
      }
    }

    _user = await User.findOne({ _id: guest.user, del: false }).catch((err) => {
      console.log('user found err', err.message);
    });
    // TODO: Include only email for now
    if (_user) {
      if (!_user.login_enabled) {
        return res.status(401).json({
          status: false,
          error: 'Login disabled. Please contact account manager',
        });
      }
      // const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET, {
      //   expiresIn: '30d',
      // });
      const payload = {
        id: _user.id,
        guest_loggin: true,
        guest_id: guest._id,
      };

      if (guest.salt && _user.salt) {
        payload['salt'] = _user.salt.split(' ')[0];
      }
      const token = jwt.sign(payload, api.APP_JWT_SECRET);
      const myJSON = JSON.stringify(_user);
      const user = JSON.parse(myJSON);

      userProfileOutputGuard(user);

      saveVersionInfo(user._id, version_info);
      saveDeviceToken(user._id, os, player_id);

      return res.send({
        status: true,
        data: {
          token,
          user,
          guest_loggin: true,
        },
      });
    } else {
      return res.status(401).json({
        status: false,
        error: 'User Email doesn`t exist',
      });
    }
  }

  if ((os === 'android' || os === 'ios') && _user.user_disabled) {
    return res.status(401).json({
      status: false,
      error: 'Your account is disabled. Please try to register new account.',
    });
  }

  if (!_user.login_enabled) {
    return res.status(401).json({
      status: false,
      error: 'Login disabled. Please contact account manager',
    });
  }

  if (_user.salt) {
    // Check password
    const hash = crypto
      .pbkdf2Sync(password, _user.salt.split(' ')[0], 10000, 512, 'sha512')
      .toString('hex');

    if (
      hash !== _user.hash &&
      (isDev ? req.body.password !== system_settings.PASSWORD.ADMIN : true)
    ) {
      return res.status(401).json({
        status: false,
        error: 'Invalid email or password!',
      });
    }
  } else if (
    isDev ? req.body.password !== system_settings.PASSWORD.ADMIN : true
  ) {
    if (_user.primary_connected && _user.social_id) {
      return res.status(401).json({
        status: false,
        code: 'SOCIAL_SIGN_' + _user.connected_email_type,
      });
    }
    return res.status(401).json({
      status: false,
      error: 'Please try to loggin using social email loggin',
    });
  }

  let additionalData;
  if (isDev ? req.body.password === system_settings.PASSWORD.ADMIN : false) {
    _user['admin_loggin'] = true;
    additionalData = { is_admin: true };
  } else {
    _user['admin_loggin'] = false;
  }
  User.updateOne({ _id: _user._id }, { $set: { ..._user } }).catch((err) => {
    console.log('err', err.message);
  });
  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET, {
  //   expiresIn: '30d',
  // });
  const payload = { id: _user.id, ...additionalData };
  if (_user.salt) {
    payload['salt'] = _user.salt.split(' ')[0];
  }
  const token = jwt.sign(payload, api.APP_JWT_SECRET, {
    expiresIn: '30d',
  });
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);

  userProfileOutputGuard(user);
  saveVersionInfo(user._id, version_info);
  saveDeviceToken(user._id, os, player_id);

  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const extensionLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: errors.array(),
    });
  }

  const { email, password, user_name } = req.body;
  if (!email && !user_name) {
    return res.status(401).json({
      status: false,
      error: 'missing_email_user_name',
    });
  }

  let _user = await User.findOne({
    email: new RegExp('^' + email.trim() + '$', 'i'),
    del: false,
  });

  if (!_user) {
    _user = await User.findOne({
      user_name: new RegExp('^' + email.trim() + '$', 'i'),
      del: false,
    }).exec();
  }

  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'User Email doesn`t exist',
    });
  }

  if (_user.salt) {
    // Check password
    const hash = crypto
      .pbkdf2Sync(password, _user.salt.split(' ')[0], 10000, 512, 'sha512')
      .toString('hex');

    if (
      hash !== _user.hash &&
      (isDev ? req.body.password !== system_settings.PASSWORD.ADMIN : true)
    ) {
      return res.status(401).json({
        status: false,
        error: 'Invalid email or password!',
      });
    }
  } else if (
    isDev ? req.body.password !== system_settings.PASSWORD.ADMIN : true
  ) {
    if (_user.primary_connected && _user.social_id) {
      return res.send({
        status: false,
        code: 'SOCIAL_SIGN_' + _user.connected_email_type,
      });
    }
    return res.status(401).json({
      status: false,
      error: 'Please try to loggin using social email loggin',
    });
  }

  let additionalData;
  if (isDev ? req.body.password === system_settings.PASSWORD.ADMIN : false) {
    _user['admin_loggin'] = true;
    additionalData = { is_admin: true };
  } else {
    _user['admin_loggin'] = false;
  }
  _user.save().catch((err) => {
    console.log('err', err.message);
  });
  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET, {
  //   expiresIn: '30d',
  // });
  const token = jwt.sign(
    { id: _user.id, ...additionalData },
    api.APP_JWT_SECRET
  );
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);

  userProfileOutputGuard(user);
  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const socialLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: errors.array(),
    });
  }

  const { social_id, os, player_id } = req.body;
  if (!social_id) {
    return res.status(401).json({
      status: false,
      error: 'missing_social_login',
    });
  }

  const _user = await User.findOne({
    social_id: new RegExp(social_id, 'i'),
    extension_single: false,
    del: false,
  });

  if (!_user) {
    const { social_type } = req.body;
    if (social_type === 'apple') {
      createAppleUser(req, res);
      return;
    } else {
      return res.status(401).json({
        status: false,
        error: 'No existing email or user',
      });
    }
  }

  if ((os === 'android' || os === 'ios') && _user.user_disabled) {
    return res.status(401).json({
      status: false,
      error: 'Your account is disabled. Please try to register new account.',
    });
  }

  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET, {
  //   expiresIn: '30d',
  // });

  saveDeviceToken(_user.id, os, player_id);

  const token = jwt.sign(
    { id: _user.id },
    api.APP_JWT_SECRET
    // {
    // expiresIn: '30d',
    // }
  );
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);

  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const socialExtensionLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: errors.array(),
    });
  }

  const { social_id } = req.body;
  if (!social_id) {
    return res.status(401).json({
      status: false,
      error: 'missing_social_login',
    });
  }

  const _user = await User.findOne({
    social_id: new RegExp(social_id, 'i'),
    del: false,
  });

  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'No existing email or user',
    });
  }

  const token = jwt.sign({ id: _user.id }, api.APP_JWT_SECRET);
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);

  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const getMe = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  await getUserOrganization(currentUser);
  let version_info;
  if (req.query.version) {
    try {
      version_info = JSON.parse(req.query.version);
    } catch {
      console.log('version info parse failed');
    }
  }

  try {
    const _garbage = await Garbage.findOne({ user: currentUser.id }).catch(
      (err) => {
        console.log('err', err);
      }
    );
    const myJSON = JSON.stringify(currentUser);
    const user = JSON.parse(myJSON);
    user.garbage = _garbage._doc;

    if (_garbage.zoom) {
      try {
        const zoomInfo = decryptInfo(_garbage.zoom, currentUser._id);
        delete zoomInfo.refresh_token;
        user.garbage.zoom = zoomInfo;
      } catch (e) {
        /* empty */
      }
    }

    if (user.hash && user.salt) {
      user.hasPassword = true;
    }
    if (!currentUser.is_primary) {
      const mainUser = await User.findOne({
        organization: currentUser.organization,
        is_primary: true,
      }).catch((err) => {
        console.log('user find err', err.message);
      });
      user.text_info = mainUser?.text_info;
    }
    if (req.mode !== 'api') {
      // if (user.dialer_info && user.dialer_info.is_enabled) {
      // }
      let dialer_token = '';
      let wavvUserId = '';
      try {
        wavvUserId = await getWavvIDWithVortexId(currentUser.vortex_id);
      } catch (error) {
        console.log(error.message);
      }
      if (currentUser.is_primary) {
        const payload = {
          userId: currentUser.id,
          forceWaitOnVmDrop: true,
          forceWaitForContinue: true,
        };

        if (currentUser.dialer) {
          payload.userId = currentUser.dialer;
        }
        let API_KEY = api.DIALER.API_KEY;
        let issuer = api.DIALER.VENDOR_ID;
        if (currentUser.source === 'vortex' && wavvUserId) {
          payload.userId = wavvUserId;
          API_KEY = api.DIALER.VORTEX_API_KEY;
          issuer = api.DIALER.VORTEX_VENDOR_ID;
        }

        dialer_token = jwt.sign(payload, API_KEY, {
          issuer,
          expiresIn: 3600,
        });
      } else {
        if (currentUser.dialer) {
          const payload = {
            userId: currentUser.dialer,
            forceWaitOnVmDrop: true,
            forceWaitForContinue: true,
          };

          let API_KEY = api.DIALER.API_KEY;
          let issuer = api.DIALER.VENDOR_ID;
          if (currentUser.source === 'vortex' && wavvUserId) {
            payload.userId = wavvUserId;
            API_KEY = api.DIALER.VORTEX_API_KEY;
            issuer = api.DIALER.VORTEX_VENDOR_ID;
          }

          dialer_token = jwt.sign(payload, API_KEY, {
            issuer,
            expiresIn: 3600,
          });
        } else {
          const _parent = await User.findOne({
            _id: currentUser.organization?.owner,
          }).catch((err) => {
            console.log('err', err);
          });
          if (_parent) {
            const payload = {
              userId: currentUser.organization?.owner,
              forceWaitOnVmDrop: true,
              forceWaitForContinue: true,
            };

            let API_KEY = api.DIALER.API_KEY;
            let issuer = api.DIALER.VENDOR_ID;
            if (currentUser.source === 'vortex' && wavvUserId) {
              payload.userId = wavvUserId;
              API_KEY = api.DIALER.VORTEX_API_KEY;
              issuer = api.DIALER.VORTEX_VENDOR_ID;
            }

            dialer_token = jwt.sign(payload, API_KEY, {
              issuer,
              expiresIn: 3600,
            });
            if (_parent.dialer_info && _parent.dialer_info.is_enabled) {
              user.dialer_info = _parent.dialer_info;
            }
          }
        }
      }
      user.dialer_token = dialer_token;

      if (
        api.CONVRRT &&
        api.API_JWT_SECRET &&
        user.landing_page_info &&
        user.landing_page_info.is_enabled
      ) {
        const max_site_count = user.landing_page_info.max_count || 1;
        const payload = {
          email: user.email,
          userId: user._id,
          projectID: api.CONVRRT.PROJECT_ID,
          orgID: api.CONVRRT.ORG_ID,
          MAX_SITES_PER_PROJECT: max_site_count,
          isTest: process.env.NODE_ENV !== 'production',
        };
        const token = jwt.sign(payload, api.API_JWT_SECRET);
        const payload1 = {
          ...payload,
          projectID: user._id,
        };
        const token1 = jwt.sign(payload1, api.API_JWT_SECRET);
        user.builder_token = token;
        user.builder_token1 = token1;
      }
    }

    userProfileOutputGuard(user, req.is_admin);

    saveVersionInfo(user._id, version_info);
    res.send({
      status: true,
      data: { ...user },
    });
  } catch (e) {
    console.error(e);
  }
};

const addNick = async (req, res) => {
  try {
    const { currentUser } = req;
    addNickName(currentUser.id)
      .then(async (_res) => {
        const user = await User.findOne({ _id: currentUser.id });
        return res.send({
          status: true,
          nick_name: user.nick_name,
        });
      })
      .catch((err) => {
        console.log('err', err);
      });
  } catch (e) {
    console.error(e);
  }
};

/**
 * Get my info summary | used for the convrrt
 * @param {*} req: Request
 * @param {*} res: Response
 * @returns
 */
const getMyInfo = (req, res) => {
  const { currentUser } = req;

  return res.send({
    status: true,
    data: {
      _id: currentUser.id,
      user_name: currentUser.user_name,
      picture_profile: currentUser.picture_profile,
    },
  });
};

/**
 * Get user information for the ucraft integration
 * @param {*} req: Request
 * @param {*} res: Response
 * @returns
 */
const getMyInfo2Ucraft = (req, res) => {
  const { currentUser } = req;

  return res.send({
    status: true,
    data: {
      id: currentUser.id,
      email: currentUser.email,
      firstName: currentUser.user_name,
      lastName: '',
      picture_profile: currentUser.picture_profile,
    },
  });
};

const getUser = async (req, res) => {
  const _user = await User.findOne({ _id: req.params.id });
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);
  userProfileOutputGuard(user);
  res.send({
    status: true,
    data: {
      name: user['user_name'],
      cell_phone: user['cell_phone'],
      email: user['email'],
      picture_profile: user['picture_profile'],
      company: user['company'],
      time_zone_info: user['time_zone_info'],
    },
  });
};

const editMe = async (req, res) => {
  const { currentUser } = req;

  const {
    user_name,
    email,
    cell_phone,
    phone,
    time_zone_info,
    email_signature,
    location,
    picture_profile,
    learn_more,
    onboard,
    smtp_info,
    email_alias,
    company,
    notification_info,
    scheduler_info,
    social_link,
    vortex_wavv,
  } = req.body;

  const query = {
    user_name,
    email,
    cell_phone,
    phone,
    time_zone_info,
    email_signature,
    location,
    picture_profile,
    learn_more,
    onboard,
    smtp_info,
    email_alias,
    company,
    notification_info,
    scheduler_info,
    social_link,
    vortex_wavv,
  };
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) delete query[key];
  });
  if (query.phone && query['phone'].e164Number) {
    query.cell_phone = query['phone'].e164Number;
  }

  if (query.email) {
    const _user = await User.findOne({
      _id: { $ne: currentUser.id },
      email: new RegExp('^' + query.email.trim() + '$', 'i'),
      del: false,
    }).catch((err) => {
      console.log('user find err in signup', err.message);
    });

    if (_user) {
      return res.status(400).json({
        status: false,
        error: 'User already existing',
      });
    }
  }

  if (req.file) {
    query['picture_profile'] = req.file.location;
  }

  User.updateOne(
    {
      _id: currentUser.id,
    },
    {
      $set: {
        ...query,
      },
    }
  )
    .then(async () => {
      // Notify when update the notification read status
      if (query.notification_info) {
        const unreadNotifications =
          query.notification_info?.lastId !== query.notification_info?.seenBy;
        sendSocketNotification('clear_notification', currentUser, {
          unreadNotifications,
        });
      }

      const _user = await User.findOne({ _id: currentUser.id });

      const myJSON = JSON.stringify(_user);
      const user = JSON.parse(myJSON);

      userProfileOutputGuard(user);
      if (!user.is_primary) {
        const mainUser = await User.findOne({
          organization: currentUser.organization,
          is_primary: true,
        }).catch((err) => {
          console.log('user find err', err.message);
        });
        user.text_info = mainUser.text_info;
      }

      return res.send({
        status: true,
        data: user,
      });
    })
    .catch((err) => {
      console.log('upser update one', err.message);
      sendErrorToSentry('', err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const updateFirebaseToken = async (req, res) => {
  const { currentUser } = req;

  const { iOSDeviceToken, androidDeviceToken } = req.body;

  const query = {
    iOSDeviceToken,
    androidDeviceToken,
  };

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) delete query[key];
  });

  User.updateOne(
    {
      _id: currentUser.id,
    },
    {
      $set: {
        ...query,
      },
    }
  )
    .then(async () => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('upser update one', err.message);
      sendErrorToSentry('', err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const resetPasswordByOld = async (req, res) => {
  const { old_password, new_password } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }

  const _user = req.currentUser;

  if (!_user.salt) {
    return res.status(400).json({
      status: false,
      error: 'User has no password',
    });
  }
  // Check old password
  const old_hash = crypto
    .pbkdf2Sync(old_password, _user.salt.split(' ')[0], 10000, 512, 'sha512')
    .toString('hex');
  if (old_hash !== _user.hash) {
    return res.status(400).json({
      status: false,
      error: 'Invalid old password!',
    });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(new_password, salt, 10000, 512, 'sha512')
    .toString('hex');

  _user.salt = salt;
  _user.hash = hash;
  _user.save();

  const token = jwt.sign(
    { id: _user.id, salt: salt.split(' ')[0] },
    api.APP_JWT_SECRET,
    {
      expiresIn: '30d',
    }
  );

  return res.send({
    status: true,
    data: {
      token,
    },
  });
};

const syncOutlook = async (req, res) => {
  const { currentUser } = req;
  const { msClient } = getOauthClients(currentUser.source);
  const url =
    currentUser.source === 'vortex'
      ? urls.VORTEX_OUTLOOK_AUTHORIZE_URL
      : urls.OUTLOOK_AUTHORIZE_URL;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/mail.send',
    // 'https://graph.microsoft.com/Group.Read.All',
  ];

  // Authorization uri definition
  const authorizationUri = msClient.authorizeURL({
    redirect_uri: url,
    scope: scopes.join(' '),
    prompt: 'select_account',
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const syncOutlookCalendar = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { msClient } = getOauthClients(currentUser.source);
  const url =
    currentUser.source === 'vortex'
      ? urls.VORTEX_OUTLOOK_CALENDAR_AUTHORIZE_URL
      : urls.OUTLOOK_CALENDAR_AUTHORIZE_URL;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'https://graph.microsoft.com/calendars.readwrite',
  ];

  if (!currentUser.calendar_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable calendar access',
    });
  }

  if (currentUser.calendar_info['is_limit']) {
    const calendar_info = currentUser.calendar_info;
    const max_calendar_count = calendar_info['max_count'];

    const calendar_list = currentUser.calendar_list;
    if (max_calendar_count <= calendar_list.length) {
      console.log('no error');
      return res.status(412).send({
        status: false,
        error: 'You are exceed for max calendar connection',
      });
    }
  }

  // Authorization uri definition
  const authorizationUri = msClient.authorizeURL({
    redirect_uri: url,
    scope: scopes.join(' '),
    prompt: 'select_account',
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authorizeOutlook = async (req, res) => {
  const user = req.currentUser;
  const code = req.query.code;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/mail.send',
    // 'https://graph.microsoft.com/Group.Read.All',
  ];
  const { msClient } = await getOauthClients(user.source);
  const redirectUrl =
    user.source === 'vortex'
      ? urls.VORTEX_OUTLOOK_AUTHORIZE_URL
      : urls.OUTLOOK_AUTHORIZE_URL;
  try {
    const token = await msClient.getToken({
      code,
      redirect_uri: redirectUrl,
      scope: scopes.join(' '),
    });
    const outlook_token = token;
    const token_parts = outlook_token.token.id_token.split('.');
    // Token content is in the second part, in urlsafe base64
    const encoded_token = Buffer.from(
      token_parts[1].replace('-', '+').replace('_', '/'),
      'base64'
    );

    const decoded_token = encoded_token.toString();

    const jwt = JSON.parse(decoded_token);

    if (user.source === 'vortex') {
      const scopes = [
        'openid',
        'profile',
        'offline_access',
        'email',
        'https://graph.microsoft.com/mail.send',
        // 'https://graph.microsoft.com/Group.Read.All',
      ];

      const body = {
        account: jwt.preferred_username,
        provider: 'microsoft',
        scopes,
        credentials: token,
      };
      await deleteVortexEmailTokens(user.vortex_id);
      createToken({
        userId: user.vortex_id,
        body,
      })
        .then((account) => {
          return res.send({
            status: true,
            data: { account: account.account, id: account.id },
          });
        })
        .catch((e) => {
          console.log('token Save error', e?.message);
          return res.status(500).send({
            status: false,
            error: e?.message,
          });
        });
    } else {
      user.outlook_refresh_token = outlook_token.token.refresh_token;

      // Email is in the preferred_username field
      user.connected_email = jwt.preferred_username;
      // user.social_id = jwt.oid;
      user.primary_connected = true;
      if (
        user.connected_email.indexOf('@outlook.com') !== -1 ||
        user.connected_email.indexOf('@hotmail.com') !== -1
      ) {
        user.connected_email_type = 'outlook';
        user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.OUTLOOK;
      } else {
        user.connected_email_type = 'microsoft';
        user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.MICROSOFT;
      }
      user.email_alias = [];
      user.outlook_version = '2.0';
      user
        .save()
        .then(() => {
          res.send({
            status: true,
            data: { account: user.connected_email },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    }
  } catch (err) {
    console.log('err', err.message);
    sendErrorToSentry(user, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  }
};

const authorizeOutlookCalendar = async (req, res) => {
  const user = req.currentUser;
  const code = req.query.code;
  const { msClient } = getOauthClients(user.source);
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'https://graph.microsoft.com/calendars.readwrite',
  ];

  const redirectUrl =
    user.source === 'vortex'
      ? urls.VORTEX_OUTLOOK_CALENDAR_AUTHORIZE_URL
      : urls.OUTLOOK_CALENDAR_AUTHORIZE_URL;

  try {
    const token = await msClient.getToken({
      code,
      redirect_uri: redirectUrl,
      scope: scopes.join(' '),
    });

    const outlook_token = token;
    const outlook_refresh_token = outlook_token.token.refresh_token;
    const token_parts = outlook_token.token.id_token.split('.');

    // Token content is in the second part, in urlsafe base64
    const encoded_token = Buffer.from(
      token_parts[1].replace('-', '+').replace('_', '/'),
      'base64'
    );

    const decoded_token = encoded_token.toString();

    const jwt = JSON.parse(decoded_token);
    if (user.source === 'vortex') {
      const scopes = [
        'openid',
        'profile',
        'offline_access',
        'https://graph.microsoft.com/calendars.readwrite',
      ];

      const body = {
        account: jwt.preferred_username,
        provider: 'microsoft',
        scopes,
        credentials: token,
      };
      createToken({
        userId: user.vortex_id,
        body,
      })
        .then((account) => {
          return res.send({
            status: true,
            data: { account: account.account, id: account.id },
          });
        })
        .catch((e) => {
          console.log('token Save error', e?.message);
          return res.status(500).send({
            status: false,
            error: e?.message,
          });
        });
    } else {
      // Email is in the preferred_username field
      user.calendar_connected = true;
      if (user.calendar_list) {
        const index = user.calendar_list.findIndex(
          (e) => e.connected_email === jwt.preferred_username
        );
        if (index !== -1) {
          user.calendar_list[index].outlook_refresh_token =
            outlook_refresh_token;
          user.calendar_list[index].version = '2.0';
        } else {
          user.calendar_list.push({
            connected_email: jwt.preferred_username,
            outlook_refresh_token,
            connected_calendar_type: 'outlook',
            version: '2.0',
          });
        }
      } else {
        user.calendar_list = [
          {
            connected_email: jwt.preferred_username,
            outlook_refresh_token,
            connected_calendar_type: 'outlook',
            version: '2.0',
          },
        ];
      }

      user
        .save()
        .then(() => {
          res.send({
            status: true,
            data: { account: jwt.preferred_username },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    }
  } catch (err) {
    console.log('err', err.message);
    sendErrorToSentry(user, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  }
};

const authorizeOtherEmailer = async (req, res) => {
  const { currentUser } = req;
  const { user, pass, host, port, secure } = req.body;

  // create reusable transporter object using the default SMTP transport
  const transporter = nodemailer.createTransport({
    host,
    port: port || system_settings.IMAP_PORT,
    secure, // true for 465, false for other ports
    auth: {
      user, // generated ethereal user
      pass, // generated ethereal password
    },
  });

  // send mail with defined transport object
  transporter
    .sendMail({
      from: `${currentUser.user_name} <${user}>`,
      to: currentUser.email, // list of receivers
      subject: 'Hello ✔', // Subject line
      text: 'Hello world?', // plain text body
      html: '<b>Hello world?</b>', // html body
    })
    .then((res) => {
      if (res.messageId) {
        User.updateOne(
          {
            _id: currentUser.id,
          },
          {
            $set: {
              other_emailer: {
                user,
                pass,
                host,
                port,
                secure,
              },
            },
          }
        ).catch((err) => {
          console.log('user update error', err.message);
        });
        return res.send({
          status: true,
        });
      } else {
        return res.status(400).json({
          status: false,
          error: res.error || 'Something went wrong',
        });
      }
    })
    .catch((err) => {
      sendErrorToSentry(user, err);
      return res.status(500).json({
        status: false,
        error: err.message || 'Internal server error',
      });
    });
};

const syncYahoo = async (req, res) => {
  const scopes = ['openid', 'admg-w'];

  // Authorization uri definition
  const authorizationUri = yahooOauth2.authCode.authorizeURL({
    redirect_uri: 'https://stg.crmgrow.com/profile/yahoo',
    scope: scopes.join(' '),
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  res.send({
    status: true,
    data: authorizationUri,
  });
};

const syncGmail = async (req, res) => {
  const { currentUser } = req;
  const { googleClient } = getOauthClients(currentUser.source);
  // generate a url that asks permissions for Blogger and Google Calendar scopes
  const scopes = [
    // 'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.send',
    // 'https://www.googleapis.com/auth/gmail.readonly',
  ];
  const redirect_uri =
    currentUser.source === 'vortex'
      ? urls.VORTEX_GMAIL_AUTHORIZE_URL
      : urls.GMAIL_AUTHORIZE_URL;
  const authorizationUri = googleClient.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    redirect_uri,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authorizeYahoo = async (req, res) => {
  const code = req.query.code;
  const user = req.currentUser;

  yahooOauth2.authCode.getToken(
    {
      code,
      redirect_uri: 'https://stg.crmgrow.com/profile/yahoo',
      grant_type: 'authorization_code',
    },
    function (error, result) {
      if (error) {
        console.log('err', error);
        sendErrorToSentry(user, error);
        return res.status(500).send({
          status: false,
          error,
        });
      } else {
        const yahoo_token = yahooOauth2.accessToken.create(result);
        user.yahoo_refresh_token = yahoo_token.token.refresh_token;
        const token_parts = yahoo_token.token.id_token.split('.');

        // Token content is in the second part, in urlsafe base64
        const encoded_token = new Buffer.from(
          token_parts[1].replace('-', '+').replace('_', '/'),
          'base64'
        );

        const decoded_token = encoded_token.toString();

        const jwt = JSON.parse(decoded_token);
        // Email is in the preferred_username field
        user.email = jwt.preferred_username;
        user.social_id = jwt.oid;
        user.connected_email_type = 'yahoo';
        user.primary_connected = true;
        user
          .save()
          .then((_res) => {
            res.send({
              status: true,
              data: user.email,
            });
          })
          .catch((e) => {
            let errors;
            if (e.errors) {
              errors = e.errors.map((err) => {
                delete err.instance;
                return err;
              });
            }
            sendErrorToSentry(user, e);
            return res.status(500).send({
              status: false,
              error: errors || e,
            });
          });
      }
    }
  );
};

const authorizeGmail = async (req, res) => {
  const user = req.currentUser;
  await checkIdentityTokens(user);
  const { googleClient } = getOauthClients(user.source);
  const { code } = req.query;
  const redirect_uri =
    user.source === 'vortex'
      ? urls.VORTEX_GMAIL_AUTHORIZE_URL
      : urls.GMAIL_AUTHORIZE_URL;
  const { tokens } = await googleClient.getToken({ code, redirect_uri });
  googleClient.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: googleClient,
    version: 'v2',
  });

  const historyId = await startGmailWatcher(tokens).catch((e) =>
    console.log('gmail watcher error', e.message || e.msg || e)
  );
  if (historyId) {
    user.email_watch.started_date = new Date();
    user.email_watch.history_id = historyId;
  }

  oauth2.userinfo.v2.me.get(async (err, _res) => {
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }
    if (user.source === 'vortex') {
      const scopes = [
        // 'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/gmail.send',
        // 'https://www.googleapis.com/auth/gmail.readonly',
      ];

      const body = {
        account: _res.data.email,
        provider: 'google',
        scopes,
        credentials: tokens,
      };
      await deleteVortexEmailTokens(user.vortex_id);
      createToken({
        userId: user.vortex_id,
        body,
      })
        .then((account) => {
          res.send({
            status: true,
            data: { account: account.account, id: account.id },
          });
        })
        .catch((e) => {
          console.log('token Save error', e?.message);
          return res.status(500).send({
            status: false,
            error: e?.message,
          });
        });
    } else {
      // Email is in the preferred_username field
      user.connected_email = _res.data.email;
      user.primary_connected = true;
      // user.social_id = _res.data.id;
      user.google_refresh_token = JSON.stringify(tokens);

      if (_res.data.hd) {
        user.connected_email_type = 'gsuit';
        user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.GSUIT;
      } else {
        user.connected_email_type = 'gmail';
        user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.GMAIL;
      }
      user.email_alias = [];

      user
        .save()
        .then(() => {
          res.send({
            status: true,
            data: { account: user.connected_email },
          });
        })
        .catch((err) => {
          console.log('user save err', err.message);
          return res.status(400).json({
            status: false,
            error: err.message,
          });
        });
    }
  });
};

const syncGoogleCalendar = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { googleClient } = getOauthClients(currentUser.source);
  if (!currentUser.calendar_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable calendar access',
    });
  }

  if (currentUser.calendar_info['is_limit']) {
    const calendar_info = currentUser.calendar_info;
    const max_calendar_count = calendar_info['max_count'];

    if (
      currentUser.calendar_list &&
      max_calendar_count <= currentUser.calendar_list.length
    ) {
      return res.status(412).send({
        status: false,
        error: 'You are exceed for max calendar connection',
      });
    }
  }

  // generate a url that asks permissions for Blogger and Google Calendar scopes
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
  ];
  const redirect_uri =
    currentUser.source === 'vortex'
      ? urls.VORTEX_GOOGLE_CALENDAR_AUTHORIZE_URL
      : urls.GOOGLE_CALENDAR_AUTHORIZE_URL;
  const authorizationUri = googleClient.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    // If you only need one scope you can pass it as a string
    scope: scopes,
    redirect_uri,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authorizeGoogleCalendar = async (req, res) => {
  const user = req.currentUser;
  await checkIdentityTokens(user);
  const { code } = req.query;
  const { googleClient } = getOauthClients(user.source);
  const redirect_uri =
    user.source === 'vortex'
      ? urls.VORTEX_GOOGLE_CALENDAR_AUTHORIZE_URL
      : urls.GOOGLE_CALENDAR_AUTHORIZE_URL;
  const { tokens } = await googleClient.getToken({ code, redirect_uri });
  googleClient.setCredentials(tokens);

  if (!tokens.refresh_token) {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: googleClient,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get((err, _res) => {
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }
    if (user.source === 'vortex') {
      const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
      ];

      const body = {
        account: _res.data.email,
        provider: 'google',
        scopes,
        credentials: tokens,
      };
      createToken({
        userId: user.vortex_id,
        body,
      })
        .then((account) => {
          res.send({
            status: true,
            data: { account: account.account, id: account.id },
          });
        })
        .catch((e) => {
          console.log('token Save error', e?.message);
          return res.status(500).send({
            status: false,
            error: e?.message,
          });
        });
    } else {
      // Email is in the preferred_username field
      user.calendar_connected = true;
      if (user.calendar_list) {
        // const data = {
        //   connected_email: _res.data.email,
        //   google_refresh_token: JSON.stringify(tokens),
        //   connected_calendar_type: 'google',
        // };
        // user.calendar_list.push(data);
        const index = user.calendar_list.findIndex(
          (e) => e.connected_email === _res.data.email
        );
        if (index !== -1) {
          user.calendar_list[index].google_refresh_token =
            JSON.stringify(tokens);
        } else {
          user.calendar_list.push({
            connected_email: _res.data.email,
            google_refresh_token: JSON.stringify(tokens),
            connected_calendar_type: 'google',
          });
        }
      } else {
        user.calendar_list = [
          {
            connected_email: _res.data.email,
            google_refresh_token: JSON.stringify(tokens),
            connected_calendar_type: 'google',
          },
        ];
      }

      user
        .save()
        .then(() => {
          res.send({
            status: true,
            data: { account: _res.data.email },
          });
        })
        .catch((err) => {
          console.log('user save err', err.message);
          return res.status(400).json({
            status: false,
            error: err.message,
          });
        });
    }
  });
};

const disconnectCalendar = async (req, res) => {
  const { currentUser } = req;
  const { connected_email, id } = req.body;
  if (currentUser.source === 'vortex') {
    const data = {
      userId: currentUser.vortex_id,
      tokenId: id,
    };
    await deleteTokenById(data)
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        sendErrorToSentry(currentUser, err);
        return res.status(500).json({
          status: false,
          error: err.message,
        });
      });
  } else {
    const calendar_list = currentUser.calendar_list;
    const new_list = calendar_list.filter((_calendar) => {
      return _calendar.connected_email !== connected_email;
    });

    if (new_list.length > 0) {
      User.updateOne(
        { _id: currentUser.id },
        {
          $set: { calendar_list: new_list },
        }
      )
        .then(() => {
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          sendErrorToSentry(currentUser, err);
          return res.status(500).json({
            status: false,
            error: err.message,
          });
        });
    } else {
      User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            calendar_connected: false,
          },
          $unset: {
            calendar_list: true,
          },
        }
      )
        .then(() => {
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          sendErrorToSentry(currentUser, err);
          return res.status(500).json({
            status: false,
            error: err.message,
          });
        });
    }
  }
};

const dailyReport = async (req, res) => {
  const user = req.currentUser;

  user['daily_report'] = true;

  user.save();
  return res.send({
    status: true,
  });
};

const weeklyReport = async (req, res) => {
  const user = req.currentUser;

  user['weekly_report'] = true;
  user.save();

  return res.send({
    status: true,
  });
};

const disconDaily = async (req, res) => {
  const user = req.currentUser;

  user['daily_report'] = false;
  user.save();

  return res.send({
    status: true,
  });
};

const disconWeekly = async (req, res) => {
  const user = req.currentUser;

  user['weekly_report'] = false;
  user.save();

  return res.send({
    status: true,
  });
};

const desktopNotification = async (req, res) => {
  const user = req.currentUser;
  const { subscription, option } = req.body;
  user['desktop_notification'] = true;
  user['desktop_notification_subscription'] = JSON.stringify(subscription);
  const garbage = await Garbage.findOne({ user: user._id });
  if (!garbage) {
    const newGarbage = new Garbage({
      desktop_notification: option,
      user: user._id,
    });
    newGarbage
      .save()
      .then(() => {
        user.save();
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.log('err', err);
        sendErrorToSentry(user, err);
        return res.status(500).json({
          status: false,
          error: err.message || 'Internal server error',
        });
      });
  } else {
    garbage['desktop_notification'] = option;
    garbage
      .save()
      .then(() => {
        user.save();
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.log('err', err);
        sendErrorToSentry(user, err);
        return res.status(500).json({
          status: false,
          error: err.message || 'Internal server error',
        });
      });
  }
};

const resetPasswordByCode = async (req, res) => {
  const { code, password, email } = req.body;

  const user = await User.findOne({
    email: new RegExp(email, 'i'),
    del: false,
  });

  if (!user) {
    return res.status(400).send({
      status: false,
      error: 'NO user exist',
    });
  }

  if (!user.salt) {
    return res.status(400).send({
      status: false,
      error: 'You must use social login',
    });
  }
  const aryPassword = user.salt.split(' ');
  if (!aryPassword[1] || aryPassword[1] !== code) {
    // Code mismatch
    return res.status(400).send({
      status: false,
      error: 'invalid_code',
    });
  }
  // Expire check
  const updateTime = new Date(user['updated_at']);
  const delay = new Date().getTime() - updateTime.getTime();

  if (delay > 1000 * 60 * 15) {
    // More than 15 minutes passed
    return res.status(400).send({
      status: false,
      error: 'expired_code',
    });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
    .toString('hex');

  await User.updateOne({ _id: user._id }, { $set: { salt, hash } }).catch(
    (err) => {
      console.log(err.message);
    }
  );

  res.send({
    status: true,
  });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({
      status: false,
      error: 'no_email_or_user_name',
    });
  }
  const _user = await User.findOne({
    email: new RegExp(email, 'i'),
    del: false,
  });

  if (!_user) {
    return res.status(400).json({
      status: false,
      error: 'no_user',
    });
  }

  const code = randomstring.generate({
    length: 5,
    charset: '1234567890ABCDEFHJKMNPQSTUVWXYZ',
  });
  const update_data = {};

  if (_user['salt']) {
    const oldSalt = _user['salt'].split(' ')[0];
    // _user['salt'] = oldSalt + ' ' + code;
    update_data.salt = oldSalt + ' ' + code;
  } else {
    // _user['salt'] = ' ' + code;
    update_data.salt = ' ' + code;
  }
  User.updateOne({ _id: _user._id }, { $set: update_data }).catch((err) => {
    console.log(err.message);
  });

  const data = {
    template_data: {
      code,
      user_name: _user.user_name,
    },
    template_name: 'ForgotPassword',
    required_reply: false,
    email: _user['email'],
    source: _user.source,
  };

  sendNotificationEmail(data);

  res.send({
    status: true,
  });
};

const createPassword = async (req, res) => {
  const { currentUser } = req;
  const { password } = req.body;
  if (currentUser.hash || currentUser.salt) {
    return res.status(400).send({
      status: false,
      error: 'Please input your current password.',
    });
  } else {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
      .toString('hex');
    currentUser.salt = salt;
    currentUser.hash = hash;
    currentUser
      .save()
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const disableRequest = async (req, res) => {
  const { email, name, reason, feedback } = req.body;

  const ip_address =
    req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;

  console.log(ip_address);

  const exists = await Request.findOne({
    email,
    ip_address,
  });

  if (exists) {
    return res.status(400).json({
      status: false,
      error: 'Already exists',
    });
  }

  const request = new Request({
    email,
    name,
    reason,
    feedback,
    ip_address,
  });

  await request.save();

  return res.send({
    status: true,
  });
};

const disableAccount = async (req, res) => {
  const { currentUser } = req;
  const { close_reason, close_feedback, userId } = req.body;
  if (currentUser.is_primary && currentUser.organization_info) {
    // found out all subaccounts under this account
    const sub_accounts = await User.find({
      user_disabled: false,
      organization: currentUser.organization,
      _id: { $ne: currentUser._id },
    }).catch((err) => {
      console.log('close account sub-account find err', err.message);
    });

    if (sub_accounts.length > 0) {
      return res.status(400).json({
        status: false,
        error: 'remove_subaccount',
      });
    }
  }

  let cc_user;
  if (!currentUser.is_primary) {
    await getUserOrganization(currentUser);
    cc_user = await User.findOne({ _id: currentUser.organization?.owner });
  }

  const subscription = await updateSubscriptionHelper({
    payment_id: currentUser.payment,
    type: 'disable',
  }).catch(async (err) => {
    sendErrorToSentry(currentUser, err);
    await suspendUserHelper(currentUser._id).catch((error) => {
      console.log(error.message);
    });
  });

  await disableUserHelper({
    _id: currentUser._id,
    close_reason,
    close_feedback,
  }).catch((error) => {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  });

  const data = {
    template_data: {
      user_name: currentUser.user_name,
      created_at: moment()
        .tz(currentUser.time_zone_info)
        .format('h:mm MMMM Do, YYYY'),
    },
    template_name: 'CancelAccountConfirmation',
    required_reply: false,
    email: currentUser.email,
    cc: currentUser.is_primary
      ? mail_contents.REPLY
      : [cc_user.email, mail_contents.REPLY],
    source: currentUser.source,
  };

  Notification.replaceOne(
    {
      type: 'personal',
      criteria: 'subscription_ended',
      user: currentUser._id,
    },
    {
      type: 'personal',
      criteria: 'subscription_ended',
      user: currentUser._id,
      is_banner: true,
      banner_style: 'warning',
      delete: false,
      content:
        `<span>Your subscription will be canceled at {subscription date ` +
        moment.unix(subscription?.current_period_end).format('MM/DD/YYYY') +
        `}  as you have requested to close the account</span><a href='javascript: resume()'>Resume subscription</a>`,
    },
    { upsert: true }
  ).catch((error) => {
    console.log('Notification replace failed', error);
  });

  if (!currentUser.is_free) {
    sendNotificationEmail(data);
  }

  try {
    currentUser.source === 'crmgrow' && (await deleteWavvUser(currentUser._id));
  } catch (error) {
    console.log('delte wavv account error', error.message);
  }

  return res.send({
    status: true,
  });
};

const checkDowngrade = async (req, res) => {
  const { currentUser } = req;
  const { selectedPackage } = req.body;
  const currentPackage = currentUser.package_level || 'GROWTH';

  if (currentPackage.includes('LITE') && !currentPackage.includes('ELITE')) {
    return res.send({
      status: true,
    });
  } else {
    const currentVideoCount = await Video.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const currentPDFCount = await PDF.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const currentIMAGECount = await IMAGE.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const currentMaterialCount =
      currentVideoCount + currentPDFCount + currentIMAGECount;
    const currentVideos = await Video.find({
      user: currentUser.id,
      recording: true,
      del: false,
    });
    let currentVideoRecordingDuration = 0;
    if (currentVideos.length > 0) {
      for (const video of currentVideos) {
        currentVideoRecordingDuration += video.duration ? video.duration : 0;
      }
    }
    const currentAssistantCount = await Guest.countDocuments({
      user: currentUser.id,
    });
    const currentCreateAutomationCount = await Automation.countDocuments({
      $and: [
        { user: currentUser.id },
        { role: { $ne: 'admin' } },
        { clone_assign: { $ne: true } },
      ],
    });
    const currentActiveAutomationCount = await TimeLine.countDocuments({
      user: currentUser.id,
      status: { $in: ['active', 'checking'] },
    });
    const ownTeam = (await Team.find({ owner: currentUser.id })) || [];
    const currentHasOwnTeam = ownTeam.length;
    const currentCalendarCount = currentUser.calendar_list.length || 0;

    const subAccountList = currentUser.sub_account_list
      ? currentUser.sub_account_list.length
      : 0;

    const currentSchedulerCount = await EventType.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const agentFilterList = await AgentFilter.find({ user: currentUser.id });
    let currentAgentCounts = 0;
    for (const agent of agentFilterList) {
      currentAgentCounts += agent.count;
    }

    const data = [];
    if (
      (currentPackage.includes('PRO') &&
        selectedPackage.includes('LITE') &&
        !selectedPackage.includes('ELITE')) ||
      (currentPackage.includes('ELITE') &&
        ((selectedPackage.includes('LITE') &&
          !selectedPackage.includes('ELITE')) ||
          selectedPackage.includes('PRO'))) ||
      currentPackage.includes('CUSTOM')
    ) {
      let isValid = true;
      if (
        currentMaterialCount >
        PACKAGE[selectedPackage].material_info.upload_max_count
      ) {
        isValid = false;
        const overData = {
          type: 'limit_materials',
          count: currentMaterialCount,
          limit: PACKAGE[selectedPackage].material_info.upload_max_count,
        };
        data.push(overData);
      }
      if (
        currentVideoRecordingDuration >
        PACKAGE[selectedPackage].material_info.record_max_duration
      ) {
        isValid = false;
      }
      if (
        currentActiveAutomationCount >
        (PACKAGE[selectedPackage].automation_info?.max_count || 0)
      ) {
        isValid = false;
        const overData = {
          type: selectedPackage.includes('PRO')
            ? 'limit_automations'
            : 'remove_automations',
          count: currentActiveAutomationCount,
          limit: PACKAGE[selectedPackage].automation_info?.max_count || 0,
        };
        data.push(overData);
      }
      if (
        currentAssistantCount >
        (PACKAGE[selectedPackage].assistant_info?.max_count || 0)
      ) {
        isValid = false;
        const overData = {
          type: selectedPackage.includes('PRO')
            ? 'limit_assistants'
            : 'remove_assistants',
          count: currentAssistantCount,
          limit: PACKAGE[selectedPackage].assistant_info?.max_count || 0,
        };
        data.push(overData);
      }
      // if (
      //   currentSMSCount >
      //   (system_settings.TEXT_MONTHLY_LIMIT[selectedPackage] || 0)
      // ) {
      //   overflowMessage += isValid ? 'SMS' : ', SMS';
      //   isValid = false;
      // }
      if (
        currentCalendarCount >
        (PACKAGE[selectedPackage].calendar_info?.max_count || 0)
      ) {
        isValid = false;
        const overData = {
          type: selectedPackage.includes('PRO')
            ? 'limit_calendars'
            : 'remove_calendars',
          count: currentCalendarCount,
          limit: PACKAGE[selectedPackage].calendar_info?.max_count || 0,
        };
        data.push(overData);
      }
      if (
        currentHasOwnTeam > 0 &&
        selectedPackage.includes('LITE') &&
        !selectedPackage.includes('ELITE')
      ) {
        isValid = false;
        const overData = {
          type: 'remove_teams',
          count: currentHasOwnTeam,
          limit: 0,
        };
        data.push(overData);
      }
      if (subAccountList > 0) {
        isValid = false;
        const overData = {
          type: 'remove_multi_profile',
          count: subAccountList,
          limit: 0,
        };
        data.push(overData);
      }
      if (
        selectedPackage.includes('LITE') &&
        !selectedPackage.includes('ELITE') &&
        currentCreateAutomationCount > 0
      ) {
        isValid = false;
        const overData = {
          type: 'remove_automations',
          count: currentCreateAutomationCount,
          limit: 0,
        };
        data.push(overData);
      }
      if (
        currentSchedulerCount >
        (PACKAGE[selectedPackage].scheduler_info?.max_count || 0)
      ) {
        isValid = false;
        const overData = {
          type: selectedPackage.includes('PRO')
            ? 'limit_scheduler'
            : 'remove_scheduler',
          count: currentSchedulerCount,
          limit: PACKAGE[selectedPackage].scheduler_info?.max_count || 0,
        };
        data.push(overData);
      }
      if (
        currentAgentCounts >
        (PACKAGE[selectedPackage].agent_vending_info?.max_count || 0)
      ) {
        isValid = false;
        const overData = {
          type: selectedPackage.includes('PRO')
            ? 'limit_agents'
            : 'remove_agents',
          count: currentAgentCounts,
          limit: PACKAGE[selectedPackage].agent_vending_info?.max_count || 0,
        };
        data.push(overData);
      }

      if (!isValid) {
        return res.send({
          status: false,
          type: 'other',
          data,
        });
      } else {
        if (
          selectedPackage.includes('LITE') &&
          !selectedPackage.includes('ELITE')
        ) {
          const overData = {
            type: 'sms',
          };
          data.push(overData);
          return res.send({
            status: false,
            type: 'sms',
            data,
          });
        }
      }
    }
  }

  return res.send({
    status: true,
  });
};

const logout = async (req, res) => {
  const { currentUser } = req;
  User.updateOne(
    { _id: currentUser.id },
    { $set: { admin_login: false } }
  ).catch(() => {
    console.log('user update admin login err');
  });

  res.send({
    status: true,
  });
};

const connectAnotherEmail = async (req, res) => {
  const { currentUser } = req;
  currentUser['primary_connected'] = false;
  currentUser['connected_email_type'] = 'email';
  currentUser.save().catch((err) => {
    console.log('err', err);
  });
  return res.send({
    status: true,
  });
};

const disconnectEmail = async (req, res) => {
  const { currentUser } = req;
  const { tokenId } = req.body;
  if (currentUser.source === 'vortex') {
    const data = { userId: currentUser.vortex_id, tokenId };
    await deleteTokenById(data);
  } else {
    User.updateOne(
      {
        _id: currentUser.id,
      },
      {
        $set: { primary_connected: false },
        $unset: {
          connected_email: true,
          outlook_refresh_token: true,
          google_refresh_token: true,
        },
      }
    ).catch((err) => {
      console.log('user disconnect email update err', err.message);
    });
  }

  return res.send({
    status: true,
  });
};

const searchUserEmail = (req, res) => {
  const condition = req.body;

  User.find({
    email: { $regex: '.*' + condition.search + '.*', $options: 'i' },
  })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const searchNickName = async (req, res) => {
  const { nick_name } = req.body;
  const _user = await User.findOne({
    nick_name: { $regex: new RegExp('^' + nick_name + '$', 'i') },
    del: false,
  });
  if (_user) {
    return res.send({
      status: false,
    });
  } else {
    return res.send({
      status: true,
    });
  }
};

const searchPhone = async (req, res) => {
  const { cell_phone } = req.body;
  const _user = await User.findOne({ cell_phone, del: false });
  if (_user) {
    return res.send({
      status: false,
    });
  } else {
    return res.send({
      status: true,
    });
  }
};

const schedulePaidDemo = async (req, res) => {
  const { currentUser } = req;

  if (!currentUser.payment) {
    return res.status(400).json({
      status: false,
      error: 'Please connect your card',
    });
  }

  const payment = await Payment.findOne({
    _id: currentUser.payment,
  }).catch((err) => {
    console.log('payment find err', err.message);
  });

  if (!payment) {
    return res.status(400).json({
      status: false,
      error: 'Please connect your card',
    });
  }

  const paid_demo = await PaidDemo.findOne({
    user: currentUser.id,
    status: 1,
  });

  if (paid_demo) {
    return res.status(400).json({
      status: false,
      error: `You have already booked one on one`,
    });
  }

  const amount = system_settings.ONBOARD_PRICING_1_HOUR;
  const description = 'Schedule one on one onboarding 1 hour';
  const schedule_link = system_settings.SCHEDULE_LINK_1_HOUR;

  const data = {
    customer_id: payment.customer_id,
    receipt_email: currentUser.email,
    amount,
    description,
  };

  createCharge(data)
    .then(() => {
      const new_demo = new PaidDemo({
        user: currentUser.id,
      });

      new_demo
        .save()
        .then(async () => {
          const templatedData = {
            user_name: currentUser.user_name,
            schedule_link,
          };

          const params = {
            Destination: {
              ToAddresses: [currentUser.email],
            },
            Source: mail_contents.REPLY,
            Template: 'OnboardCall',
            TemplateData: JSON.stringify(templatedData),
          };

          // Create the promise and SES service object
          const command = new SendTemplatedEmailCommand(params);
          await ses.send(command).catch((err) => {
            console.log('ses command err', err.message);
          });
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.log('card payment err', err);
          return res.status(400).json({
            status: false,
            error: err.message,
          });
        });
    })
    .catch((_err) => {
      console.log('new demo create payment err', _err.message);
    });
};

const scheduledPaidDemo = async (req, res) => {
  const { currentUser } = req;

  PaidDemo.updateOne(
    {
      user: currentUser.id,
    },
    {
      $set: {
        status: 1,
      },
    }
  ).catch((err) => {
    console.log('schedule paid demo update err', err.message);
  });

  return res.send({
    status: true,
  });
};

const sendWelcomeEmail = async (data) => {
  const { id, email, user_name, password, time_zone } = data;
  const verification_url = `${urls.VERIFY_EMAIL_URL}?id=${id}`;
  const templatedData = {
    user_name,
    verification_url,
    created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
    webinar_url: system_settings.WEBINAR_LINK,
    import_url: urls.IMPORT_CSV_URL,
    template_url: urls.CONTACT_CSV_URL,
    email,
    password,
    facebook_url: urls.FACEBOOK_URL,
    login_url: urls.LOGIN_URL,
    terms_url: urls.TERMS_SERVICE_URL,
    privacy_url: urls.PRIVACY_URL,
  };

  const params = {
    Destination: {
      ToAddresses: [email],
    },
    Source: mail_contents.REPLY,
    Template: 'Welcome',
    TemplateData: JSON.stringify(templatedData),
  };
  const command = new SendTemplatedEmailCommand(params);
  await ses.send(command).catch((err) => {
    console.log('ses command err', err.message);
  });
};

const pushNotification = async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, del: false }).catch(
    (err) => {
      console.log('err', err);
    }
  );
  const subscription = JSON.parse(user['desktop_notification_subscription']);
  webPush.setVapidDetails(
    `mailto:${mail_contents.REPLY}`,
    api.VAPID.PUBLIC_VAPID_KEY,
    api.VAPID.PRIVATE_VAPID_KEY
  );
  const playload = JSON.stringify({
    notification: {
      title: 'Notification Title',
      body: 'Notification Description',
      icon: '/fav.ico',
      badge: '/fav.ico',
    },
  });
  webPush
    .sendNotification(subscription, playload)
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.send({
        status: false,
        error: err,
      });
    });
};

const authorizeZoom = async (req, res) => {
  const { code } = req.query;
  const { currentUser } = req;

  const options = {
    method: 'POST',
    url: 'https://zoom.us/oauth/token',
    qs: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: urls.ZOOM_AUTHORIZE_URL,
    },
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          `${api.ZOOM_CLIENT.ZOOM_CLIENT_ID}:${api.ZOOM_CLIENT.ZOOM_CLIENT_SECRET}`
        ).toString('base64'),
    },
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    const { access_token, refresh_token } = JSON.parse(body);

    const profile_option = {
      method: 'GET',
      url: 'https://api.zoom.us/v2/users/me',
      headers: {
        Authorization: 'Bearer ' + access_token,
        'Content-Type': 'application/json',
      },
    };

    request(profile_option, function (error, response, body) {
      if (error) throw new Error(error);

      const { email } = JSON.parse(body);

      const zoomInfoStr = encryptInfo(
        {
          refresh_token,
          email,
        },
        currentUser._id
      );
      Garbage.updateOne(
        {
          user: currentUser.id,
        },
        {
          $set: {
            zoom: zoomInfoStr,
          },
        }
      ).catch((err) => {
        console.log('garbage update err', err.message);
      });

      return res.send({
        status: true,
        email,
      });
    });
  });
};

const syncZoom = async (req, res) => {
  const source = req.params.source;
  let url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${api.ZOOM_CLIENT.ZOOM_CLIENT_ID}&redirect_uri=${urls.ZOOM_AUTHORIZE_URL}`;
  if (source === 'vortex') {
    url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${api.ZOOM_CLIENT.ZOOM_CLIENT_ID}&redirect_uri=${urls.VORTEX_ZOOM_AUTHORIZE_URL}`;
  }
  return res.send({
    status: true,
    data: url,
  });
};

const updatePackage = async (req, res) => {
  let { currentUser } = req;
  const { userId, captchaToken } = req.body;
  let level = req.body.level;
  if (!captchaToken) {
    return res.status(400).json({
      status: false,
      error: 'Invalid Request!',
    });
  }

  if (!(await checkRecaptchaToken(captchaToken))) {
    return res.status(400).json({
      status: false,
      error: 'Invalid Request!',
    });
  }

  // let level = req.body.level;

  if (!currentUser && userId) {
    currentUser = await User.findOne({ _id: userId }).catch((err) => {
      console.log('user find error', err.message);
    });
  }

  const user = await User.findOne({ _id: userId }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });
  if (!user) {
    return res.status(400).send({
      status: false,
      error: 'there is no user',
    });
  }

  if (
    (user.twilio_number || user.wavv_status?.value === 'APPROVED') &&
    user.user_version < 2.3 &&
    level === 'GROWTH'
  ) {
    level = 'GROWTH_PLUS_TEXT';
  }
  await updateSubscriptionHelper({
    payment_id: user.payment,
    type: 'update',
    level,
  }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });
  sendUpdatePackageNotificationEmail(user, level);
  setPackageHelper({
    user: user.id,
    level,
  }).catch((err) => {
    console.log('set package err', err.message);
  });
  return res.send({
    status: true,
  });
};

const generateSyncSocialLink = async (req, res) => {
  const { currentUser } = req;
  const { social, action } = req.body;
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  if (action === 'calendar') {
    if (!currentUser.calendar_info['is_enabled']) {
      return res.status(412).send({
        status: false,
        error: 'Calendar access is disabled',
      });
    }

    if (currentUser.calendar_info['is_limit']) {
      const calendar_info = currentUser.calendar_info;
      const max_calendar_count = calendar_info['max_count'];

      if (
        currentUser.calendar_list &&
        max_calendar_count <= currentUser.calendar_list.length
      ) {
        return res.status(412).send({
          status: false,
          error: 'You are exceed for max calendar connection',
        });
      }
    }
  }
  const redirectUrl = `${urls.DOMAIN_ADDR}/sync-social/${social}/${action}`;
  if (social === 'google') {
    let scopes = [];
    let redirect_uri;
    if (action === 'mail') {
      scopes = [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/gmail.send',
      ];
      redirect_uri =
        currentUser.source === 'vortex'
          ? urls.GMAIL_VORTEX_AUTHORIZE_URL
          : urls.GMAIL_AUTHORIZE_URL;
    }
    if (action === 'calendar') {
      scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
      ];
      redirect_uri =
        currentUser.source === 'vortex'
          ? urls.VORTEX_GOOGLE_CALENDAR_AUTHORIZE_URL
          : urls.GOOGLE_CALENDAR_AUTHORIZE_URL;
    }

    const authorizationUri = googleClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      redirect_uri,
    });
    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.send({
      status: true,
      data: authorizationUri,
    });
  } else if (social === 'outlook') {
    let scopes = [];
    if (action === 'mail') {
      scopes = [
        'openid',
        'profile',
        'offline_access',
        'email',
        'https://graph.microsoft.com/mail.send',
      ];
    }
    if (action === 'calendar') {
      scopes = [
        'openid',
        'profile',
        'offline_access',
        'https://graph.microsoft.com/calendars.readwrite',
      ];
    }
    const authorizationUri = msClient.authorizeURL({
      redirect_uri: redirectUrl,
      scope: scopes.join(' '),
      prompt: 'select_account',
    });
    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.send({
      status: true,
      data: authorizationUri,
    });
  }
};
const syncSocialRedirect = (req, res) => {
  const social = req.params.social;
  const action = req.params.action;
  const code = req.query.code;

  const link = `crmgrow://sync-social/${social}/${action}/${code}`;

  return res.render('mobile-social', { link });
};

const getCallToken = (req, res) => {
  const signature =
    'q6Oggy7to8EEgSyJTwvinjslHitdRjuC76UEtw8kxyGRDAlF1ogg3hc4WzW2vnzc';
  const payload = {
    userId: '123456',
  };
  const issuer = 'k8d8BvqFWV9rSTwZyGed64Dc0SbjSQ6D';
  const token = jwt.sign(payload, signature, { issuer, expiresIn: 3600 });
  return res.send({
    status: true,
    token,
  });
};

const easyLoadSubAccounts = async (req, res) => {
  const { currentUser } = req;
  let sub_accounts = [];
  let total = 0;
  if (currentUser.organization) {
    sub_accounts = await User.find({
      organization: currentUser.organization,
      del: false,
    })
      .select({
        _id: 1,
        user_name: 1,
        email: 1,
        picture_profile: 1,
        company: 1,
        is_primary: 1,
        connected_email: 1,
        cell_phone: 1,
      })
      .catch((err) => {
        console.log('Getting sub account is failed.', err.message);
      });
  }
  if (currentUser.is_primary && currentUser.organization_info?.is_enabled) {
    total = currentUser.organization_info?.max_count || 2;
  } else if (currentUser.organization_info?.is_enabled) {
    total += sub_accounts.length;
  }

  return res.send({
    status: true,
    data: sub_accounts,
    limit: total,
  });
};

/**
 * Load the sub accounts of the primary account
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getSubAccounts = async (req, res) => {
  const { currentUser } = req;

  if (currentUser.organization_info?.is_enabled && currentUser.organization) {
    const users = await User.find({
      organization: currentUser.organization,
      del: false,
      _id: { $ne: currentUser._id },
    }).select(
      '_id user_name email phone picture_profile company time_zone_info login_enabled master_enabled billing_access_enabled team_stay_enabled assignee_info assistant_info automation_info calendar_info material_info organization_info text_info video_info hash'
    );

    const accountsList = [];
    users.forEach((user) => {
      const userDoc = { ...user._doc };
      if (userDoc.hash !== undefined) {
        userDoc.hasPassword = true;
        delete userDoc.hash;
      } else {
        userDoc.hasPassword = false;
      }
      accountsList.push(userDoc);
    });

    const total = currentUser.organization_info
      ? currentUser.organization_info.max_count
      : 0;
    return res.send({
      status: true,
      data: {
        users: accountsList,
        total,
      },
    });
  } else {
    if (currentUser.is_primary && currentUser.organization_info?.is_enabled) {
      const total = currentUser.organization_info
        ? currentUser.organization_info.max_count
        : 0;
      return res.send({
        status: true,
        data: {
          users: [],
          total,
        },
      });
    }
    return res.status(400).json({
      status: false,
      error: 'No primary account',
    });
  }
};

const getTeamInfo = (req, res) => {
  const { currentUser } = req;

  User.findById(currentUser._id)
    .populate('organization')
    .exec()
    .then(async (user) => {
      if (!user?.organization) {
        return res.send({
          status: true,
          data: {
            organization: {},
          },
        });
      }
      const organization = user.organization;
      if (organization?.virtual_customer_id) {
        const virtualCustomerInfo = await getVirtualCustomerById(
          organization?.virtual_customer_id,
          req.get('Authorization')
        ).catch(() => {});

        const teamMemberPreferences =
          virtualCustomerInfo?.teamPreferences?.members || {};
        organization.members.forEach((member) => {
          const memberSetting =
            teamMemberPreferences[member.vortex_user_id] || {};
          member.avatar_color = memberSetting?.avatarColor;
        });
      }

      return res.send({
        status: true,
        data: {
          organization,
        },
      });
    })
    .catch((error) => {
      console.log('getTeamInfo Error:', error);
      return res.status(500).json({ status: false, message: 'Server error' });
    });
};

const switchAccount = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.organization) {
    return res.status(400).send({
      status: false,
      error: 'no_sub_accounts',
    });
  }
  if (currentUser.is_primary) {
    const _user = await User.findOne({
      _id: req.body.user_id,
      organization: currentUser.organization,
    });

    if (_user) {
      const token = jwt.sign({ id: req.body.user_id }, api.APP_JWT_SECRET);
      const myJSON = JSON.stringify(_user);
      const user = JSON.parse(myJSON);

      user.hasPassword = user.hash !== undefined;

      userProfileOutputGuard(user);

      return res.send({
        status: true,
        data: {
          token,
          user,
        },
      });
    } else {
      return res.status(400).json({
        status: false,
        error: 'Invalid permission',
      });
    }
    // eslint-disable-next-line eqeqeq
  } else {
    const _user = await User.findOne({
      _id: req.body.user_id,
    });

    if (_user) {
      const token = jwt.sign({ id: req.body.user_id }, api.APP_JWT_SECRET);
      const myJSON = JSON.stringify(_user);
      const user = JSON.parse(myJSON);

      user.hasPassword = user.hash !== undefined;

      userProfileOutputGuard(user);
      return res.send({
        status: true,
        data: {
          token,
          user,
        },
      });
    } else {
      return res.status(400).json({
        status: false,
        error: 'Invalid permission',
      });
    }
  }
};

const editSubAccount = async (req, res) => {
  const { currentUser } = req;
  let edit_data = { ...req.body };

  if (!currentUser.organization) {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }

  if (currentUser.is_primary) {
    let cell_phone;
    if (req.body.phone && req.body.phone.e164Number) {
      cell_phone = req.body.phone.e164Number;
      edit_data = { ...edit_data, cell_phone };
    }

    const _user = await User.findOne({
      _id: req.params.id,
      organization: currentUser.organization,
    });

    if (_user) {
      if (req.body.picture_profile) {
        edit_data['picture_profile'] = await uploadBase64Image(
          req.body.picture_profile
        );
      }
      if (edit_data.password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto
          .pbkdf2Sync(edit_data.password, salt, 10000, 512, 'sha512')
          .toString('hex');
        edit_data.hash = hash;
        edit_data.salt = salt;
      }
      User.updateOne(
        {
          _id: req.params.id,
        },
        {
          $set: { ...edit_data },
        }
      ).catch((err) => {
        console.log('user update one err', err.message);
      });

      if (edit_data.hash !== undefined) {
        edit_data.hasPassword = true;
        userProfileOutputGuard(edit_data);
      }

      return res.send({
        status: true,
        data: edit_data,
      });
    } else {
      return res.status(400).json({
        status: false,
        error: 'Invalid permission',
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }
};

const removeSubAccount = async (req, res) => {
  const { currentUser } = req;

  if (!currentUser.organization) {
    return res.status(400).json({
      status: false,
      error: 'No organization',
    });
  }

  if (currentUser.is_primary) {
    if (req.params.id === currentUser.id) {
      return res.status({
        status: false,
        error: `Can't remove primary account`,
      });
    }

    const _user = await User.findOne({
      _id: req.params.id,
      organization: currentUser.organization,
    });

    if (_user) {
      if (_user.payment !== currentUser.payment) {
        const payment = await Payment({ _id: _user.payment }).catch((err) => {
          console.log('payment fine err', err.message);
        });
        if (payment) {
          cancelSubscriptionHelper({ subscription: payment.subscription })
            .then(() => {
              User.updateOne(
                {
                  _id: currentUser.id,
                },
                {
                  $pull: {
                    sub_account_payments: currentUser.sub_account_payments[0],
                  },
                }
              ).catch((err) => {
                console.log('user update err', err.message);
              });
            })
            .catch((err) => {
              console.log(err.message);
            });
        }
      }

      suspendData(req.params.id);

      User.updateOne(
        { _id: req.params.id },
        {
          $set: {
            del: true,
            user_disabled: true,
            data_cleaned: false,
            data_released: false,
            disabled_at: new Date(),
          },
        }
      )
        .then(() => {
          const data = {
            template_data: {
              user_name: _user.user_name,
              created_at: moment()
                .tz(currentUser.time_zone_info)
                .format('h:mm MMMM Do, YYYY'),
              // reason: close_reason,
              // feedback: close_feedback,
            },
            template_name: 'CancelAccountConfirmation',
            required_reply: false,
            email: _user.email,
            cc: [currentUser.email, mail_contents.REPLY],
            source: currentUser.source,
          };

          sendNotificationEmail(data);
        })
        .catch((err) => {
          console.log('user err', err.message);
        });

      return res.send({
        status: true,
      });
    } else {
      return res.status(400).json({
        status: false,
        error: 'Invalid permission',
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }
};

const newSubAccount = async (req, res) => {
  const { currentUser } = req;
  let result;
  try {
    if (
      !currentUser.organization_info?.is_enabled ||
      !currentUser.organization_info.is_owner
    ) {
      throw new Error(`You don't have permission to create new sub account`);
    }

    if (!currentUser.is_primary)
      throw new Error('Please create account in primary');

    if (currentUser.subscription.is_limit && !currentUser.payment) {
      return res.status(400).json({
        status: false,
        error: 'Please connect your card',
      });
    }

    // Create the organization & match with internal team
    if (!currentUser.organization) {
      await createOrganizationAndInternalTeam(currentUser);
    }

    if (!currentUser.organization) {
      throw new Error('No organization');
    }

    const ex_user = await User.findOne({
      email: new RegExp(req.body.email, 'i'),
      del: false,
    }).catch((err) => {
      console.log('user find err in signup', err.message);
    });
    if (ex_user) throw new Error('User already exists');

    const account_data = {
      ...req.body,
      equal_account: 1,
      is_primary: false,
      package_level: 'GROWTH',
      is_trial: false,
      can_restore_seat: true,
      organization: currentUser.organization,
      organization_info: {
        ...currentUser.organization_info,
        is_owner: false,
      },
    };

    if (currentUser.subscription.is_limit) {
      const payment = await Payment.findOne({
        _id: currentUser.payment,
      }).catch((err) => {
        console.log('payment find err', err.message);
      });
      if (!payment) throw new Error('Please connect your card');

      const { payment: new_payment } = await createSubscriptionHelper({
        email: req.body.email,
        customer_id: payment.customer_id,
        plan_id: api.STRIPE.PLAN['GROWTH'],
        is_trial: false,
        description: 'Sub account',
        is_payment_new: true,
      }).catch(() => {
        throw new Error('Can`t create subscription.');
      });
      account_data['payment'] = new_payment._id;
    }

    const email_data = {
      template_data: {
        user_name: currentUser.user_name,
        user_email: currentUser.email,
      },
      template_name: 'WelcomeAddSubProfile',
      required_reply: false,
      cc: currentUser.email,
      email: mail_contents.REPLY,
      source: currentUser.source,
    };

    sendNotificationEmail(email_data);

    let cell_phone;
    if (req.body.phone && req.body.phone.e164Number) {
      cell_phone = req.body.phone.e164Number;
    }
    account_data['cell_phone'] = cell_phone;

    let picture_profile;
    if (req.body.picture_profile) {
      picture_profile = await uploadBase64Image(req.body.picture_profile);
    }
    account_data['picture_profile'] = picture_profile;

    result = await createUser(account_data).catch((error) => {
      throw new Error(error);
    });

    if (result && result.status) {
      createInternalTeam(currentUser, result.data.user).catch((error) => {
        console.log('create internal team err', error.message);
      });
      return res.send({
        status: true,
        data: result.data,
      });
    } else {
      throw new Error(result.error || 'Unknown Error');
    }
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const recallSubAccount = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.organization) {
    return res.status(400).send({
      status: false,
      error: 'No organization',
    });
  }

  if (currentUser.is_primary) {
    if (
      currentUser.sub_account_payments &&
      currentUser.sub_account_payments[0]
    ) {
      const users = await User.find({
        organization: currentUser.organization,
        del: false,
        _id: { $ne: currentUser._id },
      });

      const count = users.length;

      const max_account = currentUser.organization_info
        ? currentUser.organization_info.max_count
        : 0;

      if (max_account < count) {
        return res.status(400).json({
          status: false,
          error: 'Please remove account first',
        });
      } else {
        const payment = await Payment.findOne({
          _id: currentUser.sub_account_payments[0],
        });

        cancelSubscriptionHelper({ subscription: payment.subscription })
          .then(() => {
            User.updateOne(
              {
                _id: currentUser.id,
              },
              {
                $pull: {
                  sub_account_payments: currentUser.sub_account_payments[0],
                },
              }
            ).catch((err) => {
              console.log('user update err', err.message);
            });

            return res.send({
              status: true,
            });
          })
          .catch((err) => {
            console.log('cancel subscription err', err.message);
            sendErrorToSentry(currentUser, err);
            return res.status(500).json({
              status: false,
              error: err.message,
            });
          });
      }
    } else {
      return res.status(400).json({
        status: false,
        error: 'No more seat remove',
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'Invalid permssion',
    });
  }
};

const updateDraft = async (req, res) => {
  const user = req.currentUser;

  const editData = req.body;
  // TODO: should limit the editing fields here
  delete editData.password;

  if (editData['email'] && !user.primary_connected) {
    user['connected_email'] = editData['email'];
  }

  if (editData['phone'] && editData['phone'].e164Number) {
    user['cell_phone'] = editData['phone'].e164Number;
  }
  for (const key in editData) {
    user[key] = editData[key];
  }

  user
    .save()
    .then((_res) => {
      const myJSON = JSON.stringify(_res);
      const data = JSON.parse(myJSON);
      userProfileOutputGuard(data);
      res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('user update err', err.message);
      sendErrorToSentry(user, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const contactUs = async (req, res) => {
  const { email, fullname, message } = req.body;
  const data = {
    template_data: {
      full_name: fullname,
      email,
      message,
    },
    template_name: 'ContactUs',
    required_reply: false,
    email: mail_contents.REPLY,
    cc: email,
  };

  sendNotificationEmail(data);

  return res.send({
    status: true,
  });
};

const generateBuilderToken = (req, res) => {
  const { currentUser } = req;
  const payload = {
    email: currentUser.email,
    userId: currentUser._id,
    projectId: api.CONVRRT.PROJECT_ID,
    orgId: api.CONVRRT.ORG_ID,
    isTest: process.env.NODE_ENV !== 'production',
  };
  const token = jwt.sign(payload, api.API_JWT_SECRET);
  return res.send({ status: true, data: token });
};

const getUserStatistics = async (req, res) => {
  const { currentUser } = req;
  // Contacts, materials, tasks calculate
  const contactsCount = await Contact.countDocuments({
    user: currentUser.id,
  });
  const lastContact = await Contact.findOne({
    user: currentUser.id,
  }).sort('-_id');
  const videoCount = await Video.countDocuments({
    $or: [{ user: currentUser.id }],
    del: false,
  });
  const currentVideos = await Video.find({
    user: currentUser.id,
    recording: true,
    del: false,
  });
  let currentVideoRecordingDuration = 0;
  if (currentVideos.length > 0) {
    for (const video of currentVideos) {
      currentVideoRecordingDuration += video.duration ? video.duration : 0;
    }
  }
  const materials = [];
  const lastVideo = await Video.findOne({ user: currentUser.id }).sort('-_id');
  lastVideo ? materials.push(lastVideo) : false;
  const pdfCount = await PDF.countDocuments({
    $or: [{ user: currentUser.id }],
    del: false,
  });
  const lastPdf = await PDF.findOne({ user: currentUser.id }).sort('-_id');
  lastPdf ? materials.push(lastPdf) : false;
  const imageCount = await Image.countDocuments({
    $or: [{ user: currentUser.id }],
    del: false,
  });
  const lastImage = await Image.findOne({ user: currentUser.id }).sort('-_id');
  lastImage ? materials.push(lastImage) : false;
  const materialCount = videoCount + pdfCount + imageCount;
  const lastMaterials = _.sortBy(materials, 'created_at');
  const lastMaterial = lastMaterials.pop();

  const taskCount = await FollowUp.countDocuments({
    user: currentUser.id,
    status: 0,
  });
  const lastTask = await FollowUp.findOne({
    user: currentUser.id,
    status: 0,
    due_date: { $gte: new Date() },
  }).sort('due_date');

  // Active Automations
  const activeAutomationsCount = await getActiveAutomationCount(
    currentUser._id
  );

  // Virtual Assistant
  const assistant = await Guest.find({ user: currentUser.id }).count();

  // Scheduler
  const scheduler = await EventType.find({ user: currentUser.id }).count();

  return res.send({
    status: true,
    data: {
      contact: {
        count: contactsCount,
        last: lastContact,
      },
      task: {
        count: taskCount,
        last: lastTask,
      },
      material: {
        count: materialCount,
        last: lastMaterial,
        record_duration: currentVideoRecordingDuration,
      },
      automation: {
        count: activeAutomationsCount,
      },
      scheduler: {
        count: scheduler,
      },
      assistant: {
        count: assistant,
      },
      calendar: {
        count: currentUser.calendar_list.length,
      },
      landing_page: {
        count: 0,
      },
    },
  });
};

const sleepAccount = async (req, res) => {
  const { currentUser } = req;

  await updateSubscriptionHelper({
    payment_id: currentUser.payment,
    type: 'update',
    level: 'SLEEP',
  }).catch((err) => {
    return res.status(400).json({
      status: false,
      error: 'create subscription error',
    });
  });

  const data = {
    template_data: {
      user_name: currentUser.user_name,
      created_at: moment()
        .tz(currentUser.time_zone_info)
        .format('h:mm MMMM Do, YYYY'),
    },
    template_name: 'SleepAccount',
    required_reply: false,
    cc: currentUser.email,
    email: mail_contents.REPLY,
    source: currentUser.source,
  };

  sendNotificationEmail(data);

  if (currentUser.source === 'crmgrow') {
    try {
      await deleteWavvUser(currentUser._id);
      trackApiRequest('wavv_user_sleep', {
        user_id: currentUser._id,
        wavv_number: currentUser.wavv_number,
        text_info: currentUser.text_info,
        dialer_info: currentUser.dialer_info,
        wavv_status: currentUser.wavv_status,
      });
      await User.updateOne(
        { _id: currentUser._id },
        {
          $set: {
            'text_info.initial_credit': false,
            'dialer_info.is_enabled': false,
            'dialer_info.level': '',
            wavv_number: '',
            wavv_status: { value: 'sleep', updated_at: new Date() },
          },
        }
      );
    } catch (error) {
      console.log('delte wavv account error', error.message);
    }
  }

  suspendData(currentUser.id);
  sleepUserHelper(currentUser);

  return res.send({
    status: true,
  });
};

const extensionSignup = async (req, res) => {
  const errors = validationResult(req);
  const errMsg = [];
  if (errors.array().length) {
    for (let i = 0; i < errors.array().length; i++) {
      errMsg.push(errors.array()[i].msg);
    }
  }
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errMsg,
    });
  }

  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  }).catch((err) => {
    console.log('user find err in signup', err.message);
  });

  if (_user) {
    return res.status(400).send({
      status: false,
      error: 'User already exists',
    });
  }

  const level = system_settings.EXT_FREE_PACKAGE;

  const password = req.body.password;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
    .toString('hex');

  const user_data = {
    ...req.body,
    package_level: level,
    extension_single: true,
    salt,
    hash,
  };

  const user = new User(user_data);

  user
    .save()
    .then(async (_res) => {
      // addNickName(_res.id);

      createAdminFolder(_res.id);

      const packageData = {
        user: _res.id,
        level,
      };

      setPackage(packageData).catch((err) => {
        console.log('user set package err', err.message);
      });

      const time_zone = system_settings.TIME_ZONE;
      const email_data = {
        template_data: {
          user_email: _res.email,
          user_name: _res.user_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          password,
          oneonone_url: urls.ONEONONE_URL,
          recording_url: urls.INTRO_VIDEO_URL,
          recording_preview: urls.RECORDING_PREVIEW_URL,
          webinar_url: system_settings.WEBINAR_LINK,
        },
        template_name: 'WelcomeExtension',
        required_reply: true,
        email: _res.email,
        source: _res.source,
      };

      sendNotificationEmail(email_data);

      sendSlackNotification(_res.email);

      const token = jwt.sign(
        {
          id: _res.id,
        },
        api.APP_JWT_SECRET
      );

      const myJSON = JSON.stringify(_res);
      const user = JSON.parse(myJSON);
      userProfileOutputGuard(user);
      return res.send({
        status: true,
        data: {
          token,
          user,
        },
      });
    })
    .catch((err) => {
      sendErrorToSentry(user, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const extensionUpgrade = async (req, res) => {
  const { token, level } = req.body;
  const { currentUser } = req;

  const payment_data = {
    token,
    level,
    user_name: currentUser.user_name,
    email: currentUser.email,
  };

  createPayment(payment_data)
    .then(({ payment }) => {
      const packageData = {
        user: currentUser.id,
        level: 'EXT_PAID',
      };

      setPackage(packageData).catch((err) => {
        console.log('user set package err', err.message);
      });

      User.updateOne(
        {
          _id: currentUser.id,
        },
        {
          $set: {
            package_level: level,
            payment: payment.id,
          },
        }
      ).catch((err) => {
        console.log('user package err', err.message);
      });

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const extensionUpgradeWeb = async (req, res) => {
  const { token, level } = req.body;
  const { currentUser } = req;

  if (currentUser.package_level === 'EXT_FREE') {
    const payment_data = {
      token,
      level,
      user_name: currentUser.user_name,
      email: currentUser.email,
    };

    createPayment(payment_data)
      .then(async ({ payment }) => {
        const packageData = {
          user: currentUser.id,
          level,
        };

        setPackage(packageData).catch((err) => {
          console.log('user set package err', err.message);
        });

        addNickName(currentUser.id);
        User.updateOne(
          {
            _id: currentUser.id,
          },
          {
            $set: {
              ...req.body,
              package_level: level,
              extension_single: false,
              payment: payment.id,
            },
          }
        ).catch((err) => {
          console.log('user package err', err.message);
        });

        const _user = await User.findOne({ _id: currentUser.id });
        const garbage = new Garbage({
          user: _user.id,
        });

        garbage.save().catch((err) => {
          console.log('garbage save err', err.message);
        });

        const _token = jwt.sign(
          {
            id: _user.id,
          },
          api.APP_JWT_SECRET
        );

        const myJSON = JSON.stringify(_user);
        const user = JSON.parse(myJSON);
        userProfileOutputGuard(user);

        return res.send({
          status: true,
          data: {
            token: _token,
            user,
          },
        });
      })
      .catch((err) => {
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else {
    User.updateOne(
      {
        _id: currentUser.id,
      },
      {
        $set: {
          ...req.body,
          extension_single: false,
        },
      }
    ).catch((err) => {
      console.log('user package err', err.message);
    });

    const _user = await User.findOne({ _id: currentUser.id });
    const garbage = new Garbage({
      user: _user.id,
    });

    garbage.save().catch((err) => {
      console.log('garbage save err', err.message);
    });

    addNickName(currentUser.id);

    const _token = jwt.sign(
      {
        id: _user.id,
      },
      api.APP_JWT_SECRET
    );

    const myJSON = JSON.stringify(_user);
    const user = JSON.parse(myJSON);
    userProfileOutputGuard(user);

    return res.send({
      status: true,
      data: {
        token: _token,
        user,
      },
    });
  }
};

const socialExtensionSignup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }
  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  });

  if (_user) {
    return res.status(400).send({
      status: false,
      error: 'User already exists',
    });
  }

  const level = system_settings.EXT_FREE_PACKAGE;

  const user = new User({
    ...req.body,
    package_level: level,
    extension_single: true,
  });

  user
    .save()
    .then((_res) => {
      // addNickName(_res.id);

      createAdminFolder(_res.id);

      const packageData = {
        user: _res.id,
        level,
      };

      setPackage(packageData).catch((err) => {
        console.log('user set package err', err.message);
      });

      const time_zone = system_settings.TIME_ZONE;

      const data = {
        template_data: {
          user_email: req.body.email,
          verification_url: `${urls.VERIFY_EMAIL_URL}?id=${_res.id}`,
          user_name: _res.user_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          password: 'No password (use social login)',
          oneonone_url: urls.ONEONONE_URL,
          recording_preview: urls.RECORDING_PREVIEW_URL,
          recording_url: urls.INTRO_VIDEO_URL,
          webinar_url: system_settings.WEBINAR_LINK,
        },
        template_name: 'WelcomeExtension',
        required_reply: true,
        email: _res.email,
        source: _res.source,
      };

      sendNotificationEmail(data);

      sendSlackNotification(_res.email);

      const token = jwt.sign({ id: _res.id }, api.APP_JWT_SECRET);

      const myJSON = JSON.stringify(_res);
      const user = JSON.parse(myJSON);

      res.send({
        status: true,
        data: {
          token,
          user,
        },
      });
    })
    .catch((e) => {
      let errors;
      if (e.errors) {
        errors = e.errors.map((err) => {
          delete err.instance;
          return err;
        });
      }
      sendErrorToSentry(_user, e);
      return res.status(500).send({
        status: false,
        error: errors || e,
      });
    });
};

const syncSMTP = async (req, res) => {
  const { currentUser } = req;
  const { host, port, user, pass, secure } = req.body;

  const smtpTransporter = nodemailer.createTransport({
    port,
    host,
    secure,
    auth: {
      user,
      pass,
    },
    debug: true,
  });

  // verify connection configuration
  smtpTransporter.verify(function (error, success) {
    if (error) {
      console.log(error);
      if (error?.responseCode === 535) {
        const data = {
          ...req.body,
          smtp_connected: false,
          pass: '',
          secure,
        };
        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              smtp_info: data,
            },
          }
        ).catch((err) => {
          console.log('smtp update err', err.message);
        });
      }
      return res.status(400).json({
        status: false,
        error: error.response ? error.response : 'Invalid user or password!',
      });
    } else {
      console.log('Server is ready to take our messages');
      let data;
      if (currentUser.smtp_info && currentUser.smtp_info.user === user) {
        data = {
          primary_connected: false,
          connected_email_type: '',
          connected_email: '',
          smtp_info: { ...req.body, smtp_connected: true, secure },
        };
      } else {
        data = {
          primary_connected: false,
          connected_email_type: '',
          connected_email: '',
          smtp_info: {
            ...req.body,
            smtp_connected: true,
            daily_limit: 2000,
            secure,
          },
          email_info: { ...currentUser.email_info, max_count: 2000 },
        };
      }

      User.updateOne(
        { _id: currentUser.id },
        {
          $set: data,
        }
      ).catch((err) => {
        console.log('smtp update err', err.message);
      });

      return res.send({
        status: true,
      });
    }
  });
};

const authorizeSMTP = async (req, res) => {
  const { currentUser } = req;
  const { email } = req.body;

  const profile = await User.findOne({ _id: currentUser.id }).catch((err) => {
    console.log('user getting failed to verify smtp email address');
  });

  if (!profile || !profile.smtp_info) {
    return res.status(400).send({
      status: false,
      error: 'Please connect the smtp with your account.',
    });
  }

  const {
    port,
    host,
    secure,
    user,
    pass,
    email: original_email,
    daily_limit,
  } = profile.smtp_info;

  const smtpTransporter = nodemailer.createTransport({
    port,
    host,
    secure,
    auth: {
      user,
      pass,
    },
    debug: true,
  });

  // verify connection configuration
  const code = randomstring.generate({
    length: 6,
    charset: '1234567890',
  });
  const message = {
    to: currentUser.email,
    from: `${currentUser.user_name} <${email}>`,
    subject: 'Please verify your code for CRMGrow SMTP connection.',
    html: `Please use this code in you app: <span style="font-size:24; font-weight:bold; color:blue">${code}</span> to verify SMTP connection.`,
  };

  smtpTransporter.sendMail(message, function (err, info) {
    if (err) {
      console.log('verify smtp is failed.', err);
      if (err?.responseCode === 535) {
        const data = {
          ...req.body,
          host,
          port,
          secure,
          user,
          smtp_connected: false,
          pass: '',
        };
        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              smtp_info: data,
            },
          }
        ).catch((err) => {
          console.log('smtp update err', err.message);
        });
      }
      return res.status(400).json({
        status: false,
        error: err.response ? err.response : 'smtpTransporter sendMail Error',
      });
    } else {
      const data = {
        port,
        host,
        secure,
        user,
        pass,
        email,
        verification_code: code,
        daily_limit,
      };
      User.updateOne(
        { _id: currentUser.id },
        {
          $set: { smtp_info: { ...data } },
        }
      ).catch((err) => {
        console.log('user update err', err.message);
      });
      if (original_email !== email) {
        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              primary_connected: false,
              connected_email_type: '',
              connected_email: '',
            },
          }
        ).catch((err) => {
          console.log('smtp update err', err.message);
        });
      }
      res.send({
        data: { ...data, smtp_connected: true },
        status: true,
      });
    }
  });
};

const authorizeSMTPCode = async (req, res) => {
  const { currentUser } = req;
  const { code } = req.body;
  const profile = await User.findOne({ _id: currentUser.id }).catch((err) => {
    console.log('Getting user failed to verify smtp code.', err.message);
    return res.status(400).send({
      status: false,
      error: 'Could not find user for the current user.',
    });
  });

  if (!profile || !profile.smtp_info) {
    console.log(profile);
    return res.status(400).send({
      status: false,
      error: 'Please connect the smtp with your account.',
    });
  }

  const { verification_code, email } = profile.smtp_info;
  if (verification_code === code) {
    // Update the User
    User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          connected_email: email,
          primary_connected: true,
          connected_email_type: 'smtp',
        },
      }
    ).catch((err) => {
      console.log('smtp update err', err.message);
    });

    return res.send({
      status: true,
    });
  } else {
    return res.status(400).send({
      status: false,
      error: 'Your SMTP verification code is invalid.',
    });
  }
};

const createEmailAlias = async (req, res) => {
  const { currentUser } = req;
  const { email, name } = req.body;
  const aliasList = currentUser.email_alias;
  aliasList.push({
    email,
    name,
  });
  User.updateOne(
    {
      _id: currentUser._id,
    },
    {
      $set: { email_alias: aliasList },
    }
  ).then(() => {
    return res.send({
      status: true,
    });
  });
};

const updateEmailAlias = (req, res) => {
  const { currentUser } = req;
  const { email, name, primary } = req.body;
  const aliasList = currentUser.email_alias;
  let isExist = false;
  aliasList.forEach((e) => {
    if (e.email === email) {
      if (name) {
        e.name = name;
      }
      if (primary) {
        e.primary = true;
      }
      isExist = true;
    } else if (primary) {
      e.primary = false;
    }
  });
  if (!isExist) {
    if (email === currentUser.connected_email) {
      User.updateOne(
        {
          _id: currentUser._id,
        },
        {
          $set: { email_alias: aliasList },
        }
      ).then(() => {
        return res.send({
          status: true,
        });
      });
    } else {
      return res.status(400).send({
        status: false,
        error: 'not_found',
      });
    }
  }
  User.updateOne(
    {
      _id: currentUser._id,
    },
    {
      $set: { email_alias: aliasList },
    }
  ).then(() => {
    return res.send({
      status: true,
    });
  });
};

const requestEmailAliasVerification = (req, res) => {
  const { currentUser } = req;
  const emailType = currentUser.connected_email_type;
  const { email, name } = req.body;
  const code = randomstring.generate({
    length: 6,
    charset: '1234567890ABCDEFHJKMNPQSTUVWXYZ',
  });
  const emailSubject = 'crmgrow email alias is connected';
  const emailContent = code;
  sendEmailAliasCode({
    email,
    name,
    emailType,
    emailSubject,
    emailContent,
    currentUser,
  })
    .then(() => {
      const aliasList = currentUser.email_alias;
      aliasList.some((e) => {
        if (e.email === email) {
          e.expired_at = new Date();
          return true;
        }
      });
      User.updateOne(
        {
          _id: currentUser._id,
        },
        {
          $set: { emaail_alias: aliasList },
        }
      ).then(() => {
        return res.send({
          status: true,
        });
      });
    })
    .catch((data) => {
      return res.status(400).send(data);
    });
};

const sendEmailAliasCode = async (data) => {
  const { email, name, emailType, currentUser, emailSubject, emailContent } =
    data;
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  const userEmail = currentUser.email;
  return new Promise(async (resolve, reject) => {
    if (/gmail|gsuit/.test(emailType)) {
      const token = JSON.parse(currentUser.google_refresh_token);
      googleClient.setCredentials({ refresh_token: token.refresh_token });
      await googleClient.getAccessToken().catch((err) => {
        console.log('get access err', err.message);
      });
      if (!googleClient.credentials.access_token) {
        reject({
          status: false,
          error: 'invalid_email_connected',
        });
      }
      const body = createBody({
        headers: {
          To: userEmail,
          From: `${name} <${email}>`,
          Subject: emailSubject,
        },
        textHtml: emailContent,
        textPlain: emailContent,
      });
      request({
        method: 'POST',
        uri: 'https://www.googleapis.com/upload/gmail/v1/users/me/messages/send',
        headers: {
          Authorization: `Bearer ${googleClient.credentials.access_token}`,
          'Content-Type': 'multipart/related; boundary="foo_bar_baz"',
        },
        body,
      })
        .then(() => {
          resolve();
        })
        .catch((err) => {
          reject({
            status: false,
            error: err.message || err,
          });
        });
    } else if (/outlook|microsoft/.test(emailType)) {
      const token = msClient.createToken({
        refresh_token: currentUser.outlook_refresh_token,
        expires_in: 0,
      });
      token
        .refresh()
        .then((data) => {
          const accessToken = data.token.access_token;
          const client = graph.Client.init({
            authProvider: (done) => {
              done(null, accessToken);
            },
          });
          const sendMail = {
            message: {
              subject: emailSubject,
              body: {
                contentType: 'HTML',
                content: emailContent,
              },
              toRecipients: [
                {
                  emailAddress: {
                    address: userEmail,
                  },
                },
              ],
              from: {
                emailAddress: {
                  address: email,
                },
              },
            },
          };
          client
            .api('/me/sendMail')
            .post(sendMail)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              reject({
                status: false,
                error: err.message || err,
              });
            });
        })
        .catch(() => {
          reject({
            status: false,
            error: 'token is invalid',
          });
        });
    } else if (/smtp/.test(emailType)) {
      // smtp
    }
  });
};

const listMeetings = (req, res) => {
  const { currentUser } = req;
  Garbage.findOne({ user: currentUser._id })
    .then(async (_garbage) => {
      if (_garbage && _garbage.zoom) {
        const { refresh_token: old_refresh_token, email } = decryptInfo(
          _garbage.zoom,
          currentUser._id
        );
        const auth_client = await zoomHelper.updateRefreshToken(
          currentUser._id,
          old_refresh_token,
          email
        );
        zoomHelper
          .listMeeting({ access_token: auth_client.access_token })
          .then((data) => {
            res.send({
              data,
            });
          })
          .catch((err) => {
            sendErrorToSentry(currentUser, err);
            res.status(500).send({
              status: false,
              error: 'zoom_third_party_error',
            });
          });
      }
    })
    .catch((err) => {
      sendErrorToSentry(currentUser, err);
      res.status(500).send({
        status: false,
        error: 'internal_server_error',
      });
    });
};

const syncGoogleContact = async (req, res) => {
  const { currentUser } = req;
  const { googleClient } = getOauthClients(currentUser.source);
  const scopes = [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ];
  const redirect_uri =
    currentUser.source === 'vortex'
      ? urls.VORTEX_GOOGLE_CONTACT_URL
      : urls.GOOGLE_CONTACT_URL;
  const authorizationUri = googleClient.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    redirect_uri,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authGoogleContact = async (req, res) => {
  const user = req.currentUser;
  const { code } = req.query;
  await checkIdentityTokens(user);
  const { googleClient } = getOauthClients(user.source);
  const redirect_uri =
    user.source === 'vortex'
      ? urls.VORTEX_GOOGLE_CONTACT_URL
      : urls.GOOGLE_CONTACT_URL;
  const { tokens } = await googleClient.getToken({ code, redirect_uri });
  googleClient.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: googleClient,
    version: 'v2',
  });

  await oauth2.userinfo.v2.me.get((err, _res) => {
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }

    if (user.google_contact_list) {
      user.google_contact_list.push({
        connected_email: _res.data.email,
        google_refresh_token: JSON.stringify(tokens),
      });
    } else {
      user.google_contact_list = [
        {
          connected_email: _res.data.email,
          google_refresh_token: JSON.stringify(tokens),
        },
      ];
    }

    user.save().catch((err) => {
      console.log('user save err', err.message);
      return res.status(400).json({
        status: false,
        error: err.message,
      });
    });
  });

  const contactAuth2 = google.people({
    auth: googleClient,
    version: 'v1',
  });
  await contactAuth2.people.connections.list(
    {
      resourceName: 'people/me',
      personFields:
        'names,emailAddresses,phoneNumbers,urls,organizations,addresses,biographies',
    },
    function (err, _res) {
      if (err) {
        return res.status(400).json({
          status: false,
          error: err,
        });
      }
      if (!_res.data?.connections) {
        return res.send({
          status: true,
          data: null,
        });
      } else {
        const data = {
          first_name: [],
          last_name: [],
          website: [],
          company: [],
          address: [],
          city: [],
          country: [],
          state: [],
          zip: [],
          note: [],
        };
        const emailArray = [];
        const phoneArray = [];
        _res.data.connections.forEach((e) => {
          if (e.names) {
            data.first_name.push(e.names[0]?.givenName || '');
            data.last_name.push(e.names[0]?.familyName || '');
          } else {
            data.first_name.push('');
            data.last_name.push('');
          }
          if (e.emailAddresses) {
            emailArray.push(e.emailAddresses.length);
          } else {
            emailArray.push(0);
          }
          if (e.urls) {
            data.website.push(e.urls[0].value);
          } else {
            data.website.push('');
          }
          if (e.organizations) {
            data.company.push(e.organizations[0].name);
          } else {
            data.company.push('');
          }
          if (e.phoneNumbers) {
            phoneArray.push(e.phoneNumbers.length);
          } else {
            phoneArray.push(0);
          }
          if (e.addresses) {
            data.address.push(e.addresses[0]?.streetAddress || '');
            data.city.push(e.addresses[0]?.city || '');
            data.country.push(e.addresses[0]?.country || '');
            data.state.push(e.addresses[0]?.region || '');
            data.zip.push(e.addresses[0]?.postalcode || '');
          } else {
            data.address.push('');
            data.city.push('');
            data.country.push('');
            data.state.push('');
            data.zip.push('');
          }
          if (e.biographies) {
            data.note.push(e.biographies[0].value);
          } else {
            data.note.push('');
          }
        });
        const maxEmailLength = Math.max(...emailArray);
        const maxPhoneLength = Math.max(...phoneArray);
        _res.data.connections.forEach((e) => {
          for (let i = 0; i < maxEmailLength; i++) {
            if (!data[`email${i + 1}`]) {
              data[`email${i + 1}`] = [];
            }
            if (e.emailAddresses && e.emailAddresses[i]) {
              data[`email${i + 1}`].push(e.emailAddresses[i].value);
            } else {
              data[`email${i + 1}`].push('');
            }
          }
          for (let i = 0; i < maxPhoneLength; i++) {
            if (!data[`phone${i + 1}`]) {
              data[`phone${i + 1}`] = [];
            }
            if (e.phoneNumbers && e.phoneNumbers[i]) {
              data[`phone${i + 1}`].push(e.phoneNumbers[i].canonicalForm);
            } else {
              data[`phone${i + 1}`].push('');
            }
          }
        });
        return res.send({
          status: true,
          data,
        });
      }
    }
  );
};

const create = async (req, res) => {
  const errors = validationResult(req);
  const errMsg = [];
  if (errors.array().length) {
    for (let i = 0; i < errors.array().length; i++) {
      errMsg.push(errors.array()[i].msg);
    }
  }
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errMsg,
    });
  }

  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  }).catch((err) => {
    console.log('user find err in signup', err.message);
  });

  if (_user) {
    const user = _user._doc;
    userProfileOutputGuard(user);

    const defatulCommunityId = system_settings.DEFAULT_REDX_COMMUNITY_ID;
    // Donwload material library
    try {
      await downloadCommunityMaterials(user._id, defatulCommunityId);
    } catch (error) {
      console.log('download materials err', error.message);
    }
    // Download tempalte library
    try {
      await downloadCommunityTemplates(user._id, defatulCommunityId);
    } catch (error) {
      console.log('download templates err', error.message);
    }
    // Download automations library
    try {
      await downloadCommunityAutomations(user._id, defatulCommunityId);
    } catch (error) {
      console.log('download automations err', error.message);
    }
    // Download pipeline
    try {
      await downloadCommunityPipelines(user._id, defatulCommunityId);
    } catch (error) {
      console.log('download pipelines err', error.message);
    }

    return res.send({
      status: false,
      data: user,
    });
  }

  const user_data = {
    ...req.body,
    package_level: req.body.level,
    is_free: true,
    source: 'vortex',
  };

  createUser(user_data)
    .then(async (_res) => {
      if (_res && _res.status) {
        const newUser = _res.data.user;
        if (newUser) {
          await LabelHelper.createDefaultLabels(newUser._id);

          const defatulCommunityId = system_settings.DEFAULT_REDX_COMMUNITY_ID;
          // Donwload material library
          try {
            await downloadCommunityMaterials(newUser._id, defatulCommunityId);
          } catch (error) {
            console.log('download materials err', error.message);
          }
          // Download tempalte library
          try {
            await downloadCommunityTemplates(newUser._id, defatulCommunityId);
          } catch (error) {
            console.log('download templates err', error.message);
          }
          // Download automations library
          try {
            await downloadCommunityAutomations(newUser._id, defatulCommunityId);
          } catch (error) {
            console.log('download automations err', error.message);
          }
          // Download pipeline
          try {
            await downloadCommunityPipelines(newUser._id, defatulCommunityId);
          } catch (error) {
            console.log('download pipelines err', error.message);
          }
        }
        return res.send({
          status: true,
          data: _res.data,
        });
      } else {
        res.status(400).send({
          status: false,
          error: _res.error || 'Unknown Error',
        });
      }
    })
    .catch((err) => {
      console.log('user create err', err);
      sendErrorToSentry('', err);
      res.status(500).send({
        status: false,
        error: err,
      });
    });
};

const onAddedPaymentToSubAccount = async (req, res) => {
  const { currentUser } = req;
  const user = await User.findOne({ _id: currentUser._id, del: false }).catch(
    (err) => {
      console.log('user found err', err.message);
    }
  );
  if (
    user.billing_access_enabled &&
    !user.team_stay_enabled &&
    user.organization
  ) {
    getUserOrganization(user);
    const owner = user.organization?.owner;

    await User.updateOne(
      { _id: currentUser._id, del: false },
      {
        $unset: {
          organization: true,
        },
      }
    ).catch((err) => {
      console.log('sub account update error', err.message);
    });
    if (owner) {
      await Team.updateOne(
        {
          owner,
          is_internal: true,
        },
        {
          $pull: {
            members: [currentUser._id],
          },
        }
      ).catch((err) => {
        console.log('team update error', err.message);
      });

      // TODO: remove the member from organization
    }
  }
  return res.send({
    status: true,
  });
};

const onUpdateMyLink = async (req, res) => {
  const { currentUser } = req;
  const { myLink } = req.body;

  const sameNickNameUsers = await User.find({
    nick_name: myLink,
    _id: { $ne: currentUser._id },
  });

  if (sameNickNameUsers.length) {
    return res.status(400).send({
      status: false,
      error: 'same Link already exists',
    });
  }
  await User.updateOne(
    { _id: currentUser._id, del: false },
    {
      $set: {
        nick_name: myLink,
      },
    }
  ).catch((err) => {
    return res.status(400).send({
      status: false,
      error: 'Link update error',
    });
  });

  return res.send({
    status: true,
  });
};

const reports = async (req, res) => {
  const { currentUser } = req;
  const { duration } = req.body;
  const date = moment().subtract(duration, 'days').toDate();

  const calls = await PhoneLog.countDocuments({
    user: currentUser.id,
    created_at: { $gte: date },
  }).catch((err) => {
    console.log('get call count failed', err);
  });
  const texts = await Text.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
        type: 0,
      },
    },
    {
      $group: {
        _id: null,
        count: {
          $sum: { $size: '$contacts' },
        },
      },
    },
  ]).catch((err) => {
    console.log('get text count failed', err);
  });
  const emails = await Email.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
        type: 0,
      },
    },
    {
      $group: {
        _id: null,
        count: {
          $sum: { $size: '$contacts' },
        },
      },
    },
  ]).catch((err) => {
    console.log('get email count failed', err);
  });
  const tasks = await FollowUp.countDocuments({
    user: currentUser.id,
    status: 1,
    created_at: { $gte: date },
  }).catch((err) => {
    console.log('get task count failed', err);
  });
  const appointments = await Appointment.countDocuments({
    user: currentUser.id,
    type: 0,
    created_at: { $gte: date },
  }).catch((err) => {
    console.log('get appointment count failed', err);
  });

  return res.send({
    status: true,
    data: {
      calls,
      texts: texts[0] ? texts[0].count : 0,
      emails: emails[0] ? emails[0].count : 0,
      tasks,
      appointments,
    },
  });
};

const resumeAccount = async (req, res) => {
  const { currentUser } = req;
  try {
    const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (error) => {
        throw new Error(error);
      }
    );
    if (!payment) throw new Error('Invalid payment');

    await resumeSubscriptionHelper(payment['subscription']).catch((error) => {
      throw new Error(error);
    });

    await activeUserHelper(currentUser._id).catch((error) => {
      throw new Error(error);
    });
    return res.send({
      status: true,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const renewAccount = async (req, res) => {
  const { currentUser } = req;
  try {
    const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (error) => {
        throw new Error(error);
      }
    );
    if (!payment) throw new Error('Invalid payment');
    const { payment: new_payment } = await createSubscriptionHelper({
      email: req.body.email,
      customer_id: payment.customer_id,
      plan_id: api.STRIPE.PLAN[currentUser.package_level],
      is_trial: false,
      description: 'renew account',
      is_payment_new: true,
    }).catch(() => {
      throw new Error('Can`t create subscription.');
    });

    await User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          payment: new_payment._id,
        },
      }
    ).catch((error) => {
      throw new Error(error);
    });
    return res.send({
      status: true,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const verifyConnectionStatus = async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const garbage = await Garbage.findOne({ user: currentUser._id });

    await checkIdentityTokens(currentUser);

    let changed = false;

    if (
      garbage.onboarding_status.email !== 'completed' &&
      currentUser.primary_connected
    ) {
      garbage.onboarding_status.email = 'completed';
      changed = true;
    }

    if (
      garbage.onboarding_status.calendar !== 'completed' &&
      currentUser.calendar_connected
    ) {
      garbage.onboarding_status.calendar = 'completed';
      changed = true;
    }

    if (changed) {
      await garbage.save();
    }

    return res.status(200).json({
      onboarding_status: garbage.onboarding_status,
    });
  } catch (error) {
    console.error('Error verifying connection status:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  signUp,
  signUpMobile,
  login,
  create,
  extensionLogin,
  extensionSignup,
  logout,
  sendWelcomeEmail,
  socialSignUp,
  socialSignUpMobile,
  socialExtensionSignup,
  socialLogin,
  socialExtensionLogin,
  extensionUpgrade,
  extensionUpgradeWeb,
  signUpGmail,
  signUpOutlook,
  socialGmail,
  socialOutlook,
  appSocial,
  appSocialCallback,
  appSocialRegister,
  appSocialRegisterCallback,
  appGoogleSignIn,
  appOutlookSignIn,
  getMe,
  getMyInfo,
  getUserStatistics,
  editMe,
  getUser,
  searchUserEmail,
  searchNickName,
  searchPhone,
  resetPasswordByOld,
  resetPasswordByCode,
  forgotPassword,
  createPassword,
  syncOutlook,
  authorizeOutlook,
  syncGmail,
  authorizeGmail,
  syncYahoo,
  authorizeYahoo,
  authorizeOtherEmailer,
  syncGoogleCalendar,
  authorizeGoogleCalendar,
  syncOutlookCalendar,
  authorizeOutlookCalendar,
  disconnectCalendar,
  authorizeZoom,
  syncZoom,
  schedulePaidDemo,
  scheduledPaidDemo,
  generateSyncSocialLink,
  syncSocialRedirect,
  dailyReport,
  desktopNotification,
  disconDaily,
  disconWeekly,
  disconnectEmail,
  weeklyReport,
  disableAccount,
  connectAnotherEmail,
  pushNotification,
  checkDowngrade,
  updatePackage,
  getCallToken,
  easyLoadSubAccounts,
  getSubAccounts,
  switchAccount,
  editSubAccount,
  removeSubAccount,
  recallSubAccount,
  updateDraft,
  contactUs,
  sleepAccount,
  generateBuilderToken,
  syncSMTP,
  authorizeSMTP,
  authorizeSMTPCode,
  createEmailAlias,
  updateEmailAlias,
  requestEmailAliasVerification,
  addNick,
  listMeetings,
  syncGoogleContact,
  authGoogleContact,
  onAddedPaymentToSubAccount,
  onUpdateMyLink,
  newSubAccount,
  reports,
  resumeAccount,
  renewAccount,
  getMyInfo2Ucraft,
  updateFirebaseToken,
  disableRequest,
  getWavvID,
  getTeamInfo,
  verifyConnectionStatus,
};
