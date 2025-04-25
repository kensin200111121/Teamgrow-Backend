const mongoose = require('mongoose');
const { phone } = require('phone');
const Sentry = require('@sentry/node');

const User = require('../models/user');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const Text = require('../models/text');
const Payment = require('../models/payment');
const urls = require('../constants/urls');
const api = require('../configs/api');
const mail_contents = require('../constants/mail_contents');
const system_settings = require('../configs/system_settings');
const twilioFactory = require('twilio');

const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;
const twilio = require('twilio')(accountSid, authToken);
const moment = require('moment-timezone');

const VideoTracker = require('../models/video_tracker');
const { sendNotificationEmail } = require('../helpers/notification');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const Video = require('../models/video');
const Image = require('../models/image');
const PDF = require('../models/pdf');
const Garbage = require('../models/garbage');

const {
  sendText,
  updateUserTextCount,
  attachPhoneNumberToService,
  attachPhoneNumberOwnService,
  getPhoneNumberService,
  handleDeliveredText,
  revertTextWithActivities,
} = require('../helpers/text');

const {
  listWavvNumbers,
  getWavvUserState,
  updateWavvSubscription,
  getWavvBrandState,
  createWavvUser,
} = require('../services/message');

const { createCharge } = require('../helpers/payment');
const { releaseTwilioNumber, getTwilio } = require('../helpers/text');
const { createNotification } = require('../helpers/notification');
const { assignTimeline } = require('../helpers/automation');
const { sendErrorToSentry, getUserTimezone } = require('../helpers/utility');
const { sendSocketNotification } = require('../helpers/socket');
const { getWavvIDWithVortexId } = require('../helpers/text');
const { triggerTimeline } = require('../services/time_line');
const { checkRecaptchaToken } = require('../helpers/user');
const { shareContactsToOrganization } = require('../helpers/contact');

const getAll = async (req, res) => {
  const { currentUser } = req;
  const data = [];
  const contacts = await Text.aggregate([
    {
      $match: {
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: '$contacts',
        content: { $last: '$content' },
        created_at: { $last: '$created_at' },
        updated_at: { $last: '$updated_at' },
        type: { $last: '$type' },
        text_id: { $last: '$id' },
        status: { $last: '$status' },
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: '_id',
        foreignField: '_id',
        as: 'contacts',
      },
    },
    {
      $sort: { created_at: -1 },
    },
  ]);

  return res.send({
    status: true,
    data: contacts,
  });
};

const getContactMessageOfCount = async (req, res) => {
  const { currentUser } = req;

  let search = '';
  const getCount = req.body.count || 5;
  const skipNum = req.body.skip || 0;
  const searchStr = req.body.searchStr || '';
  const sort_type = req.body.sort_type || 'latest';

  let phoneSearchStr = '';
  if (searchStr) {
    search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
    phoneSearchStr = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
  }

  const match_own_sms = {
    $and: [
      {
        $or: [
          { user: currentUser._id },
          {
            shared_members: {
              $elemMatch: { $in: [currentUser._id] },
            },
          },
        ],
      },
      { message: { $exists: true } },
    ],
  };

  let match_pipeline;
  if (search) {
    match_pipeline = {
      $match: {
        $and: [
          match_own_sms,
          {
            $or: [
              { first_name: { $regex: '.*' + search + '.*', $options: 'i' } },
              { last_name: { $regex: '.*' + search + '.*', $options: 'i' } },
              {
                cell_phone: {
                  $regex: '.*' + phoneSearchStr + '.*',
                  $options: 'i',
                },
              },
            ],
          },
        ],
      },
    };
  } else {
    match_pipeline = { $match: match_own_sms };
  }

  let lookupPipeline; // Join the received message or latest message
  let unwindField; // Change the joined result to single array
  let sortPipeline; // Sort Option
  let messageFieldPipeline = []; // For the received sort case, because the joined result contains only received message, need to get the last message again.
  if (sort_type === 'received' || sort_type === 'unread') {
    lookupPipeline = {
      $lookup: {
        from: 'texts',
        localField: 'message.last_received',
        foreignField: '_id',
        as: 'last_received_text',
      },
    };
    unwindField = '$last_received_text';
    if (sort_type === 'unread') {
      // unread
      sortPipeline = {
        $sort: {
          'last_received_text.type': -1,
          'last_received_text.status': 1,
          'last_received_text.created_at': -1,
        },
      };
    } else if (sort_type === 'received') {
      // received
      sortPipeline = {
        $sort: {
          'last_received_text.created_at': -1,
        },
      };
    }
    messageFieldPipeline = [
      {
        $lookup: {
          from: 'texts',
          localField: 'message.last',
          foreignField: '_id',
          as: 'last_text',
        },
      },
      {
        $unwind: { path: '$last_text', preserveNullAndEmptyArrays: true },
      },
    ];
  } else {
    lookupPipeline = {
      $lookup: {
        from: 'texts',
        localField: 'message.last',
        foreignField: '_id',
        as: 'last_text',
      },
    };
    unwindField = '$last_text';
    sortPipeline = {
      $sort: {
        'last_text.created_at': -1,
      },
    };
  }
  const contacts = await Contact.aggregate([
    match_pipeline,
    lookupPipeline,
    {
      $unwind: { path: unwindField, preserveNullAndEmptyArrays: true },
    },
    sortPipeline,
    { $skip: skipNum },
    { $limit: getCount },
    ...messageFieldPipeline,
    {
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
        last_text: {
          _id: 1,
          content: 1,
          created_at: 1,
          type: 1,
          status: 1,
        },
        last_received_text: {
          _id: 1,
          content: 1,
          created_at: 1,
          type: 1,
          status: 1,
        },
      },
    },
  ]).catch((err) => {});

  const contactIds = [];
  const textIds = [];
  contacts.forEach((e) => {
    contactIds.push(e._id);
    if (e.last_text?._id) {
      textIds.push(e.last_text?._id);
    }
  });
  const activities = await Activity.find({
    type: 'texts',
    contacts: { $in: contactIds },
    texts: { $in: textIds },
  });
  const activitiesDic = {};
  activities.forEach((e) => {
    activitiesDic[e.contacts.toString()] = e;
  });
  contacts.forEach((e) => {
    e.activity = activitiesDic[e._id.toString()];
  });

  return res.send({
    status: true,
    data: contacts,
    count: getCount,
  });
};

const send = async (req, res) => {
  const { currentUser } = req;
  const { text } = req.body;
  const contact = await Contact.findOne({ _id: req.params.id }).catch((err) => {
    console.log('err', err);
  });
  const e164Phone = phone(contact.cell_phone)?.phoneNumber;

  let fromNumber = currentUser['proxy_number'];

  if (!fromNumber) {
    const areaCode = currentUser.cell_phone.substring(1, 4);
    const data = await twilio.availablePhoneNumbers('US').local.list({
      areaCode,
    });

    const number = data[0];
    const proxy_number = await twilio.incomingPhoneNumbers.create({
      phoneNumber: number.phoneNumber,
      smsUrl: urls.SMS_RECEIVE_URL,
    });
    currentUser['proxy_number'] = proxy_number.phoneNumber;
    fromNumber = currentUser['proxy_number'];
    currentUser.save().catch((err) => {
      console.log('err', err);
    });
  }

  console.info(`Send SMS: ${fromNumber} -> ${contact.cell_phone} :`, text);

  if (!e164Phone) {
    return res.status(400).send({
      status: false,
      error: 'Invalid phone number',
    });
  }

  await twilio.messages
    .create({ from: fromNumber, body: text, to: e164Phone })
    .catch((err) => {
      console.log('err', err);
    });

  const new_text = new Text({
    content: req.body.text,
    contact: req.params.id,
    to: e164Phone,
    from: fromNumber,
    user: currentUser.id,
  });

  new_text
    .save()
    .then((_sms) => {
      const activity = new Activity({
        content: currentUser.user_name + ' sent text',
        contacts: _sms.contact,
        user: currentUser.id,
        type: 'texts',
        text: _sms.id,
      });

      activity.save().then((_activity) => {
        const myJSON = JSON.stringify(_sms);
        const data = JSON.parse(myJSON);
        data.activity = _activity;
        res.send({
          status: true,
          data,
        });
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

const receive = async (req, res) => {
  const text = req.body['Body'];
  const from = req.body['From'];
  const to = req.body['To'];

  const currentUser = await User.findOne({ twilio_number: to }).catch((err) => {
    console.log('current user found err sms', err.message);
  });

  if (currentUser != null) {
    const phoneNumber = req.body['From'];

    const contact = await Contact.findOne({
      cell_phone: phoneNumber,
      user: currentUser.id,
    }).catch((err) => {
      console.log('contact found err sms reply', err);
    });

    if (contact) {
      const content =
        contact.first_name +
        ', please call/text ' +
        currentUser.user_name +
        ' back at: ' +
        currentUser.cell_phone;
      await twilio.messages
        .create({ from: to, body: content, to: from })
        .catch((err) => {
          console.log('sms reply err', err);
        });
    }
  }
  return res.send({
    status: true,
  });
};

const get = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;
  const textSelectPath = {
    user: 1,
    deal: 1,
    phone: 1,
    content: 1,
    from: 1,
    type: 1,
    status: 1,
    has_shared: 1,
    shared_text: 1,
    video_tracker: 1,
    pdf_tracker: 1,
    image_tracker: 1,
    service_type: 1,
    created_at: 1,
    updated_at: 1,
  };
  const contactid = mongoose.Types.ObjectId(contact);
  const data = await Text.aggregate([
    {
      $match: {
        user: currentUser._id,
        contacts: contactid,
      },
    },
    {
      $project: textSelectPath, // need to select the activity as well. update the text select path activity
    },
  ]);

  const textIds = data.map((e) => e._id);
  const activities = await Activity.find({
    contacts: contactid,
    type: 'texts',
    texts: { $in: textIds },
  }).catch((err) => {});
  const activityDics = {};
  activities.forEach((e) => {
    activityDics[e.texts + ''] = { _id: e._id, status: e.status };
  });
  data.map((e) => {
    const activity = activityDics[e._id + ''];
    e.activity = activity;
  });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

/**
 * Check the smart code of user and handle
 * @param {*} user_id: User Id String
 * @param {*} msg: Message to be smart code key
 * @param {*} contact_id: Contact Id String
 */
const checkSmartCode = async (user_id, msg, contact_id) => {
  console.log('incoming message', msg);
  const garbage = await Garbage.findOne({
    user: user_id,
  });

  const code = msg.toLowerCase().trim();
  if (garbage.smart_codes && code && garbage.smart_codes[code]) {
    const smart_code = garbage.smart_codes[code];
    handleSmartCode(user_id, smart_code, contact_id);

    if (smart_code['tag']) {
      Contact.updateOne(
        {
          _id: contact_id,
        },
        {
          $addToSet: { tags: { $each: smart_code['tag'].split(',') } },
        }
      ).catch((err) => {
        console.log('smart tag update err', err.message);
      });
    }
  }
};

/**
 * Handle the smart code (send message and automation assign)
 * @param {*} user_id: User Id
 * @param {*} smart_code: Smart code object to handle
 * @param {*} contact_id: Contact Id
 */
const handleSmartCode = async (user_id, smart_code, contact_id) => {
  // send auto-reply message
  const website = urls.DOMAIN_ADDR;
  if (smart_code['message']) {
    const text_data = {
      user: user_id,
      content: smart_code['message'],
      contacts: [contact_id],
    };

    sendText(text_data)
      .then((_res) => {
        const errors = [];
        let sentCount = 0;
        const sendStatus = {};
        const invalidContacts = [];
        const textResult = _res.splice(-1);
        _res.forEach((e) => {
          if (!e.status && !e.type) {
            errors.push(e);
          }
          if (e.isSent || e.status) {
            sentCount++;
          }
          if (e.sendStatus) {
            if (e.contact && e.contact._id) {
              sendStatus[e.contact._id] = e.sendStatus;
            }
          } else if (!e.status) {
            if (e.contact && e.contact._id) {
              invalidContacts.push(e.contact._id);
            }
          }
        });
        if (textResult && textResult[0] && textResult[0]['text']) {
          const query = { $set: { send_status: sendStatus } };
          if (invalidContacts && invalidContacts.length) {
            query['$pull'] = { contacts: { $in: invalidContacts } };
          }
          if (invalidContacts.length === 1) {
            Text.deleteOne({ _id: textResult[0]['text'] }).catch((err) => {
              console.log('remove texting is failed', err);
            });
          } else {
            Text.updateOne({ _id: textResult[0]['text'] }, query).catch(
              (err) => {
                console.log('texting result saving is failed', err);
              }
            );
          }
        }
      })
      .catch((err) => {
        console.log('send text err', err);
      });
  }

  // automation trigger
  if (smart_code['automation']) {
    const data = {
      assign_array: [contact_id],
      automation_id: smart_code['automation'],
      user_id,
      required_unique: false,
      type: 'contact',
    };

    assignTimeline(data)
      .then(({ due_date, result: _res }) => {
        if (!_res[0].status) {
          console.log('automation assign err', _res[0].error);
        }
      })
      .catch((err) => {
        console.log('assign automation err', err.message);
      });
  }
};

const receiveTextTwilio = async (req, res) => {
  let text = req.body['Body'] || '';
  const from = req.body['From'];
  const to = req.body['To'];

  if (from === api.TWILIO.SYSTEM_NUMBER || to === api.TWILIO.SYSTEM_NUMBER) {
    return res.send();
  }

  const currentUser = await User.findOne({
    twilio_number: to,
    del: false,
  }).catch((err) => {
    console.log('current user found err sms', err.message);
  });

  if (currentUser != null) {
    const phoneNumber = req.body['From'];

    if (currentUser.email === 'beforedawn018@gmail.com') {
      sendErrorToSentry(
        currentUser,
        new Error(
          'incoming the message to your account: ' + JSON.stringify(req.body)
        )
      );
    }

    let contact = await Contact.findOne({
      $or: [
        { cell_phone: phoneNumber, user: currentUser.id },
        { cell_phone: phoneNumber, shared_members: currentUser.id },
      ],
    }).catch((err) => {
      console.log('contact found err sms reply', err);
    });
    const isLeadContact = !contact; // is new contact
    if (isLeadContact) {
      contact = new Contact({
        user: currentUser.id,
        cell_phone: phoneNumber,
        first_name: phoneNumber,
        tags: ['textlead'],
      });
      await contact
        .save()
        .then(() => {})
        .catch(() => {});

      await shareContactsToOrganization(currentUser, contact._id).catch((err) =>
        console.log('share contacts to organization err', err.message)
      );
    }

    if (isLeadContact) {
      // For lead contact & optOut message case, just update that value only.
      let isOptOut = false;
      let optOutValue = false;
      if (
        text.toLowerCase().trim() === 'stop' ||
        req.body['OptOutType'] === 'STOP'
      ) {
        isOptOut = true;
        optOutValue = true;
      }
      if (
        text.toLowerCase().trim() === 'start' ||
        req.body['OptOutType'] === 'START'
      ) {
        isOptOut = true;
        optOutValue = false;
      }
      if (isOptOut) {
        await Contact.updateOne(
          { _id: { $in: contact._id } },
          { $set: { 'unsubscribe.text': optOutValue } }
        ).catch((err) => {
          console.log(err.message);
        });
        return res.send();
      }
    }

    if (
      text.toLowerCase().trim() === 'stop' ||
      req.body['OptOutType'] === 'STOP'
    ) {
      const activity = new Activity({
        content: 'unsubscribed sms',
        contacts: contact._id,
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
        { _id: contact._id },
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
    } else if (
      text.toLowerCase().trim() === 'start' ||
      req.body['OptOutType'] === 'START'
    ) {
      const activity = new Activity({
        content: 'resubscribed sms',
        contacts: contact._id,
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
        { _id: contact._id },
        {
          $set: { last_activity: _activity.id, 'unsubscribed.text': false },
        }
      ).catch((err) => {
        console.log('err', err);
      });
    } else {
      let segmentInfo;
      const segmentReg = /\((\d+)\/(\d+)\)/;
      if (segmentReg.test(text)) {
        // prev check
        const matches = text.match(segmentReg);
        if (matches.length && matches.index === 0) {
          const segmentIndex = parseInt(matches[1]);
          const segmentCounts = parseInt(matches[2]);
          if (segmentIndex > 1) {
            const currentDate = new Date(new Date().getTime() - 30000);
            const prevText = await Text.findOne(
              {
                user: currentUser.id,
                contacts: contact._id,
                type: 1,
                updated_at: { $gte: currentDate },
              },
              {},
              { sort: { created_at: -1 } }
            ).catch((err) => {
              console.log('latest text find', err);
            });
            console.log('prev text', prevText);
            if (
              prevText &&
              prevText.segment &&
              prevText.segment.index === segmentIndex - 1 &&
              prevText.segment.total === segmentCounts
            ) {
              const newText = text.replace(`${matches[0]}`, '');
              const updatedText = prevText.content + newText;
              Text.updateOne(
                { _id: prevText._id },
                {
                  $set: {
                    content: updatedText,
                    'segment.index': segmentIndex,
                  },
                }
              ).catch((err) => {
                console.log('update text error ', err.message);
              });
              return res.send();
            }
          } else {
            text = text.replace(`${matches[0]}`, '');
            segmentInfo = { index: segmentIndex, total: segmentCounts };
          }
        }
      }

      checkSmartCode(currentUser.id, text, contact._id);
      const new_text = new Text({
        user: currentUser.id,
        contacts: contact._id,
        content: text,
        status: 0,
        type: 1,
        segment: segmentInfo,
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
        content: isLeadContact
          ? 'LEAD CAPTURE - received text'
          : 'received text',
        contacts: contact._id,
        user: currentUser.id,
        type: 'texts',
        texts: new_text.id,
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      Contact.updateOne(
        { _id: contact._id },
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
      updateUserTextCount(currentUser, segmentInfo?.total || 1, true).catch(
        () => {}
      );
    }
  }
  return res.send();
};

const updateTwilioMessageStatus = async (req, res) => {
  const from = req.body['From'];
  const message_id = req.body['MessageSid'];
  const status = req.body['MessageStatus'];

  if (!from || !message_id || !status) {
    console.log('Invalid Input');
    return res.send();
  }

  const currentUser = await User.findOne({ twilio_number: from });

  const activity = await Activity.findOne({ message_id });

  if (!currentUser || !activity) {
    console.log('No valid User or Activity');
    return res.send();
  }

  const text = await Text.findOne({ _id: activity.texts });

  const activities = await Activity.find({
    texts: text._id,
    contacts: activity.contacts,
  });

  if (!text) {
    console.log('No Text');
    return res.send();
  }

  let notification = null;
  const contact = await Contact.findOne({ _id: activity.contacts });

  const triggerPayload = {
    userId: currentUser._id,
    type: 'text',
    text_activity: activity,
    text,
    status: true,
  };
  const activityIds = (activities || []).map((e) => e._id);
  if (status === 'delivered') {
    handleDeliveredText(activity.contacts, activityIds, activity._id, text._id);

    notification = {
      contact,
      textId: text._id,
      messageId: message_id,
      status,
    };
  } else if (status === 'undelivered' || status === 'failed') {
    triggerPayload.status = false;

    revertTextWithActivities(
      text._id,
      activity.contacts,
      activityIds,
      activity._id
    );

    notification = {
      userId: currentUser.id,
      contact,
      textId: text._id,
      messageId: message_id,
      status,
    };
  }

  triggerTimeline(triggerPayload);

  if (notification) {
    sendSocketNotification('messageStatus', currentUser, notification);
  }

  return res.send();
};

const getWavvState = async (req, res) => {
  const { currentUser } = req;

  let wavvUserId = currentUser._id;

  if (currentUser.source === 'vortex') {
    try {
      wavvUserId = await getWavvIDWithVortexId(currentUser.vortex_id);
    } catch (error) {
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    }
  }

  const user = await getWavvUserState(wavvUserId, currentUser.source);

  const data = { subscriptions: user?.subscriptions, hasWavvUser: !!user };

  if (data?.subscriptions?.sms) {
    const response = await getWavvBrandState(wavvUserId, currentUser.source);
    if (response) {
      data.brandStatus = response;
      if (data.brandStatus?.status)
        data.brandStatus.status = data.brandStatus.status.toUpperCase();
    }

    const numbers =
      (await listWavvNumbers(wavvUserId, currentUser.source)) || [];

    if (numbers.length > 0 && data.brandStatus?.status === 'APPROVED') {
      await User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            wavv_number: numbers[0].number,
          },
        }
      );

      data.number = numbers[0].number;
    }
  }

  return res.send({
    status: true,
    data,
  });
};

const updateSubscription = async (req, res) => {
  const { currentUser } = req;
  const { subscriptions } = req.body;

  let wavvUserId = currentUser._id;
  if (currentUser.source === 'vortex') {
    wavvUserId = currentUser.vortex_id;
  }
  let user;
  try {
    user = await getWavvUserState(wavvUserId, currentUser.source);
  } catch (err) {
    return res.status(400).send({
      status: false,
      error: err.message || 'Getting wavv user information is failed.',
    });
  }

  if (!user) {
    return res.status(400).send({
      status: false,
      error: `We couldn't find the wavv user account.`,
    });
  }

  const response = await updateWavvSubscription(
    wavvUserId,
    { subscriptions },
    currentUser.source
  );

  return res.send({
    status: true,
    data: response,
  });
};

const searchNumbers = async (req, res) => {
  const { currentUser } = req;
  const { dialCode = '+1', countryCode = 'US', searchCode } = req.body;

  let areaCode;
  const data = [];
  const phone = currentUser.phone;
  if (searchCode) {
    areaCode = searchCode;
  } else {
    if (phone && phone.number) {
      areaCode = phone.number.replace(/\s/g, '').substring(0, 3);
    } else {
      areaCode = currentUser.cell_phone.substring(1, 4);
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

const createTwilioNumber = async (currentUser, number, res) => {
  const garbage = await Garbage.find({ user: currentUser._id }).catch(() => {
    console.log('garbage is not found');
  });
  const { twilio_sub_account } = garbage;
  const originalScope = currentUser.twilio_number_scope || 'primary';
  const scope =
    twilio_sub_account && twilio_sub_account.is_enabled
      ? 'subaccount'
      : 'primary';
  let client = twilio;
  if (twilio_sub_account && twilio_sub_account.is_enabled) {
    const { sid, auth_token } = twilio_sub_account;
    client = twilioFactory(sid, auth_token);
  }

  if (currentUser.twilio_number_id) {
    releaseTwilioNumber(
      currentUser.twilio_number_id,
      originalScope === 'subaccount' ? currentUser._id : null
    );
  }

  client.incomingPhoneNumbers
    .create({
      friendlyName: currentUser.user_name,
      phoneNumber: number,
      smsUrl: urls.SMS_RECEIVE_URL,
      voiceUrl: urls.CALL_RECEIVE_URL,
    })
    .then((incoming_phone_number) => {
      User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            twilio_number: number,
            twilio_number_id: incoming_phone_number.sid,
            twilio_number_scope: scope,
          },
        }
      )
        .then(async () => {
          try {
            if (
              garbage?.twilio_brand_info?.service &&
              garbage?.twilio_brand_info?.identityStatus === 'VERIFIED'
            ) {
              const status = await attachPhoneNumberOwnService(
                incoming_phone_number.sid,
                garbage.twilio_brand_info.service,
                currentUser._id
              );
              if (!status) {
                attachPhoneNumberToService(incoming_phone_number.sid);
              }
            } else {
              attachPhoneNumberToService(incoming_phone_number.sid);
            }
          } catch (err) {
            Sentry.captureException(
              new Error(
                'Attaching the phone number to twilio service is failed.'
              )
            );
          }
          return res.send({
            status: true,
          });
        })
        .catch((_) => {
          sendErrorToSentry(
            currentUser,
            new Error(
              `Twilio number(${number}) is registered. But it is not saved user.`
            )
          );
        });
    })
    .catch((err) => {
      console.log('proxy number error', err);
    });
};

const buyNumbers = async (req, res) => {
  const { currentUser } = req;

  if (!req.body.number) {
    return res.status(400).json({
      status: false,
      error: 'Please select the number',
    });
  }

  const { captchaToken } = req.body;

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

  const shouldPay = currentUser.text_info.is_limit && currentUser.twilio_number;
  if (shouldPay) {
    // Pay and create Twilio Number (with release)
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
    const amount = system_settings.TWILIO_EXCHANGE_NUMBER;
    const description = 'Update Phone number';

    const data = {
      customer_id: payment.customer_id,
      receipt_email: currentUser.email,
      amount,
      description,
    };

    createCharge(data)
      .then(() => {
        const time_zone = getUserTimezone(currentUser);

        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            last_4_cc: payment.last4,
            invoice_id: '',
            amount: system_settings.TWILIO_EXCHANGE_NUMBER,
          },
          template_name: 'PaymentNotification',
          required_reply: false,
          email: currentUser.email,
          cc: mail_contents.REPLY,
          source: currentUser.source,
        };

        sendNotificationEmail(data);

        createTwilioNumber(currentUser, req.body.number, res);
      })
      .catch((err) => {
        console.log('card payment err', err);
        return res.status(400).json({
          status: false,
          error: err.message,
        });
      });
  } else {
    createTwilioNumber(currentUser, req.body.number, res);
  }
};

const buyCredit = async (req, res) => {
  const { currentUser } = req;
  if (currentUser.text_info.is_limit && !currentUser.payment) {
    return res.status(400).json({
      status: false,
      error: 'Please connect your card',
    });
  }

  const { captchaToken } = req.body;

  if (!captchaToken) {
    return res.status(400).json({
      status: false,
      error: 'Invalid Request!',
    });
  }

  try {
    if (!(await checkRecaptchaToken(captchaToken))) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Request!',
      });
    }
    let price;
    let amount;
    const description = 'Buy sms credit';
    if (req.body.option === 1) {
      price = system_settings.SMS_CREDIT[0].PRICE;
      amount = system_settings.SMS_CREDIT[0].AMOUNT;
    } else if (req.body.option === 2) {
      price = system_settings.SMS_CREDIT[1].PRICE;
      amount = system_settings.SMS_CREDIT[1].AMOUNT;
    } else if (req.body.option === 3) {
      price = system_settings.SMS_CREDIT[2].PRICE;
      amount = system_settings.SMS_CREDIT[2].AMOUNT;
    }
    let { additional_credit } = currentUser.text_info;
    if (additional_credit) {
      additional_credit.updated_at = new Date();
      additional_credit.amount += amount;
    } else {
      additional_credit = {
        updated_at: new Date(),
        amount,
      };
    }

    const time_zone = getUserTimezone(currentUser);
    const email_data = {
      template_data: {
        user_name: currentUser.user_name,
        created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
        amount: price / 100,
      },
      template_name: 'PaymentNotification',
      required_reply: false,
      email: currentUser.email,
      cc: mail_contents.REPLY,
      source: currentUser.source,
    };

    if (currentUser.text_info.is_limit && currentUser.payment) {
      const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
        (error) => {
          throw new Error('by sms credit err', error.message);
        }
      );

      const charge_data = {
        customer_id: payment.customer_id,
        receipt_email: currentUser.email,
        amount: price,
        description,
      };
      await createCharge(charge_data)
        .then((_res) => {
          email_data['invoice_id'] = _res.invoice || '';
        })
        .catch((error) => {
          throw new Error(
            'Payment failed, please contact support team:',
            error.message
          );
        });
    }

    sendNotificationEmail(email_data);

    await User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          'text_info.additional_credit': additional_credit,
        },
      }
    ).catch((err) => {
      throw new Error('user paid demo update err', err.message);
    });
    return res.status(200).json({
      status: true,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const buyWavvSubscription = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.payment) {
    return res.status(400).json({
      status: false,
      error: 'Please connect your card',
    });
  }

  // if user's source is vortex, need to return
  if (currentUser.source === 'vortex') {
    return res.status(400).json({
      status: false,
      error: 'Invalid request',
    });
  }

  // get the wavv account
  const wavvUserId = currentUser._id + '';
  let user;
  try {
    user = await getWavvUserState(wavvUserId, 'crmgrow');
  } catch (err) {
    return res.status(400).send({
      status: false,
      error: err.message || 'Getting wavv user information is failed',
    });
  }

  try {
    const price = 2000;
    const description =
      'Payment for the wavv brand registration to active sms feature';
    const { initial_credit } = currentUser.text_info;
    if (!initial_credit) {
      const time_zone = getUserTimezone(currentUser);
      const email_data = {
        template_data: {
          user_name: currentUser.user_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          amount: price / 100,
        },
        template_name: 'PaymentNotification',
        required_reply: false,
        email: currentUser.email,
        cc: mail_contents.REPLY,
        source: currentUser.source,
      };

      if (currentUser.payment) {
        const payment = await Payment.findOne({
          _id: currentUser.payment,
        }).catch((error) => {
          throw new Error('by sms credit err', error.message);
        });

        const charge_data = {
          customer_id: payment.customer_id,
          receipt_email: currentUser.email,
          amount: price,
          description,
        };
        await createCharge(charge_data)
          .then((_res) => {
            email_data['invoice_id'] = _res.invoice || '';
          })
          .catch((error) => {
            throw new Error(
              'Payment failed, please contact support team:',
              error.message
            );
          });
      }

      sendNotificationEmail(email_data);

      await User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            'text_info.initial_credit': true,
            'wavv_status.value': 'SUBSCRIBED',
            'wavv_status.updated_at': new Date(),
          },
        }
      ).catch((err) => {
        throw new Error('user paid demo update err', err.message);
      });
    }

    try {
      if (user) {
        await updateWavvSubscription(
          wavvUserId,
          { subscriptions: { sms: true, smsBrandRegistration: true } },
          'crmgrow'
        );
      } else {
        const userNames = (currentUser.user_name || '').split(' ');
        const firstName = userNames[0] || '';
        const lastName = userNames[1] || '';
        await createWavvUser(
          {
            id: wavvUserId,
            email: currentUser.email,
            firstName,
            lastName,
            phone: currentUser.phone.number,
            subscriptions: { sms: true, smsBrandRegistration: true },
          },
          currentUser.source
        );
      }
    } catch (err) {
      return res.status(400).send({
        status: false,
        error: err.message || 'Enabling the sms feature using wavv is failed.',
      });
    }

    return res.status(200).json({
      status: true,
    });
  } catch (error) {
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  }
};

const markAsRead = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;
  Text.updateOne(
    {
      _id: req.params.id,
      user: currentUser._id,
      contacts: contact,
    },
    {
      $set: {
        status: 1,
      },
    }
  ).catch((err) => {
    console.log('text update err', err.message);
  });
  Text.updateMany(
    {
      _id: { $lte: req.params.id },
      user: currentUser._id,
      contacts: contact,
    },
    { $set: { status: 1 } }
  )
    .then(async () => {
      // Notify about the unreaded texts count
      const unreadText = await Text.findOne({
        user: currentUser._id,
        status: 0,
        type: 1,
      }).catch(() => {});
      sendSocketNotification('clear_notification', currentUser, {
        unreadTexts: !!unreadText,
      });
    })
    .catch((err) => {
      console.log('text update err', err.message);
    });

  return res.send({
    status: true,
  });
};

const loadFiles = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const videoIds = [];
  const pdfIds = [];
  const imageIds = [];
  let videos = [];
  let pdfs = [];
  let images = [];
  let videoTrackers = [];
  let imageTrackers = [];
  let pdfTrackers = [];
  const videoActivities = [];
  const pdfActivities = [];
  const imageActivities = [];
  const sendAtIndex = {};
  const texts = await Text.find({
    user: currentUser._id,
    contacts: contact,
  })
    .select('_id')
    .catch((err) => {
      console.log('Finding contact text is failed', err);
    });
  if (texts && texts.length) {
    const textIds = texts.map((e) => e._id);
    const sendActivities = await Activity.find({
      user: currentUser._id,
      texts: { $in: textIds },
      type: { $in: ['videos', 'pdfs', 'images'] },
    }).catch((err) => {
      console.log('Sending Activity getting is failed', err);
    });

    sendActivities.forEach((e) => {
      switch (e.type) {
        case 'videos':
          videoIds.push(e.videos[0]);
          videoActivities.push(e._id);
          if (sendAtIndex[e.videos[0]]) {
            sendAtIndex[e.videos[0]].push(e.updated_at);
          } else {
            sendAtIndex[e.videos[0]] = [e.updated_at];
          }
          break;
        case 'pdfs':
          pdfIds.push(e.pdfs[0]);
          pdfActivities.push(e._id);
          if (sendAtIndex[e.pdfs[0]]) {
            sendAtIndex[e.pdfs[0]].push(e.updated_at);
          } else {
            sendAtIndex[e.pdfs[0]] = [e.updated_at];
          }
          break;
        case 'images':
          imageIds.push(e.images[0]);
          imageActivities.push(e._id);
          if (sendAtIndex[e.images[0]]) {
            sendAtIndex[e.images[0]].push(e.updated_at);
          } else {
            sendAtIndex[e.images[0]] = [e.updated_at];
          }
          break;
      }
    });

    if (videoActivities.length) {
      videoTrackers = await VideoTracker.find({
        contact,
        activity: { $in: videoActivities },
      }).catch(() => {
        console.log('Video Tracking getting failed');
      });
      videos = await Video.find({
        _id: { $in: videoIds },
      })
        .select('_id title preview thumbnail duration')
        .catch(() => {
          console.log('video getting failed');
        });
    }
    if (pdfActivities.length) {
      pdfTrackers = PDFTracker.find({
        contact,
        activity: { $in: pdfActivities },
      }).catch(() => {
        console.log('PDF Tracking getting failed');
      });
      pdfs = await PDF.find({
        _id: { $in: pdfIds },
      })
        .select('_id title preview')
        .catch(() => {
          console.log('pdf getting failed');
        });
    }
    if (imageActivities.length) {
      imageTrackers = ImageTracker.find({
        contact,
        activity: { $in: imageActivities },
      }).catch(() => {
        console.log('Image Tracking getting failed');
      });
      images = await Image.find({
        _id: { $in: imageIds },
      })
        .select('_id title preview')
        .catch(() => {
          console.log('image getting failed');
        });
    }
  }

  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
      videoTrackers,
      imageTrackers,
      pdfTrackers,
      sendAtIndex,
    },
  });
};

const moveNumber = async (req, res) => {
  const { currentUser } = req;
  const { twilio_number_id } = currentUser;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  const { twilio_sub_account } = garbage;
  const { sid } = twilio_sub_account;
  twilio
    .incomingPhoneNumbers(twilio_number_id)
    .update({ accountSid: sid })
    .then(async (_number) => {
      console.log('number', _number);
      await User.updateOne(
        { _id: currentUser._id },
        { $set: { twilio_number_scope: 'subaccount' } }
      ).catch(() => {
        console.log('phone number scope saving is failed');
      });
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('twilio is failed.', err);
      return res.status(400).send({
        status: false,
      });
    });
};

const attachPhone2Service = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  const { service } = garbage.twilio_brand_info;
  const { twilio_number_id } = currentUser;
  const { auth_token, sid } = garbage.twilio_sub_account;
  const client = twilioFactory(sid, auth_token);

  const attachedPhone = await client.messaging.v1
    .services(service)
    .phoneNumbers.create({ phoneNumberSid: twilio_number_id })
    .catch((err) => {
      console.log('phone number attaching is failed', err);
    });
  console.log('attached Phone', attachedPhone);
  return res.send({
    status: true,
  });
};

const inspectTwilioStatus = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  const { auth_token, sid } = garbage.twilio_sub_account;
  const client = twilioFactory(sid, auth_token);
  // End User
  client.numbers.v2.regulatoryCompliance.endUsers
    .list({ limit: 20 })
    .then((endUsers) => endUsers.forEach((e) => console.log(e)));
  // Address
  client.addresses
    .list({ limit: 1000 })
    .then((addresses) => addresses.forEach((a) => console.log(a)));
  // Address Document
  client.numbers.v2.regulatoryCompliance.supportingDocuments
    .list({ limit: 20 })
    .then((supportingDocuments) =>
      supportingDocuments.forEach((s) => console.log(s))
    );

  // Attached Entity (AttachedUser & attachedDocument)
  if (garbage?.twilio_brand_info?.customerProfile) {
    const customerProfile = garbage.twilio_brand_info.customerProfile;
    client.trusthub.v1
      .customerProfiles(customerProfile)
      .customerProfilesEntityAssignments.list({ limit: 20 })
      .then((customerProfilesEntityAssignments) =>
        customerProfilesEntityAssignments.forEach((c) => console.log(c))
      );
  }
  // Trust Products (bundle)
  client.trusthub.v1.trustProducts
    .list({ limit: 20 })
    .then((trustProducts) => trustProducts.forEach((t) => console.log(t)));

  // Attached Trust Products (attached bundle)
  if (garbage.twilio_brand_info && garbage.twilio_brand_info.bundle) {
    const bundle = garbage.twilio_brand_info.bundle;
    client.trusthub.v1
      .trustProducts(bundle)
      .trustProductsEntityAssignments.list({ limit: 20 })
      .then((trustProductsEntityAssignments) =>
        trustProductsEntityAssignments.forEach((t) => console.log(t))
      );
  }

  // client.messaging.services.list({ limit: 20 }).then(trustProductsEntityAssignments => trustProductsEntityAssignments.forEach(t => console.log(t)));
  // client.messaging.v1.services('MGb0ac6dbca02b2b4da2272b3a1f3c6c6d')
  // .phoneNumbers
  // .list({limit: 20})
  // .then(phoneNumbers => console.log(phoneNumbers));
  return res.send({
    status: true,
  });
};

const clearTwilioStatus = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  const { twilio_brand_info } = garbage;
  await downBrand(twilio_brand_info, currentUser._id);
  return {
    status: true,
  };
};

const getTwilioStatus = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    () => {}
  );
  if (!garbage || !garbage.twilio_brand_info) {
    return res.status(400).send({
      status: false,
    });
  }
  const { twilio: client } = getTwilio(currentUser._id);
  const { twilio_brand_info } = garbage;
  const { customerProfile } = twilio_brand_info;
  client.trusthub.v1
    .customerProfiles(customerProfile)
    .fetch()
    .then((profile) => {
      res.send({
        status: true,
        data: profile,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: true,
        error: err.message,
      });
    });
};

const createSubAccount = async (req, res) => {
  const { currentUser } = req;
  const client = twilioFactory(accountSid, authToken);
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  if (
    garbage &&
    garbage.twilio_sub_account &&
    garbage.twilio_sub_account.is_enabled
  ) {
    return res.send({
      status: true,
      data: '',
    });
  }
  // Garbage twilio subaccount check
  const username = currentUser.user_name;
  client.api.accounts
    .create({ friendlyName: username })
    .then(async (account) => {
      const sid = account.sid;
      const token = account.authToken;
      await Garbage.updateOne(
        { user: currentUser._id },
        {
          $set: {
            twilio_sub_account: {
              is_enabled: true,
              sid,
              auth_token: token,
            },
          },
        }
      ).catch((err) => {
        console.log('user update err', err.message);
      });
      return res.send({
        status: true,
        data: {
          is_enabled: true,
          sid,
        },
      });
    })
    .catch((err) => {
      console.log('sub account creation is failed', err);
    });
};

const downBrand = async (data, userId) => {
  const { twilio: client } = await getTwilio(userId);
  const {
    customerProfile,
    endUser,
    address,
    addressDocument,
    attachedUser,
    attachedDocument,
    attachedCustomerProfile,
    customProfileEvaluation,
    bundle,
    endSoleUser,
    attachedEndSoleUser,
    attachedBundle,
    evaluation,
    brand,
    service,
    attachedService,
  } = data;
  if (attachedService) {
    // phoneNumbers
    try {
      await client.messaging.v1
        .services(service)
        .phoneNumbers(phone)
        .remove()
        .catch((err) => {
          console.log('remove attached service is failed.', err);
        });
    } catch (err) {
      console.log('remove attached service is failed.', err);
    }
  }
  if (service) {
    // services
    try {
      await client.messaging.v1
        .services(service)
        .remove()
        .catch((err) => {
          console.log('remove messaging service is failed.', err);
        });
    } catch (err) {
      console.log('remove messaging service is failed.', err);
    }
  }
  if (brand) {
    // brandRegistrations
    // try {
    //   await client.messaging.v1
    //     .brandRegistrations(brand)
    //     .remove()
    //     .catch((err) => {
    //       console.log('brand registration removing is failed.', err);
    //     });
    // } catch (err) {
    //   console.log('brand registration removing is failed.', err);
    // }
  }
  if (evaluation) {
    // trustProductsEvaluations
    try {
      await client.trusthub.v1
        .trustProducts(bundle)
        .trustProductsEvaluations(evaluation)
        .remove()
        .catch((err) => {
          console.log('bundle evaluation removing is failed.', err);
        });
    } catch (err) {
      console.log('bundle evaluation removing is failed.', err);
    }
  }
  if (attachedBundle) {
    // Detach the bundle from customer profile connection (attachedBundle)
    try {
      await client.trusthub.v1
        .trustProducts(bundle)
        .trustProductsEntityAssignments(attachedBundle)
        .remove()
        .catch((err) => {
          console.log('attached bundle removing is failed.', err);
        });
    } catch (err) {
      console.log('attached bundle removing is failed.', err);
    }
  }
  if (attachedEndSoleUser) {
    // detach the bundle from endsoleuser (attachedEndSoleUser)
    try {
      await client.trusthub.v1
        .trustProducts(bundle)
        .trustProductsEntityAssignments(attachedEndSoleUser)
        .remove()
        .catch((err) => {
          console.log('attached sole user removing is failed.', err);
        });
    } catch (err) {
      console.log('attached sole user removing is failed.', err);
    }
  }
  if (endSoleUser) {
    // Remove End sole user remove (endSoleUser)
    try {
      await client.trusthub.v1
        .endUsers(endSoleUser)
        .remove()
        .catch((err) => {
          console.log('sole user removing is failed.', err);
        });
    } catch (err) {
      console.log('sole user removing is failed.', err);
    }
  }
  if (bundle) {
    // Remove the bundle
    try {
      await client.trusthub.v1
        .trustProducts(bundle)
        .remove()
        .catch((err) => {
          console.log('bundle removing is failed.', err);
        });
    } catch (err) {
      console.log('bundle removing is failed.', err);
    }
  }
  if (customProfileEvaluation) {
    // customerProfilesEvaluations
    try {
      await client.trusthub.v1
        .customerProfiles(customerProfile)
        .customerProfilesEvaluations(customProfileEvaluation)
        .remove()
        .catch((err) => {
          console.log('customer profile evaluation removing is failed.', err);
        });
    } catch (err) {
      console.log('customer profile evaluation removing is failed.', err);
    }
  }
  if (attachedCustomerProfile) {
    // Detach the customer profile from  PRIMARY_CUSTOMER_PROFILE (attachedCustomerProfile)
    try {
      await client.trusthub.v1
        .customerProfiles(customerProfile)
        .customerProfilesEntityAssignments(attachedCustomerProfile)
        .remove()
        .catch((err) => {
          console.log('attached customer profile removing is failed.', err);
        });
    } catch (err) {
      console.log('attached customer profile removing is failed.', err);
    }
  }
  if (attachedDocument) {
    // Detach Addresss Document from customer Profile
    await client.trusthub.v1
      .customerProfiles(customerProfile)
      .customerProfilesEntityAssignments(attachedDocument)
      .remove()
      .catch((err) => {
        console.log('attached document removing is failed.', err);
      });
  }
  if (attachedUser) {
    // Detatch the end user from customer profile
    await client.trusthub.v1
      .customerProfiles(customerProfile)
      .customerProfilesEntityAssignments(attachedUser)
      .remove()
      .catch((err) => {
        console.log('attached user removing is failed.', err);
      });
  }
  if (addressDocument) {
    // supportingDocuments
    await client.trusthub.v1
      .supportingDocuments(addressDocument)
      .remove()
      .catch((err) => {
        console.log('address document removing is failed', err);
      });
  }
  if (address) {
    // addresses
    await client
      .addresses(address)
      .remove()
      .catch((err) => {
        console.log('address removing is failed.', err);
      });
  }
  if (endUser) {
    // endUsers
    await client.trusthub.v1
      .endUsers(endUser)
      .remove()
      .catch((err) => {
        console.log('end user removing is failed.', err);
      });
  }
  if (customerProfile) {
    // customerProfiles
    await client.trusthub.v1
      .customerProfiles(customerProfile)
      .remove()
      .catch((err) => {
        console.log('customer profile removing is failed.', err);
      });
  }
};

const getStarterBrandStatus = async (req, res) => {
  const { currentUser } = req;
  const { twilio: client, garbage } = await getTwilio(currentUser._id);
  if (garbage?.twilio_brand_info?.brand) {
    const brandStatus = await client.messaging.v1
      .brandRegistrations(garbage?.twilio_brand_info?.brand)
      .fetch()
      .catch((err) => {
        console.log('brand registration fetch failed', err);
        throw new Error('brand registration fetch failed');
      });
    const garbageData = {
      'twilio_brand_info.identityStatus': brandStatus.identityStatus,
      'twilio_brand_info.status': brandStatus.status,
    };
    const statusData = {
      identityStatus: brandStatus.identityStatus,
      status: brandStatus.status,
    };

    const { campaign, service } = garbage.twilio_brand_info;
    if (campaign) {
      const campaignDetail = await client.messaging.v1
        .services(service)
        .usAppToPerson(campaign)
        .fetch()
        .catch((err) => {
          console.log('campaign registration fetch failed', err);
          throw new Error('campaign registration fetch failed');
        });
      if (campaignDetail) {
        garbageData['twilio_brand_info.campaignStatus'] =
          campaignDetail.campaignStatus;
        statusData['campaignStatus'] = campaignDetail.campaignStatus;
      }
    }

    await Garbage.updateOne(
      { user: currentUser._id },
      {
        $set: garbageData,
      }
    ).catch(() => {});

    return res.send({
      status: true,
      data: statusData,
    });
  } else {
    return res.status(400).send({
      status: false,
      error: 'twilio_brand_unregistered',
    });
  }
};

const sendStarterBrandOtp = async (req, res) => {
  const { currentUser } = req;
  const { twilio: client, garbage } = await getTwilio(currentUser._id);
  if (garbage?.twilio_brand_info?.brand) {
    const brand = garbage?.twilio_brand_info?.brand;
    // (3.1) Fetch the brand registration status
    const brandStatus = client.messaging.v1
      .brandRegistrations(brand)
      .fetch()
      .catch((err) => {
        console.log('brand registration fetch failed', err);
        throw new Error('brand registration fetch failed');
      });
    if (!brandStatus || brandStatus?.status !== 'APPROVED') {
      return res.status(400).send({
        status: false,
        error: 'twilio_brand_not_approved',
      });
    }
    if (brandStatus?.identity_status === 'VERIFIED') {
      return res.status(400).send({
        status: false,
        error: 'twilio_brand_already_verified',
      });
    }
    // (3.2) [Optional] Retry OTP Verification for the submitted mobile number
    await client.messaging.v1
      .brandRegistrations(brand)
      .brandRegistrationOtps.create()
      .catch((err) => {
        console.log('otp failed err', err);
        throw new Error('OPT code sending is failed');
      });
  } else {
    return res.status(400).send({
      status: false,
      error: 'twilio_brand_unregistered',
    });
  }
};

const createStarterBrandMessagingService = async (req, res) => {
  const { currentUser } = req;
  const { twilio: client, garbage } = await getTwilio(currentUser._id);
  if (!garbage?.twilio_brand_info?.requestInfo) {
    return res.status(400).send({
      status: false,
      error: 'twilio_brand_unregistered',
    });
  }
  const { companyName } = garbage.twilio_brand_info.requestInfo;
  const { user_name } = currentUser;
  const serviceName = companyName || user_name;
  const { service: existingService } = garbage?.twilio_brand_info || {};
  if (existingService) {
    return res.status(400).send({
      status: false,
      error: 'Already registered the service. Please reload the page',
    });
  }

  // (4) Message Service With incoming message handler
  const service = await client.messaging.v1.services
    .create({
      inboundRequestUrl: 'https://ecsbe.crmgrow.com/api/sms/receive-twilio/',
      fallbackUrl: 'https://ecsbe.crmgrow.com/api/call/fallback-twilio/',
      friendlyName: `${serviceName} service`,
    })
    .catch((err) => {
      console.log('messaging service is not failed.', err);
      throw new Error('twilio messaging service create is failed.');
    });

  if (!service?.sid) {
    return res.status(400).send({
      status: false,
      error: 'Twilio messaging service creation is failed.',
    });
  }

  let isShortLink = true;
  await client.messaging.v1
    .linkshorteningMessagingService(api.TWILIO.TWILIO_DOMAIN_ID, service?.sid)
    .create()
    .catch((err) => {
      console.log('add link shortening is not failed.', err);
      sendErrorToSentry(currentUser, new Error('Link shortening is failed'));
      isShortLink = false;
      // throw new Error('add link shortening is failed.');
    });

  await Garbage.updateOne(
    {
      user: currentUser._id,
    },
    {
      $set: {
        'twilio_brand_info.service': service.sid,
        'twilio_brand_info.shortLink': isShortLink,
      },
    }
  );

  return res.send({
    status: true,
    data: {
      service: service.sid,
    },
  });
};

const attachPhoneNumberToBrandService = async (req, res) => {
  const { currentUser } = req;
  const { twilio: client, garbage } = await getTwilio(currentUser._id);
  const { twilio_number_id } = currentUser;
  const { service } = garbage?.twilio_brand_info || {};
  // Check the Phone number Service
  const existingService = await getPhoneNumberService(client, twilio_number_id);
  if (existingService) {
    // Detach the phone number from prev service
    await client.messaging.v1
      .services(existingService.serviceSid)
      .phoneNumbers(twilio_number_id)
      .remove()
      .catch((err) => {
        console.log('err', err);
        throw new Error('Detaching the phone number from existing service');
      });
  }

  // (4.1) attach the sender to the service
  const attachedService = await client.messaging.v1
    .services(service)
    .phoneNumbers.create({ phoneNumberSid: twilio_number_id })
    .catch((err) => {
      sendErrorToSentry(currentUser, new Error(err.message));
      downBrand({ service: service?.sid }, currentUser._id);
      throw new Error(err.message);
    });

  await Garbage.updateOne(
    {
      user: currentUser._id,
    },
    {
      $set: {
        'twilio_brand_info.attachedService': attachedService?.sid,
      },
    }
  );

  return res.send({
    status: true,
  });
};

const updateStarterBrand = async (req, res) => {
  const { currentUser } = req;
  const {
    customerFirstName,
    customerLastName,
    customerEmail,
    customerPhone,
    street,
    city,
    region,
    postalCode,
    isoCountry,
  } = req.body;
  const user_name = `${customerFirstName} ${customerLastName}`;

  const { twilio: client, garbage } = await getTwilio(currentUser._id);
  const originalRequest = garbage.twilio_brand_info?.requestInfo || {};
  const isChangedCustomerFirstName =
    customerFirstName !== originalRequest.customerFirstName;
  const isChangedCustomerLastName =
    customerLastName !== originalRequest.customerLastName;
  const isChangedCustomerEmail =
    customerEmail !== originalRequest.customerEmail;
  const isChangedCustomerPhone =
    customerPhone !== originalRequest.customerPhone;
  const isChangedAddress =
    street !== originalRequest.street ||
    city !== originalRequest.city ||
    region !== originalRequest.region ||
    postalCode !== originalRequest.postalCode ||
    isoCountry !== originalRequest.isoCountry;

  const { customerProfile, endUser, address, endSoleUser, bundle } =
    garbage.twilio_brand_info || {};
  // End User Update
  try {
    if (
      isChangedCustomerFirstName ||
      isChangedCustomerLastName ||
      isChangedCustomerEmail ||
      isChangedCustomerPhone
    ) {
      await client.trusthub.v1.endUsers(endUser).update({
        attributes: {
          first_name: customerFirstName,
          last_name: customerLastName,
          email: customerEmail,
          phone_number: customerPhone,
        },
        friendlyName: `${user_name} profile end user`,
      });
    }
    // Address Update
    if (isChangedAddress) {
      await client.addresses(address).update({
        customerName: `${user_name}`,
        street,
        city,
        region,
        postalCode,
        isoCountry,
      });
    }
    // Customer Profile Update
    await client.trusthub.v1.customerProfiles(customerProfile).update({
      email: customerEmail,
      status: 'pending-review',
    });

    if (
      isChangedCustomerFirstName ||
      isChangedCustomerLastName ||
      isChangedCustomerPhone
    ) {
      // Sole End User Update
      await client.trusthub.v1.endUsers(endSoleUser).update({
        attributes: {
          brand_name: `${customerFirstName} ${customerLastName}`,
          vertical: 'COMMUNICATION',
          mobile_phone_number: customerPhone,
        },
        friendlyName: `Sole Proprietor A2P Trust Bundle End User ${customerFirstName}`,
      });
    }
    // Bundle Update
    await client.trusthub.v1.trustProducts(bundle).update({
      friendlyName: `A2P Starter for ${user_name}`,
      email: customerEmail,
      status: 'pending-review',
    });

    await Garbage.updateOne(
      {
        user: currentUser._id,
      },
      {
        $set: {
          'twilio_brand_info.requestInfo': req.body,
        },
      }
    );

    return res.send({
      status: true,
    });
  } catch (err) {
    Sentry.captureException(
      new Error(
        'Twilio Brand updating is failed.' +
          currentUser._id +
          '.Error:' +
          err.message
      )
    );
    return res.statu(500).send({
      status: false,
      error: 'internal_server_error',
    });
  }
};

const createStarterBrand = async (req, res) => {
  const { currentUser } = req;
  const {
    customerFirstName,
    customerLastName,
    customerEmail,
    customerPhone,
    street,
    city,
    region,
    postalCode,
    isoCountry,
  } = req.body;

  const user_name = `${customerFirstName} ${customerLastName}`;

  const PRIMARY_CUSTOMER_PROFILE = 'BU3a1cd1085ebcdd4f40adc952334076f6';
  const STARTER_CUSTOMER_POLICY = 'RN806dd6cd175f314e1f96a9727ee271f4';
  const A2P_TRUST_POLICY = 'RN670d5d2e282a6130ae063b234b6019c8';

  const { twilio: client } = await getTwilio(currentUser._id);
  const brandData = {};
  // Optional: (1.1) Fetch the Starter Customer Profile Policy
  // (1.2) Create a Starter Customer Profile Bundle [sid: BU***]
  const customerProfile = await client.trusthub.v1.customerProfiles
    .create({
      friendlyName: `${user_name} customer profile(sole proprietor)`,
      email: customerEmail,
      policySid: STARTER_CUSTOMER_POLICY,
    })
    .catch((err) => {
      console.log('customer profile create failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['customerProfile'] = customerProfile?.sid;
  // (1.3) Create an end-user object with the type [sid: IT***]
  const endUser = await client.trusthub.v1.endUsers
    .create({
      attributes: {
        first_name: customerFirstName,
        last_name: customerLastName,
        email: customerEmail,
        phone_number: customerPhone,
      },
      friendlyName: `${user_name} profile end user`,
      type: 'starter_customer_profile_information',
    })
    .catch((err) => {
      console.log('end user create failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['endUser'] = endUser?.sid;
  // (1.4) Create a supporting document with customer profile address [SID: AD***]
  const address = await client.addresses
    .create({
      customerName: `${user_name}`,
      street,
      city,
      region,
      postalCode,
      isoCountry,
    })
    .catch((err) => {
      console.log('address creating failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['address'] = address.sid;
  // (1.5) Create a Supporting Document with the data from 1.4 [SID: RD***]
  const addressDocument = await client.trusthub.v1.supportingDocuments
    .create({
      attributes: {
        address_sids: address.sid,
      },
      friendlyName: `${user_name} SP Document Address`,
      type: 'customer_profile_address',
    })
    .catch((err) => {
      console.log('address document creating failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['addressDocument'] = addressDocument?.sid;
  // (1.6.1) Attach the end-user (from Step 1.3) to the Starter Customer Profile [SID: BV***]
  const attachedUser = await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({ objectSid: endUser.sid })
    .catch((err) => {
      console.log('user attaching failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['attachedUser'] = attachedUser.sid;
  // (1.6.2) Attach the Supporting Document (from Step 1.4) to the Starter Customer Profile [SID: BV***]
  const attachedDocument = await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({
      objectSid: addressDocument.sid,
    })
    .catch((err) => {
      console.log('address document attaching failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['attachedDocument'] = attachedDocument.sid;
  // (1.6.3) Attach the Primary Customer Profile Bundle to the Starter Customer Profile Bundle [SID: BV***]
  // BU7484a4d7a8bff5c9fbb872974e133dd8
  const attachedCustomerProfile = await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEntityAssignments.create({
      objectSid: PRIMARY_CUSTOMER_PROFILE,
    })
    .catch((err) => {
      console.log('attach customer profile to primary', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['attachedCustomerProfile'] = attachedCustomerProfile?.sid;
  // (1.7) Evaluate the Starter Customer Profile
  const customProfileEvaluation = await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .customerProfilesEvaluations.create({
      policySid: STARTER_CUSTOMER_POLICY,
    })
    .catch((err) => {
      console.log('evaluation create failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['customProfileEvaluation'] = customProfileEvaluation?.sid;
  if (customProfileEvaluation?.status !== 'compliant') {
    downBrand(brandData, currentUser._id);
    return res.status(400).send({
      status: false,
      data: brandData,
    });
  }
  // (1.8) Submit the customer profile to review
  await client.trusthub.v1
    .customerProfiles(customerProfile.sid)
    .update({ status: 'pending-review' })
    .catch((err) => {
      console.log('submit error', err);
    });

  // Optional: (2.1) Fetch the Sole Proprietor A2P Trust Policy
  // (2.2) Create a Sole Proprietor A2P Trust Bundle
  const bundle = await client.trusthub.v1.trustProducts
    .create({
      friendlyName: `A2P Starter for ${user_name}`,
      email: customerEmail,
      policySid: A2P_TRUST_POLICY,
    })
    .catch((err) => {
      console.log('bundle creating failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['bundle'] = bundle?.sid;
  // (2.3) Create end-user object with the type sole_proprietor_information [SID: IT***]
  const endSoleUser = await client.trusthub.v1.endUsers
    .create({
      attributes: {
        brand_name: `${customerFirstName} ${customerLastName}`,
        vertical: 'COMMUNICATION',
        mobile_phone_number: customerPhone,
      },
      friendlyName: `Sole Proprietor A2P Trust Bundle End User ${customerFirstName}`,
      type: 'sole_proprietor_information',
    })
    .catch((err) => {
      console.log('sole user creation failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['endSoleUser'] = endSoleUser?.sid;
  // (2.4.1) Attach the end-user (from Step 2.3) to the Sole Proprietor A2P Bundle [SID: BV***]
  const attachedEndSoleUser = await client.trusthub.v1
    .trustProducts(bundle.sid)
    .trustProductsEntityAssignments.create({
      objectSid: endSoleUser.sid,
    })
    .catch((err) => {
      console.log('bundle attaching failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['attachedEndSoleUser'] = attachedEndSoleUser?.sid;
  // (2.4.2) Assign the Starter Customer Profile Bundle to the Sole Proprietor A2P Trust Bundle [SID: BV***]
  const attachedBundle = await client.trusthub.v1
    .trustProducts(bundle.sid)
    .trustProductsEntityAssignments.create({
      objectSid: customerProfile.sid,
    })
    .catch((err) => {
      console.log('bundle attaching failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['attachedBundle'] = attachedBundle?.sid;
  // (2.5) Evaluate the Sole Proprietor A2P Trust Bundle
  const evaluation = await client.trusthub.v1
    .trustProducts(bundle.sid)
    .trustProductsEvaluations.create({ policySid: A2P_TRUST_POLICY })
    .catch((err) => {
      console.log('evaluation is failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['evaluation'] = evaluation?.sid;
  if (evaluation?.status !== 'compliant') {
    downBrand(brandData, currentUser._id);
    return res.status(400).send({
      status: false,
      data: brandData,
    });
  }
  // Bundle Submit to review
  await client.trusthub
    .trustProducts(bundle.sid)
    .update({ status: 'pending-review' });

  // (3) Create a new Sole Proprietor A2P Brand
  const brand = await client.messaging.v1.brandRegistrations
    .create({
      brandType: 'SOLE_PROPRIETOR',
      customerProfileBundleSid: customerProfile.sid,
      a2PProfileBundleSid: bundle.sid,
    })
    .catch((err) => {
      console.log('brand creating failed', err);
      downBrand(brandData, currentUser._id);
      throw new Error('custom profile create failed');
    });
  brandData['brand'] = brand?.sid;

  const twilio_brand_info = {
    brandType: 'SOLE_PROPRIETOR',
    customerProfile: customerProfile.sid,
    endUser: endUser.sid,
    attachedUser: attachedUser.sid,
    address: address.sid,
    addressDocument: addressDocument.sid,
    attachedDocument: attachedDocument.sid,
    bundle: bundle.sid,
    endSoleUser: endSoleUser.sid,
    attachedEndSoleUser: attachedEndSoleUser.sid,
    attachedBundle: attachedBundle.sid,
    brand: brand.sid,
    requestInfo: req.body,
  };
  await Garbage.updateOne(
    {
      user: currentUser._id,
    },
    {
      $set: { twilio_brand_info },
    }
  );
  return res.send({
    status: true,
    data: twilio_brand_info,
  });
};

const createStandardBrand = async (req, res) => {
  const PRIMARY_CUSTOMER_PROFILE = 'BU3a1cd1085ebcdd4f40adc952334076f6';
  const { currentUser } = req;
  const { twilio_number_id } = currentUser;
  const {
    companyName,
    companyEmail,
    businessName,
    businessProfileUrl,
    businessWebsite,
    businessRegion,
    businessType,
    businessIdentifier,
    businessIdentity,
    businessIndustry,
    businessNumber,
    firstMemberPosition,
    firstMemberFirstName,
    firstMemberLastName,
    firstMemberPhone,
    firstMemberEmail,
    firstMemberBusinessTitle,
    secondMemberPosition,
    secondMemberFirstName,
    secondMemberLastName,
    secondMemberPhone,
    secondMemberEmail,
    secondMemberBusinessTitle,
    street,
    city,
    region,
    postalCode,
    isoCountry,
  } = req.body;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  const { twilio_sub_account } = garbage;
  if (twilio_sub_account && twilio_sub_account.is_enabled) {
    const accountSid = twilio_sub_account.sid;
    const authToken = twilio_sub_account.auth_token;
    const client = twilioFactory(accountSid, authToken);
    // Secondary Customer Profile Create
    const customerProfile = await client.trusthub.v1.customerProfiles.create({
      statusCallback:
        'https://twilio.status.callback.com/url-provided-in-step-1.2',
      friendlyName: companyName,
      email: companyEmail,
      policySid: 'RNdfbf3fae0e1107f8aded0e7cead80bf5',
    });
    // Business information create && attach
    const businessUser = await client.trusthub.v1.endUsers.create({
      attributes: {
        business_name: businessName,
        social_media_profile_urls: businessProfileUrl,
        website_url: businessWebsite,
        business_regions_of_operation: businessRegion,
        business_type: businessType,
        business_registration_identifier: businessIdentifier,
        business_identity: businessIdentity,
        business_industry: businessIndustry,
        business_registration_number: businessNumber,
      },
      friendlyName: `${companyName} CP info`,
      type: 'customer_profile_business_information',
    });
    const attachedBusinessUser = await client.trusthub.v1
      .customerProfiles(customerProfile.sid)
      .customerProfilesEntityAssignments.create({
        objectSid: businessUser.sid,
      });
    // Authroized User 1 create && attach
    const authorizedUser1 = await client.trusthub.v1.endUsers.create({
      attributes: {
        job_position: firstMemberPosition,
        first_name: firstMemberFirstName,
        last_name: firstMemberLastName,
        phone_number: firstMemberPhone,
        email: firstMemberEmail,
        business_title: firstMemberBusinessTitle,
      },
      friendlyName: `${companyName} first member`,
      type: 'authorized_representative_1',
    });
    const attachedAuthorizedUser1 = await client.trusthub.v1
      .customerProfiles(customerProfile.sid)
      .customerProfilesEntityAssignments.create({
        objectSid: authorizedUser1.sid,
      });
    // Authroized User 2 create && attach
    const authorizedUser2 = await client.trusthub.v1.endUsers.create({
      attributes: {
        job_position: secondMemberPosition,
        first_name: secondMemberFirstName,
        last_name: secondMemberLastName,
        phone_number: secondMemberPhone,
        email: secondMemberEmail,
        business_title: secondMemberBusinessTitle,
      },
      friendlyName: `${companyName} second member`,
      type: 'authorized_representative_2',
    });
    const attachedAuthorizedUser2 = await client.trusthub.v1
      .customerProfiles(customerProfile.sid)
      .customerProfilesEntityAssignments.create({
        objectSid: authorizedUser2.sid,
      });
    // Address Create, Address Document, Attach
    const address = await client.addresses.create({
      customerName: `${companyName} address`,
      street,
      city,
      region,
      postalCode,
      isoCountry,
    });
    const addressDocument = await client.trusthub.v1.supportingDocuments.create(
      {
        attributes: {
          address_sids: address.sid,
        },
        friendlyName: `${companyName} Starter Profile Document Address`,
        type: 'customer_profile_address',
      }
    );
    const attachedDocument = await client.trusthub.v1
      .customerProfiles(customerProfile.sid)
      .customerProfilesEntityAssignments.create({
        objectSid: addressDocument.sid,
      });
    // ? attach to the primary customer profile
    await client.trusthub.v1
      .customerProfiles(customerProfile.sid)
      .customerProfilesEntityAssignments.create({
        objectSid: PRIMARY_CUSTOMER_PROFILE,
      });
    // Submit the customer profile to review
    await client.trusthub.v1
      .customerProfiles(customerProfile.sid)
      .update({ status: 'pending-review' });
    // Bundle Create & Join with customer profile
    const bundle = await client.trusthub.v1.trustProducts.create({
      friendlyName: `A2P Starter for ${companyName}`,
      email: companyEmail,
      policySid: 'RN670d5d2e282a6130ae063b234b6019c8',
    });
    // ? non-profit user, government end user create
    const attachedBundle = await client.trusthub.v1
      .trustProducts(bundle.sid)
      .trustProductsEntityAssignments.create({
        objectSid: customerProfile.sid,
      });
    // Bundle Submit to review
    client.trusthub.v1
      .trustProducts(bundle.sid)
      .update({ status: 'pending-review' });
    // Brand Register
    const brand = await client.messaging.v1.brandRegistrations.create({
      customerProfileBundleSid: customerProfile.sid,
      a2PProfileBundleSid: bundle.sid,
    });
    // Message Service With incoming message handler
    const service = await client.messaging.v1.services.create({
      inboundRequestUrl: 'https://ecsbe.crmgrow.com/api/call/forward-twilio/',
      fallbackUrl: 'https://ecsbe.crmgrow.com/api/call/fallback-twilio/',
      friendlyName: `${companyName} service`,
    });
    // attach the sender to the service
    const attachedPhone = await client.messaging.v1
      .services(service.sid)
      .phoneNumbers.create({ phoneNumberSid: twilio_number_id })
      .catch((err) => {
        console.log('phone number attaching is failed', err);
      });

    const twilio_brand_info = {
      brandType: 'standard',
      customerProfile: customerProfile.sid,
      businessUser: businessUser.sid,
      authorizedUser1: authorizedUser1.sid,
      authorizedUser2: authorizedUser2.sid,
      attachedBusinessUser: attachedBusinessUser.sid,
      attachedUser1: attachedAuthorizedUser1.sid,
      attachedUser2: attachedAuthorizedUser2.sid,
      address: address.sid,
      addressDocument: addressDocument.sid,
      attachedDocument: attachedDocument.sid,
      bundle: bundle.sid,
      attachedBundle: attachedBundle.sid,
      brand: brand.sid,
      service: service.sid,
      phone: attachedPhone.sid,
    };
    await Garbage.updateOne(
      {
        user: currentUser._id,
      },
      {
        $set: { twilio_brand_info },
      }
    );
    return res.send({
      status: true,
      data: twilio_brand_info,
    });
  }
};

const createBrandCampaign = async (req, res) => {
  const { currentUser } = req;
  const { description, messageFlow, messages } = req.body;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(() => {
    console.log('garbage not found');
  });
  const { twilio_brand_info } = garbage;
  const { twilio: client } = await getTwilio(currentUser._id);
  const { brand, service, brandType, campaign } = twilio_brand_info;
  // Campaign Use case register
  const brandStatus = await client.messaging.v1
    .brandRegistrations(brand)
    .fetch();
  if (brandStatus.status === 'APPROVED') {
    if (campaign) {
      await client.messaging.v1
        .services(service)
        .usAppToPerson(campaign)
        .remove()
        .catch((err) => {
          console.log('campaign use case update is failed.', err);
        });
    }
    // (5) Create a new Sole Proprietor A2P SMS Campaign use case for default or advanced opt-out users
    const campaignUseCase = await client.messaging.v1
      .services(service)
      .usAppToPerson.create({
        brandRegistrationSid: brand,
        description,
        messageFlow,
        messageSamples: messages,
        usAppToPersonUsecase: brandType.toUpperCase(),
        hasEmbeddedLinks: true,
        hasEmbeddedPhone: true,
        optInMessage:
          'You are now opted-in. For help, reply HELP. To opt-out, reply STOP',
        optOutMessage:
          'You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.',
        helpMessage:
          'Acme Corporation: Please visit www.example.com to get support. To opt-out, reply STOP.',
        optInKeywords: ['START', 'SUBSCRIBE'],
        optOutKeywords: ['STOP', 'UNSUBSCRIBE'],
        helpKeywords: ['HELP'],
      })
      .catch((err) => {
        console.log('campaign use case creation failed', err);
      });
    // Twilio 10DLC charge one time fee
    if (brandStatus.status === 'APPROVED' && campaignUseCase?.sid) {
      const payment = await Payment.findOne({
        _id: currentUser.payment,
      });
      if (payment) {
        const charge_data = {
          customer_id: payment.customer_id,
          receipt_email: currentUser.email,
          amount: 20,
          description: 'Payment for Twillio campaign registration',
        };
        await createCharge(charge_data)
          .then((_res) => {
            console.log('Payment is done for Twillio campaign registration.');
          })
          .catch((error) => {
            throw new Error(
              'Payment failed, please contact support team:',
              error.message
            );
          });
      }
    }
    await Garbage.updateOne(
      {
        user: currentUser._id,
      },
      {
        $set: {
          'twilio_brand_info.campaign': campaignUseCase.sid,
          twilio_campaign_draft: {
            description,
            messageFlow,
            messages,
          },
        },
      }
    );
    return res.send({
      status: true,
      data: campaignUseCase.sid,
    });
  } else {
    // Save the campaign status to DB
    await Garbage.updateOne(
      {
        user: currentUser._id,
      },
      {
        $set: {
          twilio_campaign_draft: {
            description,
            messageFlow,
            messages,
          },
        },
      }
    );
    return res.send({
      status: true,
    });
  }
};

module.exports = {
  get,
  getAll,
  send,
  receive,
  searchNumbers,
  buyNumbers,
  buyCredit,
  receiveTextTwilio,
  markAsRead,
  loadFiles,
  getContactMessageOfCount,
  createSubAccount,
  moveNumber,
  getStarterBrandStatus,
  sendStarterBrandOtp,
  createStarterBrandMessagingService,
  attachPhoneNumberToBrandService,
  createStarterBrand,
  updateStarterBrand,
  createStandardBrand,
  createBrandCampaign,
  clearTwilioStatus,
  getTwilioStatus,
  attachPhone2Service,
  inspectTwilioStatus,
  downBrand,
  getWavvState,
  updateSubscription,
  checkSmartCode,
  updateTwilioMessageStatus,
  buyWavvSubscription,
  createTwilioNumber,
};
