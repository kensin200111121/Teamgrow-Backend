const request = require('request-promise');
const moment = require('moment-timezone');
const PhoneLog = require('../models/phone_log');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const ActivityHelper = require('../helpers/activity');
const { DIALER } = require('../configs/api');
const User = require('../models/user');
const Notification = require('../models/notification');
const mail_contents = require('../constants/mail_contents');
const { sendNotificationEmail } = require('../helpers/notification');
const { updateSphereRelationship } = require('../helpers/contact');
const { createNotification } = require('../helpers/notification');
const Text = require('../models/text');
const { checkSmartCode } = require('./text');
const {
  updateWavvMessageStatus,
  updateTextCount,
  updateUserTextCount,
} = require('../helpers/text');
const { trackApiRequest } = require('../helpers/utility');
const { SegmentedMessage } = require('sms-segments-calculator');

const loadCustomer = async (req, res) => {
  const { currentUser } = req;

  var options = {
    method: 'GET',
    url: 'https://app.stormapp.com/api/customers/' + currentUser._id,
    headers: {
      'Content-Type': 'application/json',
    },
    auth: {
      user: DIALER.VENDOR_ID,
      password: DIALER.API_KEY,
    },
    json: true,
  };

  request(options, function (error, response, data) {
    if (error) throw new Error(error);

    return res.send({
      status: true,
      data,
    });
  });
};

const get = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.params;
  const data = await PhoneLog.find({ user: currentUser.id, contact });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Phone log doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;

  const logs = req.body;
  let detail_content = 'called';
  if (guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
  }

  // Checking the Deal Call
  let shared_log_id;
  if (logs[0]['deal']) {
    const dealId = logs[0]['deal'];
    const uuid = logs[0]['uuid'];
    // Check if there is saved deal log with the uuid
    const shared_log = await PhoneLog.findOne({ deal: dealId, uuid }).catch(
      (err) => {
        console.log('Failed: Getting the shared log with uuid', err);
      }
    );
    // If there is no one with uuid, create the deal phone call log
    if (shared_log) {
      shared_log_id = shared_log._id;
    } else {
      const dealPhoneLog = new PhoneLog({
        user: currentUser.id,
        deal: dealId,
        uuid,
        updated_at: new Date(),
        created_at: new Date(),
      });
      dealPhoneLog.save().catch((err) => {
        console.log('Failed: deal phone log saving', err);
      });
      const dealPhoneActivity = new Activity({
        content: detail_content,
        deals: dealId,
        user: currentUser.id,
        type: 'phone_logs',
        phone_logs: dealPhoneLog.id,
        created_at: new Date(),
        updated_at: new Date(),
      });
      dealPhoneActivity.save().catch((err) => {
        console.log('Failed: Deal Phone Activity Saving', err);
      });
      shared_log_id = dealPhoneLog._id;
    }
  }

  logs.forEach(async (log) => {
    let duration = 0;
    if (log.recordingId) {
      const recordingData = await getRecording(
        currentUser._id,
        log.recordingId
      );
      if (recordingData && recordingData.seconds) {
        duration = recordingData.seconds;
      }
    }

    const phoneLogObject = {
      content: log.content,
      contact: log.contactId,
      status: log.outcome,
      human: log.human,
      rating: log.rating,
      label: log.label,
      duration: log.duration,
      answered: log.answered,
      recording: log.recordingId,
      recording_duration: duration,
      voicemail: log.voicemailId,
      user: currentUser.id,
      updated_at: new Date(),
      created_at: new Date(),
    };
    if (shared_log_id) {
      phoneLogObject['has_shared'] = true;
      phoneLogObject['shared_log'] = shared_log_id;
    }

    const phone_log = new PhoneLog(phoneLogObject);
    phone_log
      .save()
      .then((_phone_log) => {
        const activity = new Activity({
          content: detail_content,
          contacts: _phone_log.contact,
          user: currentUser.id,
          type: 'phone_logs',
          phone_logs: _phone_log.id,
          created_at: new Date(),
          updated_at: new Date(),
        });

        activity.save().then((_activity) => {
          Contact.updateOne(
            { _id: _phone_log.contact },
            {
              $set: { last_activity: _activity.id },
            }
          ).catch((err) => {
            console.log('err', err);
          });
          const myJSON = JSON.stringify(_phone_log);
          const data = JSON.parse(myJSON);
          data.activity = _activity;
          // Update sphere relationship
          updateSphereRelationship([_phone_log.contact], 'call');
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
      });
  });

  return res.send({
    status: true,
  });
};

const loadRecording = (req, res) => {
  const { currentUser } = req;
  const { recording } = req.body;
  var options = {
    method: 'GET',
    url:
      'https://api.wavv.com/v2/users/' +
      currentUser._id +
      '/recordings/' +
      recording,
    headers: {
      'Content-Type': 'application/json',
    },
    auth: {
      user: DIALER.VENDOR_ID,
      password: DIALER.API_KEY,
    },
    json: true,
  };

  request(options, function (error, response, data) {
    if (error) throw new Error(error);

    return res.send({
      status: true,
      data,
    });
  });
};

const getRecording = (user_id, recording) => {
  return new Promise((resolve, reject) => {
    var options = {
      method: 'GET',
      url:
        'https://app.stormapp.com/api/customers/' +
        user_id +
        '/recordings/' +
        recording,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        user: DIALER.VENDOR_ID,
        password: DIALER.API_KEY,
      },
      json: true,
    };

    request(options, function (error, response, data) {
      if (error) {
        reject(new Error(error));
      }
      resolve(data);
    });
  });
};

const edit = (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const { content, rating, label } = req.body;

  PhoneLog.updateOne(
    { _id: id, user: currentUser._id },
    { $set: { content, rating, label } }
  )
    .then((_res) => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('phone log updating is failed.', err);
      return res.status(400).send({
        status: false,
      });
    });
};

const handleEvent = async (req, res) => {
  const { type, payload } = req.body;
  if (type !== 'MESSAGE_SENT' && type !== 'MESSAGE_FAILED') {
    trackApiRequest('wavv_user_request', req.body);
  }
  if (type === 'SUBSCRIPTION_CHANGED') {
    const { userId, subscriptions } = payload;
    const currentUser = await User.findOne({ _id: userId }).catch((err) => {
      console.log('user found err', err.message);
    });
    let level = '';
    if (subscriptions) {
      if (subscriptions.previewLine) {
        level = 'PREV';
      } else if (subscriptions.single || subscriptions['single-no-rvm']) {
        level = 'SINGLE';
      } else if (subscriptions.multi || subscriptions['multi-no-rvm']) {
        level = 'MULTI';
      } else if (subscriptions.c2c || subscriptions['c2c-no-campaigns']) {
        level = 'C2C';
      }
    }
    const email_data = {
      template_data: {
        user_name: currentUser.user_name,
        dialer_package: level,
      },
      template_name: 'WelcomeDialer',
      required_reply: false,
      cc: currentUser.email,
      email: mail_contents.REPLY,
      source: currentUser.source,
    };

    sendNotificationEmail(email_data);

    User.updateOne(
      { _id: userId },
      { $set: { dialer_info: { is_enabled: true, level } } }
    )
      .then(() => {})
      .catch(() => {});
    res.send({
      status: true,
      data: { type, payload },
    });
  } else if (type === 'MESSAGE_RECEIVED') {
    const { id, from, body, attachments, userId } = payload;

    const currentUser = await User.findOne({
      _id: userId,
      del: false,
    }).catch((err) => {
      console.log('current user found err sms', err.message);
    });

    if (currentUser != null) {
      const phoneNumber = from.includes('+1') ? from : `+1${from}`;
      const text = `${body}\n${attachments.join('\n')}`;

      const contact = await Contact.findOne({
        $or: [
          { cell_phone: phoneNumber, user: currentUser.id },
          { cell_phone: phoneNumber, shared_members: currentUser.id },
        ],
      }).catch((err) => {
        console.log('contact found err sms reply', err);
      });

      if (contact) {
        if (text.toLowerCase().trim() === 'stop') {
          const activity = new Activity({
            content: 'unsubscribed sms',
            contacts: contact.id,
            user: currentUser.id,
            type: 'text_trackers',
            created_at: new Date(),
            updated_at: new Date(),
          });
          activity.single_id = activity._id;
          const _activity = await activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          Contact.updateOne(
            { _id: contact.id },
            {
              $set: { last_activity: _activity.id, 'unsubscribed.text': true },
            }
          ).catch((err) => {
            console.log('err', err);
          });

          createNotification(
            'unsubscribe_text',
            {
              criteria: 'unsubscribe_text',
              user: currentUser,
              contact,
            },
            currentUser
          );
        } else if (text.toLowerCase().trim() === 'start') {
          const activity = new Activity({
            content: 'resubscribed sms',
            contacts: contact.id,
            user: currentUser.id,
            type: 'text_trackers',
            created_at: new Date(),
            updated_at: new Date(),
          });
          activity.single_id = activity._id;
          const _activity = await activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          Contact.updateOne(
            { _id: contact.id },
            {
              $set: { last_activity: _activity.id, 'unsubscribed.text': false },
            }
          ).catch((err) => {
            console.log('err', err);
          });
        } else {
          const prevText = await Text.findOne(
            {
              user: currentUser.id,
              contacts: contact.id,
              message_id: id,
            },
            {},
            { sort: { created_at: -1 } }
          ).catch((err) => {
            console.log('latest text find', err);
          });

          if (prevText) {
            return res.send();
          }

          checkSmartCode(currentUser.id, text, contact.id);
          const new_text = new Text({
            user: currentUser.id,
            contacts: contact.id,
            content: text,
            message_id: id,
            status: 0,
            type: 1,
          });

          new_text.save().catch((err) => {
            console.log('new text save err', err.message);
          });

          Contact.updateMany(
            { _id: { $in: contact._id } },
            { message: { last_received: new_text._id, last: new_text._id } }
          ).catch((err) => {
            console.log(err.message);
          });

          const activity = new Activity({
            content: 'received text',
            contacts: contact.id,
            user: currentUser.id,
            type: 'texts',
            texts: new_text.id,
          });

          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          Contact.updateOne(
            { _id: contact.id },
            {
              $set: { last_activity: activity.id },
            }
          ).catch((err) => {
            console.log('err', err);
          });

          // ============================ Web Push, Email, Text Notification =================
          createNotification(
            'receive_text',
            {
              criteria: 'receive_text',
              user: currentUser,
              text,
              contact,
            },
            currentUser
          );
          const message = new SegmentedMessage(text || '', 'auto', true);
          updateUserTextCount(
            currentUser,
            message.segmentsCount || 0,
            true
          ).catch(() => {});
        }
      } else {
        const tags = ['textlead'];
        let optOutStatus = false;
        if (text.toLowerCase().trim() === 'stop') {
          optOutStatus = true;
        }
        const contact = new Contact({
          user: currentUser.id,
          cell_phone: phoneNumber,
          first_name: phoneNumber,
          tags,
          'unsubscribed.text': optOutStatus,
        });

        contact
          .save()
          .then(() => {
            checkSmartCode(currentUser.id, text, contact.id);
          })
          .catch((err) => {
            console.log('contact create err sms reply', err);
          });

        const prevText = await Text.findOne(
          {
            user: currentUser.id,
            contacts: contact.id,
            message_id: id,
          },
          {},
          { sort: { created_at: -1 } }
        ).catch((err) => {
          console.log('latest text find', err);
        });

        if (prevText) {
          return res.send();
        }

        const new_text = new Text({
          user: currentUser.id,
          contacts: contact.id,
          content: text,
          status: 0,
          type: 1,
        });

        new_text.save().catch((err) => {
          console.log('new text save err', err.message);
        });

        const activity = new Activity({
          content: 'LEAD CAPTURE - received text',
          contacts: contact.id,
          user: currentUser.id,
          type: 'texts',
          texts: new_text.id,
        });

        activity.save().catch((err) => {
          console.log('contact create err sms reply', err);
        });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: {
              last_activity: activity.id,
              tags,
            },
          }
        ).catch((err) => {
          console.log('err', err);
        });

        createNotification(
          'receive_text',
          {
            criteria: 'receive_text',
            user: currentUser,
            text,
            contact,
          },
          currentUser
        );
        const message = new SegmentedMessage(text || '', 'auto', true);
        updateUserTextCount(
          currentUser,
          message.segmentsCount || 0,
          true
        ).catch(() => {});
      }
    }
    return res.send();
  } else if (type === 'MESSAGE_SENT' || type === 'MESSAGE_FAILED') {
    const { id, from } = payload;
    updateWavvMessageStatus(id, from, type);
    return res.send();
  }
};

const saveDealCall = (req, res) => {
  const { currentUser } = req;

  const data = req.body;
  const { contact, detail, content, status, deal, uuid, dealStages } = data;

  // update the saved deal phone call log with content and
  if (deal) {
    PhoneLog.updateOne(
      { deal, uuid },
      { $set: { content, label: status, assigned_contacts: contact } }
    ).catch((err) => {
      console.log('Failed: Update the deal share log with content', err);
    });
  }
  const newNotification = new Notification({
    ...req.body,
    user: currentUser._id,
  });
  newNotification.save().then((_newNotification) => {
    return res.send({
      status: true,
      data: _newNotification,
    });
  });
};

const loadStatistics = (req, res) => {
  const { currentUser } = req;

  const { timezone, data } = req.body;
  let durationQuery = {};
  if (data && data.start) {
    durationQuery = {
      created_at: { $gte: new Date(data.start), $lte: new Date(data.end) },
    };
  }
  // Load call count by time
  const today = moment().tz(timezone).startOf('day');
  const tomorrow = today.clone().add(1, 'day');
  const yesterdayStart = today.clone().subtract(1, 'day');
  const yesterdayEnd = yesterdayStart.clone().add(1, 'day');
  const thisWeekStart = moment().tz(timezone).startOf('week');
  const thisWeekEnd = thisWeekStart.clone().add(1, 'week');
  const lastWeekStart = thisWeekStart.clone().subtract(1, 'week');
  const lastWeekEnd = thisWeekStart;
  const thisMonthStart = moment().tz(timezone).startOf('month');
  const thisMonthEnd = thisMonthStart.clone().add(1, 'month');
  const lastMonthStart = thisMonthStart.clone().subtract(1, 'month');
  const lastMonthEnd = thisMonthStart;
  const weekAgo = today.clone().subtract(1, 'week');
  const monthAgo = today.clone().subtract(1, 'month');
  const timeGaps = [
    {
      start: today,
      end: tomorrow,
      label: 'Today',
      date: today,
    },
    {
      start: yesterdayStart,
      end: yesterdayEnd,
      label: 'Yesterday',
      date: yesterdayStart,
    },
    {
      start: thisWeekStart,
      end: thisWeekEnd,
      label: 'This Week',
      date: thisWeekStart,
    },
    {
      start: lastWeekStart,
      end: lastWeekEnd,
      label: 'Last Week',
      date: lastWeekStart,
    },
    {
      start: thisMonthStart,
      end: thisMonthEnd,
      label: 'This Month',
      date: thisMonthStart,
    },
    {
      start: lastMonthStart,
      end: lastMonthEnd,
      label: 'Last Month',
      date: lastMonthStart,
    },
    {
      start: weekAgo,
      end: tomorrow,
      label: 'For a week',
      date: weekAgo,
    },
    {
      start: monthAgo,
      end: tomorrow,
      label: 'For a month',
      date: weekAgo,
    },
  ];
  const timeReportPromises = [];
  timeGaps.forEach((gap) => {
    const promise = new Promise((resolve) => {
      PhoneLog.countDocuments({
        user: currentUser._id,
        created_at: { $gte: gap.start, $lt: gap.end },
      })
        .then((_data) => {
          resolve({
            status: true,
            ...gap,
            count: _data,
          });
        })
        .catch((err) => {
          resolve({
            status: false,
            ...gap,
          });
        });
    });
    timeReportPromises.push(promise);
  });
  const timePromise = new Promise((resolve) => {
    Promise.all(timeReportPromises).then((data) => {
      resolve({
        type: 'time',
        data,
      });
    });
  });
  // Load call count by label
  const labelPromise = new Promise((resolve) => {
    PhoneLog.aggregate([
      {
        $match: {
          user: currentUser._id,
          type: { $ne: 'rvm' },
          ...durationQuery,
        },
      },
      {
        $group: {
          _id: '$label',
          count: { $sum: 1 },
          duration: { $sum: '$duration' },
        },
      },
    ])
      .then((data) => {
        resolve({
          type: 'label',
          data,
        });
      })
      .catch(() => {
        resolve({
          type: 'label',
          data: [],
        });
      });
  });

  // Load call count by status
  const statusPromise = new Promise((resolve) => {
    PhoneLog.aggregate([
      {
        $match: {
          user: currentUser._id,
          type: { $ne: 'rvm' },
          ...durationQuery,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          duration: { $sum: '$duration' },
        },
      },
    ])
      .then((data) => {
        resolve({
          type: 'status',
          data,
        });
      })
      .catch(() => {
        resolve({
          type: 'status',
          data: [],
        });
      });
  });
  let operations = [];
  if (data && data.start) {
    operations = [labelPromise, statusPromise];
  } else {
    operations = [timePromise, labelPromise, statusPromise];
  }
  Promise.all(operations).then((data) => {
    return res.send({
      status: true,
      data,
    });
  });
};

/**
 * Filter & Load Phone call logs
 * @param {*} req: body: {query, limit, skip}
 * @param {*} res: status: true | false, data: log array
 */
const filterLogs = async (req, res) => {
  const { currentUser } = req;
  const query = req.body.query;
  const limit = req.body.limit || 50;
  const skip = req.body.skip || 0;
  const keyword = req.body.keyword || '';
  const duration = req.body.duration;
  const sortBy = req.body.sortBy;
  let durationQuery = {};
  if (duration && duration.start) {
    durationQuery = {
      created_at: {
        $gte: new Date(duration.start),
        $lte: new Date(duration.end),
      },
    };
  }
  let keywordQuery = [];
  if (keyword) {
    var strQuery = {};
    var search = keyword.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
    var phoneSearchStr = keyword.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
    if (search.split(' ').length > 1) {
      const firstStr = search.split(' ')[0];
      const secondStr = search.split(' ')[1];
      strQuery = {
        $or: [
          {
            'contact.first_name': { $regex: '.*' + firstStr, $options: 'i' },
            'contact.last_name': { $regex: secondStr + '.*', $options: 'i' },
          },
          {
            'contact.first_name': {
              $regex: '.*' + search + '.*',
              $options: 'i',
            },
          },
          {
            'contact.last_name': {
              $regex: '.*' + search + '.*',
              $options: 'i',
            },
          },
          {
            'contact.cell_phone': {
              $regex: '.*' + phoneSearchStr + '.*',
              $options: 'i',
            },
          },
        ],
      };
    } else {
      strQuery = {
        $or: [
          {
            'contact.first_name': {
              $regex: '.*' + search + '.*',
              $options: 'i',
            },
          },
          { 'contact.email': { $regex: '.*' + search + '.*', $options: 'i' } },
          {
            'contact.last_name': {
              $regex: '.*' + search + '.*',
              $options: 'i',
            },
          },
          {
            'contact.cell_phone': {
              $regex: '.*' + phoneSearchStr + '.*',
              $options: 'i',
            },
          },
        ],
      };
    }
    keywordQuery = [{ $unwind: '$contact' }, { $match: strQuery }];
  }
  const countDoc = await PhoneLog.aggregate([
    {
      $match: {
        ...query,
        user: currentUser._id,
        ...durationQuery,
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: 'contact',
        foreignField: '_id',
        as: 'contact',
      },
    },
    ...keywordQuery,
    { $count: 'count' },
  ]);
  let sort = {};
  if (sortBy === 'alpha_up') {
    sort = { 'contact.first_name': -1 };
  } else if (sortBy === 'alpha_down') {
    sort = { 'contact.first_name': 1 };
  } else if (sortBy === 'last_called') {
    sort = { created_at: -1 };
  } else if (sortBy === 'status') {
    sort = { status: -1 };
  }
  PhoneLog.aggregate([
    {
      $match: {
        ...query,
        user: currentUser._id,
        ...durationQuery,
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: 'contact',
        foreignField: '_id',
        as: 'contact',
      },
    },
    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
    ...keywordQuery,
  ])
    .collation({ locale: 'en' })
    .then((_data) => {
      const count = countDoc && countDoc[0] && (countDoc[0]['count'] || 0);
      return res.send({
        status: true,
        data: _data,
        count,
      });
    });
};

const updateLogs = (req, res) => {
  const { currentUser } = req;
  const { oldLabel, newLabel } = req.body;
  let updateQuery;
  if (newLabel) {
    updateQuery = { $set: { label: newLabel } };
  } else {
    updateQuery = { $unset: { label: true } };
  }
  PhoneLog.updateMany({ user: currentUser._id, label: oldLabel }, updateQuery)
    .then((_res) => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('phone log updating is failed.', err);
      return res.status(400).send({
        status: false,
      });
    });
};
module.exports = {
  get,
  create,
  loadRecording,
  edit,
  loadCustomer,
  handleEvent,
  saveDealCall,
  loadStatistics,
  filterLogs,
  updateLogs,
};
