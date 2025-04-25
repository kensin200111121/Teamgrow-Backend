const crypto = require('crypto');
const User = require('../models/user');
const Guest = require('../models/guest');
const Blacklist = require('../models/blacklist');
const jwt = require('jsonwebtoken');
const api = require('../configs/api');
const { decrypt, trackApiRequest } = require('../helpers/utility');
const Whitelist = require('../models/whitelist');
const { isProduction } = require('../constants/env');

const checkAppJwtAuth = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.APP_JWT_SECRET);
  } catch (err) {
    console.log('check verify error', err.message || err.msg);
  }

  if (!decoded) {
    return res.status(401).send({
      status: false,
      error: 'Authorization failed',
    });
  }

  let additionalCheckQuery;
  if (!isProduction) {
    additionalCheckQuery = {
      $or: [{ _id: decoded.id }, { vortex_matched_id: decoded.id }],
    };
  }

  req.currentUser = await User.findOne({
    ...(additionalCheckQuery || { _id: decoded.id }),
    del: false,
    extension_single: false,
  }).catch((err) => {
    console.log('err', err);
  });

  if (req.currentUser) {
    if (!decoded.salt) {
      next();
    } else if (req.currentUser.salt?.split(' ')[0] === decoded.salt) {
      if (decoded.guest_loggin) {
        req.guest_loggin = true;
        req.guest = await Guest.findOne({
          _id: decoded.guest_id,
          disabled: false,
          user: req.currentUser._id,
        }).catch((err) => {
          console.log('Get guest error: ', err);
        });
      }
      if (decoded.is_admin) {
        req.is_admin = true;
      }
      next();
    }
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkAuthGuest = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.APP_JWT_SECRET);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  } catch (err) {
    console.log('check verify error', err.message || err.msg);
  }

  if (!decoded) {
    return res.status(401).send({
      status: false,
      error: 'Authorization failed',
    });
  }

  req.currentUser = await User.findOne({ _id: decoded.id }).catch((err) => {
    console.log('err', err);
  });

  if (req.currentUser) {
    if (!decoded.salt) {
      next();
    } else if (req.currentUser.salt?.split(' ')[0] === decoded.salt) {
      // console.info('Auth Success:', req.currentUser.email);

      if (decoded.guest_loggin) {
        return res.status(400).send({
          status: false,
          error: 'you have no access for this action',
        });
      } else {
        next();
      }
    }
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkSuspended = async (req, res, next) => {
  const { currentUser } = req;

  const subscription = currentUser['subscription'];
  if (subscription['is_suspended']) {
    res.status(400).send({
      status: false,
      error: 'Account is Suspended',
    });
  } else {
    next();
  }
};

const checkAuthExtension = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.APP_JWT_SECRET);
  } catch (err) {
    console.log('check verify error', err.message || err.msg);
  }

  if (!decoded) {
    return res.status(401).send({
      status: false,
      error: 'Authorization failed',
    });
  }

  req.currentUser = await User.findOne({
    _id: decoded.id,
    del: false,
  }).catch((err) => {
    console.log('err', err);
  });

  if (req.currentUser) {
    if (!decoded.salt) {
      next();
    } else if (req.currentUser.salt?.split(' ')[0] === decoded.salt) {
      if (decoded.guest_loggin) {
        req.guest_loggin = true;
      }
      if (decoded.is_admin) {
        req.is_admin = true;
      }
      next();
    }
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkGlobalAuth = (req, res, next) => {
  const token = req.get('Authorization');
  const access_token = req.get('x-api-key');
  if (token) {
    checkAppJwtAuth(req, res, next);
  } else if (access_token) {
    checkMicroAuth(req, res, next);
  } else {
    return res.status(401).send({
      status: false,
      error: 'Invalid Request',
    });
  }
};

const checkMicroAuth = async (req, res, next) => {
  const access_token = req.get('x-api-key');
  const jwt_token = req.get('Authorization');

  if (req.baseUrl === '/micro/contact') {
    trackApiRequest('contact_create_micro_auth', {
      header: { token: jwt_token },
      data: req.body,
    });
  }
  if (access_token && access_token === api.MICRO_ACCESS_TOKEN) {
    if (req.headers['service-name'] === 'automation') {
      req.mode = 'automation';
    }
    const userId = req.body?.userId || req.params?.userId || req.query?.userId;
    req.currentUser = await User.findOne({
      _id: userId,
      del: false,
    }).catch((err) => {
      console.log('err', err);
    });

    if (req.currentUser) {
      next();
    } else {
      return res.status(401).send({
        status: false,
        error: 'invalid_user',
      });
    }
  } else if (jwt_token) {
    let decoded;
    try {
      decoded = jwt.verify(jwt_token, api.APP_JWT_SECRET);
    } catch (err) {
      console.log('check verify error', err.message || err.msg);
    }

    if (!decoded) {
      return res.status(401).send({
        status: false,
        error: 'Authorization failed',
      });
    }

    const userId = decoded.id;
    req.currentUser = await User.findOne({
      _id: userId,
      del: false,
    }).catch((err) => {
      console.log('err', err);
    });

    if (req.currentUser) {
      next();
    } else {
      return res.status(401).send({
        status: false,
        error: 'invalid_user',
      });
    }
  } else {
    return res.status(401).send({
      status: false,
      error: 'Invalid token',
    });
  }
};

const checkMicroRequest = async (req, res, next) => {
  const access_token = req.get('x-api-key');
  if (access_token && access_token === api.MICRO_ACCESS_TOKEN) {
    if (req.headers['service-name'] === 'automation') {
      req.mode = 'automation';
    }
    next();
  } else {
    return res.status(401).send({
      status: false,
      error: 'Invalid token',
    });
  }
};

const checkApiKeyAuth = async (req, res, next) => {
  const token = api.API_ACCESS_TOKEN;
  if (token === req.headers['x-api-key']) {
    const decoded = req.body;
    const user = await User.findOne({
      _id: decoded.userID,
      del: false,
    }).catch((err) => {
      return res.status(200).send({
        status: false,
        error: err.message || err,
      });
    });
    if (user) {
      req.currentUser = user;
      next();
    } else {
      console.log('user is  not invalid');
      return res.status(200).send({
        status: false,
        error: 'User is not valid.',
      });
    }
  } else {
    console.log('header is not invalid');
    return res.status(200).send({
      status: false,
      error: 'Invalid Request.',
    });
  }
};

const checkConvrrtEvent = async (req, res, next) => {
  const hash = crypto
    .createHmac('sha256', api.API_JWT_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash === req.headers['x-event-signature']) {
    const decoded = req.body;
    const user = await User.findOne({
      _id: decoded.userID,
      del: false,
    }).catch((err) => {
      return res.status(200).send({
        status: false,
        error: err.message || err,
      });
    });
    if (user) {
      req.currentUser = user;
      const body = {};
      const formData = decoded.data.fields || [];
      formData.forEach((e) => {
        body[e.id] = e.value;
      });
      req.body = body;
      next();
    } else {
      console.log('user is  not invalid');
      return res.status(200).send({
        status: false,
        error: 'invalid_user',
      });
    }
  } else {
    console.log('header is not invalid');
    return res.status(200).send({
      status: false,
      error: 'invalid_request',
    });
  }
};

const checkLastLogin = async (req, res, next) => {
  const { currentUser } = req;
  if (!req['is_admin']) {
    User.updateOne(
      { _id: currentUser.id },
      { $set: { last_logged: new Date() } }
    ).catch((err) => {
      console.log('err', err.message);
    });
  }
  next();
};

const checkApiCryptoAuth = async (req, res, next) => {
  const token = req.get('Authorization');

  let decodedUserId;
  try {
    decodedUserId = decrypt(token, api.API_CRYPTO_SECRET);
  } catch (err) {
    return res.status(401).send({
      status: false,
      error: 'invalid_api_key',
    });
  }

  req.currentUser = await User.findOne({
    _id: decodedUserId,
    del: false,
    extension_single: false,
  }).catch((err) => {
    console.log('err', err);
  });

  if (req.currentUser) {
    next();
  } else {
    res.status(401).send({
      status: false,
      error: 'invalid_user_id',
    });
  }
};

const checkApiJwtAuth = async (req, res, next) => {
  const bearerToken = req.get('Authorization');
  const token = bearerToken.replace('Bearer ', '');
  let decoded;
  try {
    decoded = jwt.verify(token, api.API_JWT_SECRET);
  } catch (err) {
    // we will remove this section in one month ,  today was 8/21
    try {
      decoded = jwt.verify(token, api.APP_JWT_SECRET);
    } catch (err) {
      return res.status(401).send({
        status: false,
        error: err.message,
      });
    }
  }

  if (decoded.userId && decoded.isTest) {
    req.currentUser = {
      id: decoded.userId,
      email: decoded.email,
      user_name: 'Test user on stage',
      picture_profile: '',
    };
    return next();
  }

  const user = await User.findOne({
    _id: decoded.userId,
    del: false,
  }).catch((err) => {
    console.log('err', err);
  });

  if (user) {
    req.currentUser = user;
    req.mode = 'api';
    next();
  } else {
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkUserDisabled = async (req, res, next) => {
  const { currentUser } = req;
  if (currentUser.user_disabled) {
    res.status(400).send({
      status: false,
      error: 'user already is disabled',
    });
  } else {
    next();
  }
};

const checkUser = async (req, res) => {
  const { email } = req.body;
  const _user = await User.findOne({
    email: { $regex: new RegExp('^' + email + '$', 'i') },
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

const checkSignUpEmail = async (req, res, next) => {
  const { email } = req.body;
  if (process.env.NODE_ENV !== 'production') {
    const checkEmail = await Whitelist.findOne({ email, type: 'signup' });
    if (checkEmail) {
      next();
    } else {
      res.status(400).send({
        status: false,
        error: 'You cannot signup using this email: ' + email,
      });
    }
  } else {
    next();
  }
};
// it will use this for admin panel
const checkAdminJwtAuth = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.ADMIN_JWT_SECERT);
    console.info('Auth Success:', decoded);
  } catch (err) {
    console.error(err);
    return res.status(401).send({
      status: false,
      error: 'invalid_auth',
    });
    // err
  }

  req.currentAdminUser = await User.findOne({
    _id: decoded.id,
    role: 'admin',
    del: false,
  });

  if (
    req.currentAdminUser &&
    req.currentAdminUser.salt.split(' ')[0] === decoded.salt
  ) {
    const user_id = req.get('User-ID');
    const currentUser = await User.findOne({
      _id: user_id,
    });

    if (currentUser) {
      req.currentUser = currentUser;
    }
    next();
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkBlacklistIP = async (req, res, next) => {
  try {
    const getClientIP = (req) => {
      console.log('Client IP:', req);
      console.log('header :', req.headers);
      const forwarded = req.headers['x-forwarded-for'];
      return forwarded ? forwarded.split(',')[0] : req.ip;
    };

    const ip = getClientIP(req);

    const isBlacklisted = await Blacklist.findOne({ ip });

    if (isBlacklisted) {
      return res.status(403).json({
        success: false,
        message: 'Your IP address is blacklisted. You cannot sign up.',
      });
    }

    next();
  } catch (error) {
    console.error('Error checking blacklist:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while checking the blacklist.',
    });
  }
};

const checkBlackEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    const isBlacklisted = await Blacklist.findOne({
      $or: [{ value: email }, { value: '*' }],
    });

    if (isBlacklisted) {
      return res.status(400).json({
        status: false,
        error: 'You can not sign up with this email',
      });
    }

    next();
  } catch (error) {
    console.error('Error checking blacklist:', error);
    res.status(500).json({
      status: false,
      error: 'An error occurred while checking the blacklist.',
    });
  }
};

module.exports = {
  checkAppJwtAuth,
  checkAuthGuest,
  checkSuspended,
  checkAuthExtension,
  checkGlobalAuth,
  checkMicroAuth,
  checkAdminJwtAuth,
  checkMicroRequest,
  checkApiKeyAuth,
  checkConvrrtEvent,
  checkLastLogin,
  checkApiCryptoAuth,
  checkApiJwtAuth,
  checkUserDisabled,
  checkUser,
  checkSignUpEmail,
  checkBlacklistIP,
  checkBlackEmail,
};
