const moment = require('moment-timezone');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');
const { all_time_zones } = require('../constants/variable');
const Sentry = require('@sentry/node');
const system_settings = require('../configs/system_settings');
const User = require('../models/user');
const Garbage = require('../models/garbage');
const CustomField = require('../models/custom_field');
const ApiTracker = require('../models/api_tracker');
const { logger } = require('@teamgrow/common');

const getUserTimezone = (user) => {
  if (user.time_zone_info) {
    try {
      return (
        JSON.parse(user.time_zone_info)?.tz_name || system_settings.TIME_ZONE
      );
    } catch (err) {
      return (
        user.time_zone_info?.tz_name ||
        user.time_zone_info ||
        system_settings.TIME_ZONE
      );
    }
  } else {
    return system_settings.TIME_ZONE;
  }
};

const getAvatarName = (data) => {
  let { first_name, last_name } = data;
  const { full_name } = data;
  if (full_name) {
    first_name = full_name.split(' ')[0];
    last_name = full_name.split(' ')[1] || '';
  }
  return `${first_name.charAt(0)} ${last_name.charAt(0)}`;
};

const validateEmail = (email) => {
  const re = /^[a-zA-Z0-9'._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/gim;
  return re.test(String(email).toLowerCase());
};

const getTextMaterials = (text = '') => {
  const videoIds = [];
  const pdfIds = [];
  const imageIds = [];
  const materials = [];
  const videoRegex = /\{\{video:([^}]+)\}\}/g;
  const imageRegex = /\{\{image:([^}]+)\}\}/g;
  const pdfRegex = /\{\{pdf:([^}]+)\}\}/g;

  // Function to extract values
  function extractValues(text, regex) {
    const matches = [];
    let match = regex.exec(text);

    while (match !== null) {
      matches.push(match[1]);
      match = regex.exec(text);
    }
    return matches;
  }
  const videoValues = extractValues(text, videoRegex);
  const pdfValues = extractValues(text, pdfRegex);
  const imageValues = extractValues(text, imageRegex);
  if (videoValues && videoValues.length) {
    videoValues.forEach((e) => {
      videoIds.push(e);
      materials.push({ type: 'video', _id: e });
    });
  }
  if (pdfValues && pdfValues.length) {
    pdfValues.forEach((e) => {
      pdfIds.push(e);
      materials.push({ type: 'pdf', _id: e });
    });
  }
  if (imageValues && imageValues.length) {
    imageValues.forEach((e) => {
      imageIds.push(e);
      materials.push({ type: 'image', _id: e });
    });
  }
  return {
    videoIds,
    imageIds,
    pdfIds,
    materials,
  };
};

const encryptInfo = (info, password) => {
  const passphrase = password + '';
  const text = JSON.stringify(info);
  return CryptoJS.AES.encrypt(text, passphrase).toString();
};

const decryptInfo = (ciphertext, password) => {
  const passphrase = password + '';
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  let info = {};
  try {
    info = JSON.parse(originalText);
  } catch (err) {
    console.log('failed in decryption');
  }
  return info;
};

const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const getStandardTimezone = (timezone) => {
  return all_time_zones[timezone] || timezone;
};

const replaceToken = (content, tokenData) => {
  const { currentUser, contact, assignee, contactLabel, scheduled_time } =
    tokenData;
  if (assignee) {
    content = content
      .replace(/{assignee_first_name}/gi, assignee?.user_name.split(' ')[0])
      .replace(/{assignee_last_name}/gi, assignee?.user_name.split(' ')[1])
      .replace(
        /{assignee_email}/gi,
        assignee.connected_email ? assignee.connected_email : assignee?.email
      )
      .replace(/{assignee_phone}/gi, assignee?.cell_phone);
  }
  if (contactLabel) content = content.replace(/{label}/gi, contactLabel);
  if (scheduled_time)
    content = content.replace(/{scheduled_time}/gi, scheduled_time);
  content = content
    .replace(/\[user name\]/gi, '{my_name}')
    .replace(/\[user email\]/gi, '{my_email}')
    .replace(/\[user phone\]/gi, '{my_phone}')
    .replace(/\[user company\]/gi, '{my_company}')
    .replace(/\[contact first name\]/gi, '{contact_first_name}')
    .replace(/\[contact last name\]/gi, '{contact_last_name}')
    .replace(/\[contact email\]/gi, '{contact_email}')
    .replace(/\[contact phone\]/gi, '{contact_phone}')
    .replace(/\[assignee name\]/gi, '{assignee_name}')
    .replace(/\[assignee first name\]/gi, '{assignee_first_name}')
    .replace(/\[assignee last name\]/gi, '{assignee_last_name}')
    .replace(/\[assignee email\]/gi, '{assignee_email}')
    .replace(/\[assignee phone\]/gi, '{assignee_phone}');
  content = content
    .replace(/{user_name}/gi, currentUser?.user_name)
    .replace(/{user_email}/gi, currentUser?.connected_email)
    .replace(/{user_phone}/gi, currentUser?.cell_phone)
    .replace(/{user_company}/gi, currentUser?.company)
    .replace(/{contact_first_name}/gi, contact?.first_name || '')
    .replace(/{contact_last_name}/gi, contact?.last_name || '')
    .replace(/{contact_email}/gi, contact?.email)
    .replace(/{contact_phone}/gi, contact?.cell_phone)
    .replace(/{my_name}/gi, currentUser?.user_name)
    .replace(/{my_first_name}/gi, currentUser?.user_name?.split(' ')?.[0] || '')
    .replace(/{my_email}/gi, currentUser?.connected_email)
    .replace(/{my_phone}/gi, currentUser?.cell_phone)
    .replace(/{my_company}/gi, currentUser?.company)
    .replace(/{video_title}/gi, '{material_title}')
    .replace(/{pdf_title}/gi, '{material_title}')
    .replace(/{image_title}/gi, '{material_title}');
  return content;
};

const flip = (data) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [value, key]));

const encrypt = (str, key) => {
  const algorithm = 'aes-256-cbc';
  const initVector = Buffer.from(key.substring(0, 16), 'utf-8');
  const securityKey = Buffer.from(key, 'utf-8');

  const cipher = crypto.createCipheriv(algorithm, securityKey, initVector);
  let encryptedData = cipher.update(str, 'utf-8', 'hex');

  encryptedData += cipher.final('hex');
  return encryptedData;
};

const decrypt = (str, key) => {
  const algorithm = 'aes-256-cbc';
  const initVector = Buffer.from(key.substring(0, 16), 'utf-8');
  const securityKey = Buffer.from(key, 'utf-8');

  const decipher = crypto.createDecipheriv(algorithm, securityKey, initVector);
  let decryptedData = decipher.update(str, 'hex', 'utf-8');
  decryptedData += decipher.final('utf8');

  return decryptedData;
};

const sendErrorToSentry = (user, error) => {
  Sentry.captureException(error, {
    user: {
      id: user && user._id ? user._id : 'No user',
    },
    extra: {
      env: process.env.NODE_ENV || 'development',
    },
  });
  logger.error('exception caught:', error);
};

const trackApiRequest = (api, data) => {
  if (process.env.API_TRACK_DISABLED) {
    return;
  }
  ApiTracker.create({
    api,
    data,
  }).catch((err) => {
    console.log('API tracking is failed.', err);
  });
};

const compareArrays = (a, b) =>
  a.length === b.length && a.every((element, index) => element === b[index]);

const compareArraysToString = (a, b) =>
  a.length === b.length && a.toString() === b.toString();

const replaceTokenFunc = async (data) => {
  const { currentUser, contact, garbage, scheduled_time, subject, content } =
    data;
  let assignee;
  if (contact.owner) {
    assignee = await User.findOne({
      _id: contact.owner,
    });
  }
  const contactLabel = contact.label?.name;
  let tokenData;
  if (scheduled_time)
    tokenData = {
      currentUser,
      contact,
      assignee,
      contactLabel,
      scheduled_time,
    };
  else
    tokenData = {
      currentUser,
      contact,
      assignee,
      contactLabel,
    };
  let email_subject = replaceToken(subject, tokenData);
  let email_content = '';
  if (content) {
    email_content = replaceToken(content, tokenData);
  }
  if (garbage.template_tokens && garbage.template_tokens.length > 0) {
    for (let k = 0; k < garbage.template_tokens.length; k++) {
      const token = garbage.template_tokens[k];
      const regex = new RegExp(`\\{${token.name}\\}`, 'gi');
      let value;
      if (token.value !== '') {
        value = token.value;
      } else {
        try {
          const customField = await CustomField.find({
            user: currentUser._id,
            kind: 'contact',
            name: token.match_field,
          }).catch((ex) => {
            console.log('custom field load failed, ', ex.message);
          });
          if (customField) {
            value = contact.additional_field
              ? contact.additional_field[token.match_field] || ''
              : '';
          } else {
            value = contact[token.match_field] || '';
            if (token.match_field === 'label') {
              value = contact.label.name;
            }
          }
        } catch (_) {
          value = '';
        }
      }
      email_subject = email_subject.replace(regex, value);
      if (email_content) email_content = email_content.replace(regex, value);
    }
  }
  return {
    content: email_content,
    subject: email_subject,
  };
};

const calcDueDate = async (timeline) => {
  const { period, due_date, user } = timeline;
  const now = moment();

  let _due_date;
  if (due_date) {
    if (moment.isMoment(due_date)) {
      _due_date = due_date;
    } else {
      _due_date = moment(due_date);
    }
  } else {
    _due_date = period ? now.add(period, 'hours') : now;
  }

  const garbage = await Garbage.findOne({ user }).catch((err) => {
    console.log('err', err);
  });
  const _user = await User.findOne({ _id: user });
  if (garbage?.business_time?.is_enabled) {
    const start_time = garbage.business_time.start_time;
    const end_time = garbage.business_time.end_time;
    let business_time_hour = 9;
    let business_time_minute = 0;
    if (start_time) {
      var sp = start_time.match(/\d+/g);
      business_time_hour = Number(sp[0]);
      business_time_minute = Number(sp[1]);
    }

    const time_zone = getUserTimezone(_user);

    console.log('time_zone', time_zone);

    const due_date_str = _due_date.tz(time_zone).format('HH:mm:[00.000]');

    if (due_date_str < start_time) {
      _due_date = moment(_due_date).tz(time_zone).set({
        h: business_time_hour,
        m: business_time_minute,
      });
    } else if (due_date_str > end_time) {
      _due_date = moment(_due_date)
        .tz(time_zone)
        .add(1, 'days')
        .set({ h: business_time_hour, m: business_time_minute });
    }
  }

  if (garbage?.business_day) {
    const business_day = garbage.business_day;
    const weekday = moment(_due_date).day();
    const days = Object.keys(business_day);
    if (!business_day[days[weekday]]) {
      let next_business_day = 0;
      while (!business_day[days[(weekday + next_business_day) % 7]]) {
        next_business_day++;
      }
      _due_date = moment(_due_date).add(next_business_day, 'days');
    }
  }
  return _due_date;
};

module.exports = {
  getUserTimezone,
  getAvatarName,
  validateEmail,
  getTextMaterials,
  encryptInfo,
  decryptInfo,
  streamToBuffer,
  getStandardTimezone,
  replaceToken,
  flip,
  sendErrorToSentry,
  trackApiRequest,
  encrypt,
  decrypt,
  compareArrays,
  compareArraysToString,
  replaceTokenFunc,
  calcDueDate,
};
