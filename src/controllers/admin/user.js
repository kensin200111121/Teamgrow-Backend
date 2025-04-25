const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
var nodemailer = require('nodemailer');

const User = require('../../models/user');
const Garbage = require('../../models/garbage');
const Payment = require('../../models/payment');

const {
  updateSubscription: updateSubscriptionHelper,
  cancelSubscription: cancelSubscriptionHelper,
  pauseSubscription: pauseSubscriptionHelper,
} = require('../../helpers/payment');

const api = require('../../configs/api');
const system_settings = require('../../configs/system_settings');
const { sendErrorToSentry } = require('../../helpers/utility');
const {
  createUser,
  setPackage,
  releaseData,
  clearData,
  suspendData,
  userProfileOutputGuard,
  disableUser: disableUserHelper,
  suspendUser: suspendUserHelper,
  removeUser: removeUserHelper,
  pauseUser: pauseUserHelper,
  activeUser: activeUserHelper,
  sleepUser: sleepUserHelper,
  setPackage: setPackageHelper,
} = require('../../helpers/user');
const {
  sendUpdatePackageNotificationEmail,
} = require('../../helpers/notification');
const {
  getMe: getMeAccount,
  getUserStatistics: getUserStatisticsAccount,
  disableAccount,
  sleepAccount,
  resumeAccount,
  renewAccount,
  checkDowngrade: checkDowngradeAccount,
  getSubAccounts: getSubAccountsAccount,
} = require('../user');

const {
  proceedInvoice,
  getCards: getCardsAccount,
  get: getPaymentAccount,
} = require('../payment');
const { getUserTimezone } = require('../../helpers/utility');
const { getTwilio } = require('../../helpers/text');
const { createTwilioNumber } = require('../text');

const signUp = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }

  const { password } = req.body;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
    .toString('hex');
  const user = new User({
    ...req.body,
    salt,
    hash,
    role: 'admin',
  });

  user
    .save()
    .then((_res) => {
      const myJSON = JSON.stringify(_res);
      const data = JSON.parse(myJSON);
      delete data.hash;
      delete data.salt;
      res.send({
        status: true,
        data,
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
      return res.status(500).send({
        status: false,
        error: errors || e,
      });
    });
};

const login = async (req, res) => {
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

  let _user = await User.findOne({ email, role: 'admin', del: false }).exec();

  if (!_user) {
    _user = await User.findOne({ user_name, role: 'admin', del: false }).exec();
  }

  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'Invalid email or password!',
    });
  }

  // Check password
  const hash = crypto
    .pbkdf2Sync(password, _user.salt.split(' ')[0], 10000, 512, 'sha512')
    .toString('hex');
  if (hash !== _user.hash) {
    return res.status(401).json({
      status: false,
      error: 'Invalid email or password!',
    });
  }

  // TODO: Include only email for now
  const token = jwt.sign(
    { id: _user.id, salt: _user.salt.split(' ')[0] },
    api.ADMIN_JWT_SECERT,
    {
      expiresIn: '30d',
    }
  );

  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);
  userProfileOutputGuard(user);

  // prevent user's password to be returned
  delete user.password;
  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const getMe = async (req, res) => {
  req.is_admin = true;
  getMeAccount(req, res);
};

const getPaymentCards = async (req, res) => {
  getCardsAccount(req, res);
};

const getPaymentInfo = async (req, res) => {
  getPaymentAccount(req, res);
};

const getUserStatistics = async (req, res) => {
  getUserStatisticsAccount(req, res);
};

const getGarbageAccesseToken = async (req, res) => {
  const { currentUser } = req;
  const token = jwt.sign(
    { id: currentUser.id, api_loggin: true },
    api.APP_JWT_SECRET
  );
  return res.send({
    status: true,
    token,
  });
};

const checkDowngrade = async (req, res) => {
  checkDowngradeAccount(req, res);
};

const getSubAccounts = async (req, res) => {
  const { currentUser } = req;
  if (
    currentUser.is_primary &&
    currentUser.organization_info?.is_enabled &&
    currentUser.organization
  ) {
    const users = await User.find({
      organization: currentUser.organization,
      del: false,
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

const editMe = async (req, res) => {
  const user = req.currentUser;

  const editData = req.body;
  // TODO: should limit the editing fields here
  delete editData.password;

  for (const key in editData) {
    user[key] = editData[key];
  }

  user
    .save()
    .then((_res) => {
      const myJSON = JSON.stringify(_res);
      const data = JSON.parse(myJSON);
      delete data.hash;
      delete data.salt;
      res.send({
        status: true,
        data,
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
      return res.status(500).send({
        status: false,
        error: errors || e,
      });
    });
};

const exportUsers = async (req, res) => {
  const { ids } = req.body;
  let _users;
  if (ids && ids.length) {
    _users = await User.find({
      _id: { $in: ids },
      del: true,
    }).select({
      email: true,
      user_name: true,
      cell_phone: true,
      learn_more: true,
      twilio_number: true,
      location: true,
    });
  } else {
    _users = await User.find({
      del: true,
    }).select({
      email: true,
      user_name: true,
      cell_phone: true,
      learn_more: true,
      twilio_number: true,
      location: true,
    });
  }
  if (!_users) {
    return res.status(400).json({
      status: false,
      error: 'Users doesn`t exist',
    });
  }
  return res.send({
    status: true,
    data: _users,
  });
};

const getProfile = async (req, res) => {
  const { id } = req.params;
  const user = await User.findOne({ _id: id })
    .populate('payment')
    .catch(() => {
      return res.status(400).json({
        status: false,
        error: 'User doesn`t exist',
      });
    });

  res.send({
    status: true,
    data: user,
  });
};

const searchNumbers = async (req, res) => {
  const { id } = req.params;
  const { dialCode = '+1', countryCode = 'US', searchCode } = req.body;

  const currentUser = await User.findOne({ _id: id }).catch(() => {
    return res.status(400).json({
      status: false,
      error: 'User doesn`t exist',
    });
  });

  let areaCode;
  const data = [];
  const phone = currentUser.phone;
  if (searchCode) {
    areaCode = searchCode;
  } else {
    if (phone && phone.number) {
      areaCode = phone.number.replace(/\s|\(|\)|\-|\+/g, '').substring(0, 3);
    } else {
      areaCode = currentUser.cell_phone
        .replace(/\s|\(|\)|\-|\+/g, '')
        .substring(1, 4);
    }
  }

  const search_code = areaCode;

  const { twilio: client } = await getTwilio(currentUser._id);

  if (search_code) {
    client
      .availablePhoneNumbers(countryCode)
      .local.list({
        contains: `${dialCode}${search_code}`,
      })
      .then(async (response) => {
        const number = response[0];

        if (typeof number === 'undefined' || number === '+') {
          return res.send({
            status: true,
            data: [],
          });
        } else {
          const length = response.length > 5 ? 5 : response.length;
          for (let i = 0; i < length; i++) {
            data.push({
              number: response[i].phoneNumber,
              region: response[i].region,
              locality: response[i].locality,
            });
          }

          return res.send({
            status: true,
            data,
          });
        }
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err.message || err,
        });
      });
  } else {
    return res.send({
      status: true,
      data,
    });
  }
};

const updateNumber = async (req, res) => {
  const { id } = req.params;

  const currentUser = await User.findOne({ _id: id }).catch(() => {
    return res.status(400).json({
      status: false,
      error: 'User doesn`t exist',
    });
  });

  if (!req.body.number) {
    return res.status(400).json({
      status: false,
      error: 'Please select the number',
    });
  }

  return createTwilioNumber(currentUser, req.body.number, res);
};

const resetPassword = async (req, res) => {
  const { user_id, new_password } = req.body;
  console.log('user_id', user_id);
  const _user = await User.findOne({ _id: user_id });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(new_password, salt, 10000, 512, 'sha512')
    .toString('hex');

  _user.salt = salt;
  _user.hash = hash;
  _user
    .save()
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const create = async (req, res) => {
  try {
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

    if (_user != null) {
      res.status(400).send({
        status: false,
        error: 'User already exists',
      });
    }

    const { level } = req.body;
    const user_data = {
      ...req.body,
      is_free: true,
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

const updateUser = async (req, res) => {
  const query = { ...req.body };

  if (query.package_level) {
    let { package_level: level } = query;
    const user = await User.findById(req.params.id);

    if (query.is_minimal) {
      level = system_settings.MINIMAL_PACKAGE;
    }

    updateSubscriptionHelper({
      payment_id: user.payment,
      type: 'update',
      level,
    }).catch((err) => {
      return res.status(400).json({
        status: false,
        error: 'Please correct your card',
      });
    });

    const data = {
      user: req.params.id,
      level: query.package_level,
    };

    setPackage(data).catch((err) => {
      console.log('set package err', err.message);
    });
  }

  if (query.phone) {
    query.cell_phone = query['phone'];
  }

  User.updateOne(
    {
      _id: req.params.id,
    },
    {
      $set: {
        ...query,
        is_minimal: !!query.is_minimal,
      },
    }
  ).catch((err) => {
    console.log('user updae package err', err.message);
  });

  return res.send({
    status: true,
  });
};

/// ///////////////////// 2023-9-20 /////////////////////////////////////
const disableUser = async (req, res) => {
  const { currentUser } = req;
  const { check_payment } = req.body;
  req.body.close_reason = 'disabled by Administrator';
  if (!check_payment) {
    await disableUserHelper({
      _id: currentUser._id,
      close_reason: req.body.close_reason,
      is_immediately: true,
    }).catch((error) => {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
    return res.send({
      status: true,
    });
  } else disableAccount(req, res);
};

const sleepUser = async (req, res) => {
  const { currentUser } = req;
  const { check_payment } = req.body;
  if (!check_payment) {
    await sleepUserHelper(currentUser).catch(() => {
      return res.status(400).json({
        status: false,
        error: 'falied sleep account.',
      });
    });

    return res.send({
      status: true,
    });
  } else sleepAccount(req, res);
};

const suspendUser = async (req, res) => {
  const { currentUser } = req;
  suspendData(currentUser.id);
  const { check_payment } = req.body;
  if (!check_payment) {
    await suspendUserHelper(currentUser._id).catch((error) => {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
    return res.send({
      status: true,
    });
  } else {
    const payment = await Payment.findOne({ _id: currentUser.payment });
    if (!payment) {
      return res.status(400).json({
        status: false,
        error: 'There is no payment for user',
      });
    }

    await cancelSubscriptionHelper({ subscription: payment.subscription })
      .then(() => {
        return res.status(200).json({
          status: true,
        });
      })
      .catch((error) => {
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
  }
};

const removeUser = async (req, res) => {
  const { currentUser } = req;
  const { keep_user, keep_payment } = req.body;
  suspendData(currentUser.id);
  releaseData(currentUser.id);
  await clearData(currentUser.id, keep_payment);
  if (!keep_user) {
    await removeUserHelper(currentUser._id).catch((error) => {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
  }
  return res.send({
    status: true,
  });
};

const resumeUser = async (req, res) => {
  const { currentUser } = req;
  const { check_payment } = req.body;
  if (!check_payment) {
    await activeUserHelper(currentUser._id).catch((error) => {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
    return res.send({
      status: true,
    });
  } else {
    resumeAccount(req, res);
  }
};

const trialUser = async (req, res) => {
  const { currentUser } = req;
  const { trial } = req.body.param;
  try {
    await User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          is_trial: trial,
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

const enableLoginUser = async (req, res) => {
  const { currentUser } = req;
  const { enablelogin } = req.body.param;
  try {
    await User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          login_enabled: enablelogin,
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

const pauseUser = async (req, res) => {
  const { currentUser } = req;
  const payment = await Payment.findOne({ _id: currentUser.payment });

  if (!payment) {
    return res.status(400).json({
      status: false,
      error: 'There is no payment for user',
    });
  }
  try {
    await pauseSubscriptionHelper(payment.subscription).catch((error) => {
      throw new Error(error);
    });
    await pauseUserHelper(currentUser._id).catch((error) => {
      throw new Error(error);
    });
    return res.send({
      status: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const renewUser = async (req, res) => {
  const { currentUser } = req;
  const { check_payment } = req.body;
  if (!check_payment) {
    const data = {
      'subscription.is_suspended': currentUser.package_level === 'SLEEP',
    };
    await activeUserHelper(currentUser._id, data).catch((error) => {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
    return res.send({
      status: true,
    });
  } else renewAccount(req, res);
};

const proceedInvoiceUser = async (req, res) => {
  const { currentUser } = req;
  const { check_payment } = req.body;
  if (!check_payment) {
    await activeUserHelper(currentUser._id).catch((error) => {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
    return res.send({
      status: true,
    });
  } else proceedInvoice(req, res);
};

const updatePackageUser = async (req, res) => {
  const { currentUser } = req;
  const { check_payment } = req.body;
  let level = req.body.level;
  if (
    (currentUser.twilio_number ||
      currentUser.wavv_status?.value === 'APPROVED') &&
    currentUser.user_version < 2.3 &&
    level === 'GROWTH'
  ) {
    level = 'GROWTH_PLUS_TEXT';
  }
  if (check_payment) {
    try {
      await updateSubscriptionHelper({
        payment_id: currentUser.payment,
        type: 'update',
        level,
      });
    } catch (err) {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    }
  }
  sendUpdatePackageNotificationEmail(currentUser, level);
  setPackageHelper({
    user: currentUser.id,
    level,
  }).catch((err) => {
    console.log('set package err', err.message);
  });
  return res.send({
    status: true,
  });
};
/// /////////////////////////////////////////////////////////////////////////////

const getUsers = async (req, res) => {
  let { field, dir } = req.body;
  const { type, limit, page, search, selectedFilters, wavvStatus } = req.body;
  const skip = (page - 1) * limit;

  let filterKeys = [];
  if (selectedFilters !== undefined) filterKeys = Object.keys(selectedFilters);

  dir = dir ? 1 : -1;
  if (field === 'last_logged') {
    field = 'last_logged';
    dir *= -1;
  } else if (field === 'alpha_up') {
    field = 'user_name';
    dir = -1;
  } else if (field === 'alpha_down') {
    field = 'user_name';
    dir = 1;
  } else if (field === 'payment') {
    field = 'payment';
  } else {
    field = 'created_at';
  }
  let filter = {};
  switch (type) {
    case 'active':
      filter = {
        del: false,
        'subscription.is_failed': { $ne: true },
      };
      break;
    case 'deleted':
      filter = { del: true };
      break;
    case 'suspended':
      filter = {
        del: false,
        'subscription.is_failed': true,
      };
      break;
  }
  const typeFilters = [];
  const statusConditions = [];
  const sourceConditions = [];
  const packageConditions = [];

  for (let i = 0; i < filterKeys.length; i++) {
    switch (filterKeys[i]) {
      case 'type':
        if (
          selectedFilters[filterKeys[i]].includes('primary') &&
          selectedFilters[filterKeys[i]].includes('subaccount')
        ) {
          break;
        }
        if (selectedFilters[filterKeys[i]].includes('primary')) {
          typeFilters.push({ is_primary: true });
        }
        if (selectedFilters[filterKeys[i]].includes('subaccount')) {
          typeFilters.push({ is_primary: false });
        }
        break;

      case 'source':
        sourceConditions.push(
          ...selectedFilters[filterKeys[i]].map((ft) => {
            if (ft === 'crmgrow') {
              return { $or: [{ source: { $exists: false } }, { source: ft }] };
            }
            return { source: ft };
          })
        );
        if (sourceConditions.length > 0)
          typeFilters.push({ $or: [...sourceConditions] });
        break;

      case 'package':
        packageConditions.push(
          ...selectedFilters[filterKeys[i]].map((ft) => {
            if (ft === 'PRO') {
              return {
                $or: [
                  { package_level: { $exists: false } },
                  { package_level: ft },
                ],
              };
            }
            return { package_level: ft };
          })
        );
        if (packageConditions.length > 0)
          typeFilters.push({ $or: [...packageConditions] });
        break;

      case 'status':
        if (selectedFilters[filterKeys[i]].includes('active')) {
          statusConditions.push({
            user_disabled: false,
            'subscription.is_failed': false,
            'subscription.is_suspended': false,
          });
        }
        if (selectedFilters[filterKeys[i]].includes('disable')) {
          statusConditions.push({
            user_disabled: true,
            'subscription.is_failed': false,
          });
        }
        if (selectedFilters[filterKeys[i]].includes('sleep')) {
          statusConditions.push({
            user_disabled: false,
            'subscription.is_failed': false,
            'subscription.is_suspended': true,
          });
        }
        if (selectedFilters[filterKeys[i]].includes('pause')) {
          statusConditions.push({
            user_disabled: false,
            'subscription.is_failed': false,
            'subscription.is_suspended': false,
            'subscription.is_paused': true,
          });
        }
        if (selectedFilters[filterKeys[i]].includes('trial')) {
          statusConditions.push({
            is_trial: true,
          });
        }
        if (statusConditions.length > 0)
          typeFilters.push({ $or: [...statusConditions] });
        break;
      case 'account':
        typeFilters.push(
          ...selectedFilters[filterKeys[i]].map((e) => ({
            email: e,
          }))
        );
        break;
      case 'started_date':
        if (selectedFilters[filterKeys[i]].length === 2) {
          const startDate = new Date(selectedFilters[filterKeys[i]][0]);
          const endDate = new Date(selectedFilters[filterKeys[i]][1]);
          typeFilters.push({
            created_at: {
              $gte: startDate.toISOString(),
              $lte: endDate.toISOString(),
            },
          });
        }
        break;
      case 'campaign_users':
        typeFilters.push({ [selectedFilters[filterKeys[i]]]: true });
        break;
    }
  }

  if (typeFilters.length > 0) filter = { ...filter, $and: [...typeFilters] };

  const payment_query = {
    customer_id: { $regex: search, $options: 'i' },
  };

  const paymentIDs = await Payment.find(payment_query, { _id: 1 });

  const query = [
    {
      $or: [
        { user_name: { $regex: `.*${search}.*`, $options: 'i' } },
        { email: { $regex: `.*${search}.*`, $options: 'i' } },
        {
          cell_phone: { $regex: `.*${search}.*`, $options: 'i' },
        },
        { payment: { $in: paymentIDs.map((id) => id._id) } },
      ],
    },
    filter,
  ];

  if (wavvStatus && wavvStatus?.value.id) {
    query.push({ 'wavv_status.value': wavvStatus.value.id });
  }

  const wavvDate = new Date();

  if (wavvStatus?.date.id === 'day') {
    wavvDate.setDate(wavvDate.getDate() - 1);
  } else if (wavvStatus?.date.id === 'week') {
    wavvDate.setDate(wavvDate.getDate() - 7);
  } else if (wavvStatus?.date.id === 'month') {
    wavvDate.setMonth(wavvDate.getMonth() - 1);
  }
  if (wavvStatus && wavvStatus?.date.id !== '')
    query.push({ 'wavv_status.updated_at': { $gt: wavvDate } });

  const users = await User.find({
    $and: query,
  })
    .sort({ [field]: dir })
    .skip(skip)
    .limit(limit)
    .catch((err) => {
      console.log('users loading is failed', err.message);
    });

  const total = await User.countDocuments({
    $and: query,
  });
  return res.send({
    status: true,
    data: {
      users,
      total,
    },
  });
};

const getUsersAll = async (req, res) => {
  let { field, dir } = req.body;
  const { type, search } = req.body;

  dir = dir ? 1 : -1;
  if (field === 'last_logged') {
    field = 'last_logged';
    dir *= -1;
  } else if (field === 'alpha_up') {
    field = 'user_name';
    dir = -1;
  } else if (field === 'alpha_down') {
    field = 'user_name';
    dir = 1;
  } else if (field === 'payment') {
    field = 'payment';
  } else {
    field = 'created_at';
  }
  let filter = {};
  switch (type) {
    case 'active':
      filter = {
        del: false,
        'subscription.is_failed': { $ne: true },
      };
      break;
    case 'deleted':
      filter = { del: true };
      break;
    case 'suspended':
      filter = {
        del: false,
        'subscription.is_failed': true,
      };
      break;
  }
  const query = [
    {
      $or: [
        { user_name: { $regex: `.*${search}.*`, $options: 'i' } },
        { email: { $regex: `.*${search}.*`, $options: 'i' } },
        {
          cell_phone: { $regex: `.*${search}.*`, $options: 'i' },
        },
      ],
    },
    filter,
  ];
  const users = await User.find({
    $and: query,
  })
    .sort({ [field]: dir })
    // .skip(skip)
    // .limit(limit)
    .catch((err) => {
      console.log('users loading is failed', err.message);
    });

  const total = await User.countDocuments({
    $and: query,
  });

  return res.send({
    status: true,
    data: {
      users,
      total,
    },
  });
};

const checkSmtp = async (req, res) => {
  const userId = req.param.user;
  const func = req.param.func;
  const field = req.param.field;

  let smtpInfo;
  if (field === 'garbage') {
    const garbage = await Garbage.findOne({
      user: mongoose.Types.ObjectId(userId),
    });
    if (!garbage) {
      return res.status(400).send({
        error: 'Garbage does not exist',
      });
    }
    smtpInfo = garbage.smtp_info;
  } else {
    const user = await User.findOne({
      _id: mongoose.Types.ObjectId(userId),
    });
    if (!user) {
      return res.status(400).send({
        error: 'User does not exist',
      });
    }
    smtpInfo = user.smtp_info;
  }

  if (!smtpInfo) {
    return res.status(400).send({
      error: 'Smtp Info does not exist',
    });
  }

  const smtpOption = {
    port: smtpInfo.port,
    host: smtpInfo.host,
    secure: smtpInfo.secure,
    auth: {
      user: smtpInfo.user,
      pass: smtpInfo.pass,
    },
    debug: true,
  };

  if (!smtpInfo.secure) {
    smtpOption['tls'] = {
      // do not fail on invalid certs
      rejectUnauthorized: false,
    };
  }

  const smtpTransporter = nodemailer.createTransport(smtpOption);

  if (func === 'verify') {
    smtpTransporter.verify((err, info) => {
      if (err) {
        return res.status(400).send({
          error: err,
        });
      }
      return res.status(200).send({
        message: 'verified',
        info,
      });
    });
  } else {
    const body = req.body || {
      email: 'jian@crmgrow.com',
      content: 'This is smtp email sending test.',
      subject: 'crmgrow smtp check',
    };
    var mailOptions = {
      from: `crmgrow smtp tester <${smtpInfo.email}>`,
      to: body.email,
      text: body.content,
      subject: body.subject,
      html: body.content,
      attachments: [],
    };
    smtpTransporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        return res.status(400).send({
          error: err,
        });
      }
      return res.status(200).send({
        message: 'sent',
        info,
      });
    });
  }
};

module.exports = {
  signUp,
  login,
  getMe,
  getPaymentCards,
  getPaymentInfo,
  getGarbageAccesseToken,
  getUserStatistics,
  checkDowngrade,
  getSubAccounts,
  editMe,
  getProfile,
  resetPassword,
  create,
  updateUser,
  /// //////// 2023/9/20 //////////////
  suspendUser,
  removeUser,
  sleepUser,
  disableUser,
  resumeUser,
  trialUser,
  enableLoginUser,
  pauseUser,
  renewUser,
  proceedInvoiceUser,
  updatePackageUser,
  /// /////////////////////////////////
  getUsers,
  getUsersAll,
  exportUsers,
  checkSmtp,
  searchNumbers,
  updateNumber,
};
