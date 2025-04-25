const User = require('../models/user');
const Garbage = require('../models/garbage');
const request = require('request-promise');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const api = require('../configs/api');
const randomstring = require('randomstring');
const { ZOOM: MESSAGE } = require('../constants/message');
const { refreshToken } = require('../helpers/zoom');
const { encryptInfo, decryptInfo } = require('../helpers/utility');
const { ENV_PATH } = require('../configs/path');
require('dotenv').config({ path: ENV_PATH });

const checkAuthCalendly = async (req, res) => {
  const { token } = req.body;
  const { currentUser } = req;
  request({
    method: 'GET',
    uri: `https://api.calendly.com/users/me`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    json: true,
  })
    .then((data) => {
      const {
        current_organization: organization,
        email,
        scheduling_url,
        timezone,
        uri: user_uri,
      } = data.resource;
      const calendly = {
        token,
        organization,
        email,
        scheduling_url,
        timezone,
        user_uri,
      };

      Garbage.updateOne({ user: currentUser.id }, { $set: { calendly } }).catch(
        (err) => {
          console.log('garbage update error', err.message);
        }
      );

      return res.send({
        status: true,
        data: {
          calendly,
        },
      });
    })
    .catch((err) => {
      return res.status(400).json({
        status: false,
        error: 'UnAuthorized',
      });
    });
};

const getCalendly = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('garbage found err');
    }
  );

  const { calendly } = garbage;

  if (calendly && calendly.token) {
    const { organization, user_uri, token } = calendly;
    const url = `https://api.calendly.com/event_types?user=${user_uri}&organization=${organization}`;

    request({
      method: 'GET',
      uri: url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      json: true,
    })
      .then((response) => {
        return res.send({
          status: true,
          data: response.collection,
        });
      })
      .catch((err) => {
        return res.status(400).json({
          status: false,
          error: 'UnAuthorized',
        });
      });
  } else {
    return res.json({
      status: true,
      data: [],
    });
  }
};

const setEventCalendly = async (req, res) => {
  const { currentUser } = req;
  const { id, link } = req.body;
  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $set: {
        'calendly.id': id,
        'calendly.link': link,
      },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('garbage update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const connectSMTP = async (req, res) => {
  const { currentUser } = req;
  const { host, port, user, pass } = req.body;

  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('garbage getting failed to verify smtp email address');
    }
  );
  const secure = port === '465';

  const smtpOption = {
    port,
    host,
    secure,
    auth: {
      user,
      pass,
    },
  };

  if (!secure) {
    smtpOption['tls'] = {
      // do not fail on invalid certs
      rejectUnauthorized: false,
    };
  }
  const smtpTransporter = nodemailer.createTransport(smtpOption);

  // verify connection configuration
  smtpTransporter.verify(function (error, success) {
    if (error) {
      if (error?.responseCode === 535) {
        const data = {
          ...req.body,
          secure,
          smtp_connected: false,
          pass: '',
        };
        Garbage.updateOne(
          {
            user: currentUser.id,
          },
          {
            $set: {
              smtp_info: data,
            },
          }
        ).catch((err) => {
          console.log('garbage update err', err.message);
        });
        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              campaign_smtp_connected: false,
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
      if (garbage.smtp_info && garbage.smtp_info.user === user) {
        data = {
          ...req.body,
          secure,
          smtp_connected: true,
        };
      } else {
        data = {
          ...req.body,
          secure,
          smtp_connected: true,
          daily_limit: 2000,
        };
      }
      Garbage.updateOne(
        {
          user: currentUser.id,
        },
        {
          $set: {
            smtp_info: data,
          },
        }
      ).catch((err) => {
        console.log('garbage update err', err.message);
      });

      return res.send({
        status: true,
      });
    }
  });
};

const verifySMTP = async (req, res) => {
  const { currentUser } = req;
  const { email } = req.body;

  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('garbage getting failed to verify smtp email address');
    }
  );

  if (!garbage || !garbage.smtp_info) {
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
    smtp_connected,
  } = garbage.smtp_info;

  const smtpOption = {
    port,
    host,
    secure,
    auth: {
      user,
      pass,
    },
  };

  if (!secure) {
    smtpOption['tls'] = {
      // do not fail on invalid certs
      rejectUnauthorized: false,
    };
  }

  const smtpTransporter = nodemailer.createTransport(smtpOption);

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
        Garbage.updateOne(
          {
            user: currentUser.id,
          },
          {
            $set: {
              smtp_info: data,
            },
          }
        ).catch((err) => {
          console.log('garbage update err', err.message);
        });
        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              campaign_smtp_connected: false,
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
        smtp_connected,
      };
      Garbage.updateOne(
        {
          user: currentUser.id,
        },
        {
          $set: { smtp_info: { ...data } },
        }
      ).catch((err) => {
        console.log('garbage update err', err.message);
      });
      if (original_email !== email) {
        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              campaign_smtp_connected: false,
            },
          }
        ).catch((err) => {
          console.log('smtp update err', err.message);
        });
      }
      res.send({
        data,
        status: true,
      });
    }
  });
};

const verifySMTPCode = async (req, res) => {
  const { currentUser } = req;
  const { code } = req.body;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('Getting garbage failed to verify smtp code.', err.message);
      return res.status(400).send({
        status: false,
        error: 'Could not find garbage for the current user.',
      });
    }
  );

  if (!garbage || !garbage.smtp_info) {
    return res.status(400).send({
      status: false,
      error: 'Please connect the smtp with your account.',
    });
  }

  const { verification_code } = garbage.smtp_info;
  if (verification_code === code) {
    // Update the User
    User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          campaign_smtp_connected: true,
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
      error: 'Your verification code is invalid.',
    });
  }
};

const disconnectCalendly = async (req, res) => {
  const { currentUser } = req;
  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $unset: { calendly: true },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('garbage update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const addDialer = async (req, res) => {
  const { currentUser } = req;
  const { level } = req.body;

  /**
  const payment = await Payment.findOne({
    _id: currentUser.payment,
  }).catch((err) => {
    console.log('payment find err', err.message);
  });

  const subscription_data = {
    customer_id: payment.customer_id,
    plan_id: api.STRIPE.DIALER[level],
    is_trial: true,
    trial_period_days: system_settings.DIALER_FREE_TRIAL,
  };

  createSubscription(subscription_data).then((subscription) => {
    */
  let subscriptions;

  if (level === 'PREV') {
    subscriptions = {
      previewLine: true,
    };
  } else if (level === 'SINGLE') {
    subscriptions = {
      single: true,
    };
  } else if (level === 'MULTI') {
    subscriptions = {
      multi: true,
    };
  }

  const body = {
    id: currentUser.id,
    email: currentUser.email,
    firstName: currentUser.user_name.split(' ')[0],
    lastName: currentUser.user_name.split(' ')[1] || '',
    subscriptions,
  };
  /**
    const new_payment = new Payment({
      customer_id: payment.customer_id,
      plan_id: api.STRIPE.DIALER[level],
      subscription: subscription.id,
      type: 'dialer',
    });

    new_payment.save().catch((err) => {
      console.log('new_payment err', err.message);
    });
 */
  const dialer_info = {
    is_enabled: true,
    level,
    // payment: new_payment.id,
  };

  User.updateOne(
    {
      _id: currentUser.id,
    },
    {
      $set: {
        dialer_info,
      },
    }
  ).catch((err) => {
    console.log('user dialer info updaet err', err.message);
  });

  const options = {
    method: 'POST',
    url: 'https://app.stormapp.com/api/customers',
    headers: {
      'Content-Type': 'application/json',
    },
    auth: {
      user: api.DIALER.VENDOR_ID,
      password: api.DIALER.API_KEY,
    },
    body,
    json: true,
  };

  request(options, function (error, response, data) {
    if (error) throw new Error(error);
    const payload = {
      userId: currentUser.id,
    };

    const token = jwt.sign(payload, api.DIALER.API_KEY, {
      issuer: api.DIALER.VENDOR_ID,
      expiresIn: 3600,
    });

    return res.send({
      status: true,
      data: token,
    });
  });
  // });
};

const getDialerToken = async (req, res) => {
  const { currentUser } = req;

  if (currentUser.dialer_info && currentUser.dialer_info.is_enabled) {
    const payload = {
      userId: currentUser.id,
    };

    const token = jwt.sign(payload, api.DIALER.API_KEY, {
      issuer: api.DIALER.VENDOR_ID,
      expiresIn: 3600,
    });

    return res.send({
      status: true,
      data: token,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Dialer is not enabled in your account',
    });
  }
};

const createMeetingZoom = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      return res.status(400).send({
        status: false,
        error: 'Could not find garbage for the current user.',
      });
    }
  );
  if (!garbage.zoom) {
    return res.status(400).json({
      status: false,
      error: MESSAGE['NO_ACCOUNT'],
    });
  }

  const { refresh_token: old_refresh_token, email: zoom_email } = decryptInfo(
    garbage.zoom,
    currentUser._id
  );

  let auth_client;

  await refreshToken(old_refresh_token)
    .then((response) => {
      auth_client = response;
    })
    .catch((err) => {
      console.log('zoom refresh token err', err);
    });

  const { refresh_token, access_token } = auth_client;

  if (!access_token) {
    return res.status(412).json({
      status: false,
      error: MESSAGE['TOKEN_EXPIRED'],
    });
  }

  const zoomInfoStr = encryptInfo(
    {
      refresh_token,
      email: zoom_email,
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
    console.log('garbage zoom update err', err.message);
  });

  const options = {
    method: 'POST',
    url: 'https://api.zoom.us/v2/users/me/meetings',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    body: req.body,
    json: true,
  };

  request(options)
    .then((response) => {
      return res.send({
        status: true,
        data: response.join_url,
      });
    })
    .catch((err) => {
      console.log('zoom meeting create err', err.message);
    });
};

const updateMeetingZoom = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      return res.status(400).send({
        status: false,
        error: 'Could not find garbage for the current user.',
      });
    }
  );
  if (!garbage.zoom) {
    return res.status(400).json({
      status: false,
      error: MESSAGE['NO_ACCOUNT'],
    });
  }

  const { refresh_token: old_refresh_token, email: zoom_email } = decryptInfo(
    garbage.zoom,
    currentUser._id
  );

  let auth_client;

  await refreshToken(old_refresh_token)
    .then((response) => {
      auth_client = response;
    })
    .catch((err) => {
      console.log('zoom refresh token err', err);
    });

  const { refresh_token, access_token } = auth_client;

  if (!access_token) {
    return res.staus(412).json({
      status: false,
      error: MESSAGE['TOKEN_EXPIRED'],
    });
  }

  const zoomInfoStr = encryptInfo(
    {
      refresh_token,
      email: zoom_email,
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
    console.log('garbage zoom update err', err.message);
  });

  const options = {
    method: 'PUT',
    url: 'https://api.zoom.us/v2/users/me/meetings',
    headers: {
      /** The credential below is a sample base64 encoded credential. Replace it with "Authorization: 'Basic ' + Buffer.from(your_app_client_id + ':' + your_app_client_secret).toString('base64')"
       * */
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    body: req.body,
    json: true,
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    return res.send({
      status: true,
      data: response.join_url,
    });
  });
};

const chatGPT = async (req, res) => {
  const { content } = req.body;

  const messages = [{ role: 'user', content }];

  // *********** "/v1/chat/completions" models ******************
  // these models are suitable for chatting, we are using these models currently.
  // ************ gpt-3 models ***************
  // gpt-3.5-turbo, gpt-3.5-turbo-0301
  // gpt-3.5-turbo-0301 : max tokens: 4096 / 2
  // ************ gpt -4 modes ***************
  // gpt-4, gpt-4-0314, gpt-4-32k, gpt-4-32k-0314
  // gpt-4-0314 - max tokens: 8192 / 2

  // ************** "/v1/completions" models ********************
  // these models are suitable for getting words
  // ************ gpt-3 models ****************
  // text-davinci-003, text-davinci-002, text-curie-001, text-babbage-001, text-ada-001
  // ************ gpt-4 models ****************
  // still not provided (2023-05-16)

  const options = {
    temperature: 0.8,
    max_tokens: 2048,
    model: 'gpt-4o-mini',
  };

  request({
    method: 'POST',
    uri: `https://api.openai.com/v1/chat/completions`, // chat model
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      ...options,
    }),
  })
    .then(async (response) => {
      const data = await JSON.parse(response);
      const content = data.choices[0].message.content;
      return res.send({
        status: true,
        data: {
          content,
        },
      });
    })
    .catch((err) => {
      console.error('Error creating chat completion:', err.status);
      return res.status(400).json({
        status: false,
        error: err?.error,
      });
    });
};

module.exports = {
  checkAuthCalendly,
  setEventCalendly,
  getCalendly,
  getDialerToken,
  disconnectCalendly,
  connectSMTP,
  verifySMTP,
  verifySMTPCode,
  addDialer,
  createMeetingZoom,
  updateMeetingZoom,
  chatGPT,
};
