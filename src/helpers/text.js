const { phone } = require('phone');
const request = require('request-promise');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const twilioFactory = require('twilio');
const Sentry = require('@sentry/node');
const { SegmentedMessage } = require('sms-segments-calculator');

const User = require('../models/user');
const Contact = require('../models/contact');
const Deal = require('../models/deal');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Activity = require('../models/activity');
const TimeLine = require('../models/time_line');
const Notification = require('../models/notification');
const Text = require('../models/text');
const Task = require('../models/task');
const Garbage = require('../models/garbage');
const Setting = require('../models/setting');
const Organization = require('../models/organization');


const system_settings = require('../configs/system_settings');
const { PACKAGE } = require('../constants/package');
const api = require('../configs/api');
const urls = require('../constants/urls');
const {
  getTextMaterials,
  getStandardTimezone,
  sendErrorToSentry,
  getUserTimezone,
} = require('./utility');
const { createNotification } = require('./notification');
const ActivityHelper = require('./activity');
const { updateSphereRelationship, shareContact } = require('./contact');
const { sendMessage } = require('../services/message');
const { replaceTokenFunc } = require('./utility');
const { sendSocketNotification } = require('./socket');
const { triggerTimeline } = require('../services/time_line');
const LandingPage = require('../models/landing_page');

const SERVICE_PHONE_NUMBER_COUNT = 200;

const defaultTwilio = twilioFactory(
  api.TWILIO.TWILIO_SID,
  api.TWILIO.TWILIO_AUTH_TOKEN
);

const getTwilio = (user) => {
  return new Promise((resolve) => {
    if (!user) {
      resolve({
        twilio: defaultTwilio,
        twilioCred: {
          sid: api.TWILIO.TWILIO_SID,
          authToken: api.TWILIO.TWILIO_AUTH_TOKEN,
        },
        garbage: null,
      });
      return;
    }
    Garbage.findOne({ user })
      .then((garbage) => {
        let twilio;
        if (
          garbage &&
          garbage.twilio_sub_account &&
          garbage.twilio_sub_account.is_enabled
        ) {
          const accountSid = garbage.twilio_sub_account.sid;
          const authToken = garbage.twilio_sub_account.auth_token;
          twilio = twilioFactory(accountSid, authToken);
          resolve({
            twilio,
            twilioCred: {
              sid: accountSid,
              authToken,
            },
            garbage,
          });
        } else {
          resolve({
            twilio: defaultTwilio,
            twilioCred: {
              sid: api.TWILIO.TWILIO_SID,
              authToken: api.TWILIO.TWILIO_AUTH_TOKEN,
            },
            garbage,
          });
        }
      })
      .catch(() => {
        console.log('not found garbage');
        resolve({
          twilio: defaultTwilio,
          twilioCred: {
            sid: api.TWILIO.TWILIO_SID,
            authToken: api.TWILIO.TWILIO_AUTH_TOKEN,
          },
          garbage: null,
        });
      });
  });
};

const getTwilioNumber = async (id) => {
  const user = await User.findOne({ _id: id }).catch((err) => {
    console.log('err', err);
  });
  const { twilio } = await getTwilio(id);

  let areaCode;
  let countryCode;
  let fromNumber;
  const phone = user.phone;
  if (phone) {
    areaCode = phone.areaCode;
    countryCode = phone.countryCode;
  } else {
    areaCode = user.cell_phone.substring(1, 4);
    countryCode = 'US';
  }
  const data = await twilio
    .availablePhoneNumbers(countryCode)
    .local.list({
      areaCode,
    })
    .catch((err) => {
      console.log('phone number get err', err);
      fromNumber = api.TWILIO.TWILIO_NUMBER;
      return fromNumber;
    });

  if (data[0] && data[0] !== '+') {
    const proxy_number = await twilio.incomingPhoneNumbers
      .create({
        phoneNumber: data[0].phoneNumber,
        smsUrl: urls.SMS_RECEIVE_URL,
      })
      .then()
      .catch((err) => {
        console.log('proxy number error', err);
      });

    User.updateOne(
      { _id: id },
      {
        $set: {
          twilio_number: proxy_number.phoneNumber,
          twilio_number_id: proxy_number.id,
        },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });
  }
};

const matchUSPhoneNumber = (phoneNumberString) => {
  const cleaned = ('' + phoneNumberString).replace(/\D/g, '');
  const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
  let phoneNumber;
  if (match) {
    phoneNumber = '(' + match[2] + ') ' + match[3] + '-' + match[4];
  }
  return phoneNumber;
};

const getStatus = async (id, user, cred) => {
  let twilio = defaultTwilio;
  if (user) {
    const { twilio: twilioObj } = await getTwilio(user);
    twilio = twilioObj;
  } else if (cred) {
    twilio = twilioFactory(cred.sid, cred.authToken);
  }
  if (twilio) {
    return twilio.messages(id).fetch();
  } else {
    return new Promise((resolve) => {
      resolve({});
    });
  }
};

const generateUnsubscribeLink = () => {
  return '\n\nReply STOP to unsubscribe.';
};

/**
 * Attach the twilio number to the available system standard service
 * @param {*} twilio_number_id
 * @returns attached phone number data
 */
const attachPhoneNumberToService = async (twilioNumberId) => {
  /**
   * Steps
   * Read the possible messaging service sids array value with `POSSIBLE_MESSAGING_SERVICE_SIDS` key
   * check the phone numbers count of each service
   * if count is less than limit (SERVICE_PHONE_NUMBER_COUNT), attach the number to this service. Else report to twilio manager
   */
  if (!twilioNumberId) {
    return;
  }
  const setting = await Setting.findOne({
    name: 'POSSIBLE_MESSAGING_SERVICE_SIDS',
  });
  const settingValue = setting?.value?.list;
  if (!settingValue) {
    return;
  }
  const POSSIBLE_MESSAGING_SERVICE_SIDS = settingValue;
  const { twilio } = await getTwilio(null);

  let isAdded = false;
  let attachedResult = null;
  for (let i = 0; i < POSSIBLE_MESSAGING_SERVICE_SIDS.length; i++) {
    const sid = POSSIBLE_MESSAGING_SERVICE_SIDS[i];
    // fetch service detail and check them
    const serviceDetail = await twilio.messaging.v1
      .services(sid)
      .fetch()
      .catch((err) => {
        console.error('fetching twilio messaging service', err);
      });
    if (!serviceDetail) {
      continue;
    }
    // fetch phone number list
    const phoneNumbers = await twilio.messaging.v1
      .services(sid)
      .phoneNumbers.list()
      .catch((err) => {
        console.log('error', err);
      });
    if (phoneNumbers.length >= SERVICE_PHONE_NUMBER_COUNT) {
      continue;
    }
    // Add new phone number and break;
    attachedResult = await twilio.messaging.v1
      .services(sid)
      .phoneNumbers.create({ phoneNumberSid: twilioNumberId })
      .catch((err) => {
        console.log('phone number attaching is failed', err);
      });
    console.log('phone is registered to', twilioNumberId, sid, attachedResult);
    isAdded = true;
    break;
  }
  if (!isAdded) {
    // Notify twilio manager
    Sentry.captureException(
      new Error('Attaching the phone number to twilio service is failed.')
    );
    console.log('TODO: notify twilio manager');
  }
  return attachedResult;
};

const getPhoneNumberService = async (client, twilio_number_id) => {
  const setting = await Setting.findOne({
    name: 'POSSIBLE_MESSAGING_SERVICE_SIDS',
  });
  const settingValue = setting?.value?.list;
  if (!settingValue) {
    return;
  }
  const POSSIBLE_MESSAGING_SERVICE_SIDS = settingValue;

  for (let i = 0; i < POSSIBLE_MESSAGING_SERVICE_SIDS.length; i++) {
    const serviceId = POSSIBLE_MESSAGING_SERVICE_SIDS[i];
    try {
      const attachedService = await client.messaging.v1
        .services(serviceId)
        .phoneNumbers(twilio_number_id)
        .fetch()
        .catch(() => {});
      if (attachedService) {
        return attachedService;
      }
    } catch (_) {
      //
    }
  }
  return null;
};

const getWavvIDWithVortexId = async (vortex_id) => {
  if (!vortex_id) {
    throw new Error("This user doesn't have vortex id");
  }

  return vortex_id;
  // const response = await identityClient
  //   .get({
  //     uri: `users/${vortex_id}`,
  //   })
  //   .catch((e) => {
  //     throw new Error(e.message);
  //   });
  // if (!response.id) {
  //   throw new Error('This user does not have wavv id');
  // }
  // return response.id;
};

const attachPhoneNumberOwnService = async (
  twilioNumberId,
  twilioServiceId,
  userId
) => {
  const { twilio: client } = await getTwilio(userId);
  const serviceDetail = await client.messaging.v1
    .services(twilioServiceId)
    .fetch()
    .catch(() => {
      throw new Error('twilio service fetch failed');
    });
  if (!serviceDetail) {
    return false;
  }

  const attachedService = await client.messaging.v1
    .services(twilioServiceId)
    .phoneNumbers.create({ phoneNumberSid: twilioNumberId })
    .catch(() => {
      throw new Error('custom profile create failed');
    });
  await Garbage.updateOne(
    {
      user: userId,
    },
    {
      $set: {
        'twilio_brand_info.attachedService': attachedService.sid,
      },
    }
  );

  return true;
};

const releaseTwilioNumber = async (phoneNumberSid, user) => {
  sendErrorToSentry(
    { _id: user },
    'Inspect: Twilio number releasing impl: ' + phoneNumberSid
  );
  const { twilio } = await getTwilio(user);
  twilio
    .incomingPhoneNumbers(phoneNumberSid)
    .remove()
    .then((deleted) => {
      // Success
      sendErrorToSentry(
        { _id: user },
        'Inspect: Twilio number releasing succeed: ' + phoneNumberSid
      );
    })
    .catch((error) => {
      // Handle error
      sendErrorToSentry(
        { _id: user },
        'Inspect: Twilio number releasing failure: ' +
          phoneNumberSid +
          ' :' +
          error.message
      );
    });
};

const sendText = async (data) => {
  const {
    user,
    content,
    contacts,
    mode,
    is_guest,
    guest,
    has_shared,
    appointment,
    deal,
    toPhones,
  } = data;

  let video_ids = data['video_ids'] || [];
  let pdf_ids = data['pdf_ids'] || [];
  let image_ids = data['image_ids'] || [];
  let page_ids = data['page_ids'] || [];
  const { videoIds, pdfIds, imageIds, pageIds } = getTextMaterials(content);
  video_ids = [...new Set([...video_ids, ...videoIds])];
  pdf_ids = [...new Set([...pdf_ids, ...pdfIds])];
  image_ids = [...new Set([...image_ids, ...imageIds])];
  page_ids = [...new Set([...page_ids, ...(pageIds || [])])];

  const currentUser = await User.findOne({ _id: user }).catch((err) => {
    console.log('user find err', err.message);
  });
  let mainUser = currentUser;
  if (!currentUser.is_primary) {
    mainUser = await User.findOne({
      organization: currentUser.organization,
      is_primary: true,
    }).catch((err) => {
      console.log('user find err', err.message);
    });
  }
  const { twilio, twilioCred } = await getTwilio(mainUser._id);

  const garbage = await Garbage.findOne({
    user: currentUser._id,
  }).catch((err) => {
    console.log('garbage find err', err.message);
  });

  const promise_array = [];

  if (contacts?.length > 25) {
    promise_array.push(
      new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contacts[0],
          },
          error:
            'This timeline contains a lot of contacts. It could not run this order',
          type: 'lot_of_contacts',
        });
      })
    );
    return Promise.all(promise_array);
  }

  if (!checkTextCount(mainUser.text_info, content, contacts?.length || 0)) {
    promise_array.push(
      new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contacts[0],
          },
          error:
            'Your texting requests lots of capacity. Your limitation reached already.',
          type: 'reached_limit',
        });
      })
    );
    return Promise.all(promise_array);
  }

  const text = new Text({
    user: currentUser.id,
    content,
    contacts,
    type: 0,
    has_shared,
    deal: deal || null,
  });
  const savedText = await text.save().catch((err) => {
    console.log('text save err', err.message);
  });

  Contact.updateMany(
    { _id: { $in: contacts } },
    { message: { last: savedText._id } }
  ).catch((err) => {
    console.log(err.message);
  });
  let teamId;
  if (currentUser.organization_info?.is_enabled && currentUser.organization) {
    const organization = await Organization.findOne({
      _id: currentUser.organization,
    }).catch((e) => console.log(e.message));
    if (organization) {
      teamId = organization.team;
    }
  }
  for (let i = 0; i < contacts.length; i++) {
    let text_content = content;
    const activities = [];
    const material_activities = [];
    const _contact = await Contact.findOne({ _id: { $in: contacts[i] } })
      .populate('label')
      .exec()
      .catch((err) => {
        console.log('contact found err', err.message);
      });

    let promise;
    let phoneNumberToSend =
      contacts.length === 1 && toPhones && toPhones.length > 0
        ? toPhones[0]
        : undefined;

    if (!_contact) {
      revertTextWithActivities(text.id, contacts[i]);
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contacts[i],
          },
          error: 'Contact was removed.',
          type: 'not_found_contact',
        });
      });

      promise_array.push(promise);
      continue;
    }

    if (_contact.unsubscribed?.text) {
      revertTextWithActivities(text.id, _contact._id);
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contacts[i],
            first_name: _contact.first_name,
            email: _contact.email,
          },
          error: 'contact text unsubscribed',
          type: 'unsubscribed_contact',
        });
      });

      promise_array.push(promise);
      continue;
    }

    if (!phoneNumberToSend) {
      phoneNumberToSend = _contact.cell_phone;
    }

    if (!phoneNumberToSend) {
      revertTextWithActivities(text.id, _contact._id);
      promise = new Promise(async (resolve) => {
        resolve({
          status: false,
          contact: {
            _id: _contact._id,
            first_name: _contact.first_name,
            cell_phone: _contact.cell_phone,
          },
          error: 'No number',
        });
      });
      promise_array.push(promise);
      continue;
    }

    const e164Phone = phone(phoneNumberToSend)?.phoneNumber;
    if (!e164Phone) {
      revertTextWithActivities(text.id, _contact._id);
      promise = new Promise(async (resolve) => {
        resolve({
          status: false,
          contact: {
            _id: _contact._id,
            first_name: _contact.first_name,
            cell_phone: phoneNumberToSend,
          },
          error: 'Invalid number',
        });
      });

      promise_array.push(promise);
      continue;
    }

    const time_zone = getUserTimezone(currentUser);

    let scheduled_time =
      appointment && appointment.due_start
        ? moment(appointment.due_start)
            .tz(time_zone)
            .format('h:mm MMMM Do, YYYY')
        : '';

    scheduled_time += ` (${getStandardTimezone(time_zone)})`;
    const result = await replaceTokenFunc({
      currentUser,
      garbage,
      contact: _contact,
      scheduled_time,
      subject: '',
      content: text_content,
    });

    text_content = result.content || '';

    if (page_ids?.length) {
      const pages = await LandingPage.find({ _id: { $in: page_ids } }).catch(
        (err) => {
          console.log('landing page find error', err.message);
        }
      );

      let activity_content = 'sent landing page using sms';
      if (is_guest) {
        activity_content = ActivityHelper.assistantLog(
          activity_content,
          guest.name
        );
      }
      switch (mode) {
        case 'automation':
          activity_content = ActivityHelper.automationLog(activity_content);
          break;
        case 'campaign':
          activity_content = ActivityHelper.campaignLog(activity_content);
          break;
        case 'api':
          activity_content = ActivityHelper.apiLog(activity_content);
          break;
      }

      for (let j = 0; j < pages.length; j++) {
        const page = pages[j];

        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'landing_pages',
          landing_pages: page.id,
          texts: text.id,
        });

        activity.save().catch((err) => {
          console.log('text activity err', err.message);
        });
        // New Logic to replace
        const material_view_page_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_LANDING_PAGE_URL
            : urls.LANDING_PAGE_URL;
        const page_link = material_view_page_link + activity.id;
        text_content = text_content.replace(
          new RegExp(`{{page:${page.id}}}`, 'g'),
          page_link
        );

        activities.push(activity.id);
        // CONSIDER: Removed the material_activities & maybe it can be required for the automation running..
      }
    }

    if (video_ids && video_ids.length > 0) {
      const activity_content = 'sent video using sms';

      // switch (mode) {
      //   case 'automation':
      //     activity_content = ActivityHelper.automationLog(activity_content);
      //     break;
      //   case 'campaign':
      //     activity_content = ActivityHelper.campaignLog(activity_content);
      //     break;
      //   case 'api':
      //     activity_content = ActivityHelper.apiLog(activity_content);
      //     break;
      // }

      for (let j = 0; j < video_ids.length; j++) {
        const video = await Video.findOne({ _id: video_ids[j] }).catch(
          (err) => {
            console.log('video find error', err.message);
          }
        );

        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'videos',
          videos: video.id,
          texts: text.id,
        });

        activity.save().catch((err) => {
          console.log('text activity err', err.message);
        });
        // New Logic to replace
        const video_user_link = `${urls.MATERIAL_USER_VIEW_VIDEO_URL}/${video.id}`;
        const video_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_VIDEO_URL}/${video.id}`;
        const material_view_video_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_VIDEO_URL
            : urls.MATERIAL_VIEW_VIDEO_URL;
        const video_link = material_view_video_link + activity.id;
        text_content = text_content.replace(
          new RegExp(`{{video:${video.id}}}`, 'g'),
          video_link
        );
        text_content = text_content.replace(
          new RegExp(`{{${video.id}}}`, 'g'),
          video_link
        );
        text_content = text_content.replace(
          new RegExp(video_user_link, 'g'),
          video_link
        );
        text_content = text_content.replace(
          new RegExp(video_old_user_link, 'g'),
          video_link
        );

        activities.push(activity.id);
        material_activities.push({
          activity_id: activity.id,
          material_id: video.id,
        });
      }
    }

    if (pdf_ids && pdf_ids.length > 0) {
      const activity_content = 'sent pdf using sms';

      // switch (mode) {
      //   case 'automation':
      //     activity_content = ActivityHelper.automationLog(activity_content);
      //     break;
      //   case 'campaign':
      //     activity_content = ActivityHelper.campaignLog(activity_content);
      //     break;
      //   case 'api':
      //     activity_content = ActivityHelper.apiLog(activity_content);
      //     break;
      // }

      for (let j = 0; j < pdf_ids.length; j++) {
        const pdf = await PDF.findOne({ _id: pdf_ids[j] }).catch((err) => {
          console.log('pdf find error', err.message);
        });

        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'pdfs',
          pdfs: pdf.id,
          texts: text.id,
        });

        activity.save().catch((err) => {
          console.log('text activity save err', err.message);
        });

        const pdf_user_link = `${urls.MATERIAL_USER_VIEW_PDF_URL}/${pdf.id}`;
        const pdf_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_PDF_URL}/${pdf.id}`;
        const material_view_pdf_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_PDF_URL
            : urls.MATERIAL_VIEW_PDF_URL;
        const pdf_link = material_view_pdf_link + activity.id;

        text_content = text_content.replace(
          new RegExp(`{{pdf:${pdf.id}}}`, 'g'),
          pdf_link
        );
        text_content = text_content.replace(
          new RegExp(`{{${pdf.id}}}`, 'g'),
          pdf_link
        );
        text_content = text_content.replace(
          new RegExp(pdf_user_link, 'g'),
          pdf_link
        );
        text_content = text_content.replace(
          new RegExp(pdf_old_user_link, 'g'),
          pdf_link
        );

        activities.push(activity.id);
        material_activities.push({
          activity_id: activity.id,
          material_id: pdf.id,
        });
      }
    }

    if (image_ids && image_ids.length > 0) {
      const activity_content = 'sent image using sms';

      // switch (mode) {
      //   case 'automation':
      //     activity_content = ActivityHelper.automationLog(activity_content);
      //     break;
      //   case 'campaign':
      //     activity_content = ActivityHelper.campaignLog(activity_content);
      //     break;
      //   case 'api':
      //     activity_content = ActivityHelper.apiLog(activity_content);
      //     break;
      // }

      for (let j = 0; j < image_ids.length; j++) {
        const image = await Image.findOne({ _id: image_ids[j] }).catch(
          (err) => {
            console.log('image find error', err.message);
          }
        );

        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'images',
          images: image.id,
          texts: text.id,
        });

        activity.save().catch((err) => {
          console.log('email send err', err.message);
        });

        const image_user_link = `${urls.MATERIAL_USER_VIEW_IMAGE_URL}/${image.id}`;
        const image_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_IMAGE_URL}/${image.id}`;
        const material_view_image_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_IMAGE_URL
            : urls.MATERIAL_VIEW_IMAGE_URL;
        const image_link = material_view_image_link + activity.id;
        text_content = text_content.replace(
          new RegExp(`{{image:${image.id}}}`, 'g'),
          image_link
        );
        text_content = text_content.replace(
          new RegExp(`{{${image.id}}}`, 'g'),
          image_link
        );
        text_content = text_content.replace(
          new RegExp(image_user_link, 'g'),
          image_link
        );
        text_content = text_content.replace(
          new RegExp(image_old_user_link, 'g'),
          image_link
        );

        activities.push(activity.id);
        material_activities.push({
          activity_id: activity.id,
          material_id: image.id,
        });
      }
    }

    let activity_content = 'sent text';

    if (is_guest) {
      activity_content = ActivityHelper.assistantLog(
        activity_content,
        guest.name
      );
    }

    if (mode) {
      activity_content = `${activity_content} (${mode})`;
    }

    // switch (mode) {
    //   case 'automation':
    //     activity_content = ActivityHelper.automationLog(activity_content);
    //     break;
    //   case 'campaign':
    //     activity_content = ActivityHelper.campaignLog(activity_content);
    //     break;
    //   case 'api':
    //     activity_content = ActivityHelper.apiLog(activity_content);
    //     break;
    // }

    const activity = new Activity({
      content: activity_content,
      contacts: contacts[i],
      user: currentUser.id,
      type: 'texts',
      texts: text.id,
      videos: video_ids,
      pdfs: pdf_ids,
      images: image_ids,
      assigned_id: _contact?.owner,
      receivers: toPhones,
    });

    await activity.save().catch((err) => {
      console.log('text activity err', err.message);
    });

    const body = _contact.texted_unsbcription_link
      ? text_content
      : text_content + generateUnsubscribeLink();

    const wavvNumber = mainUser['wavv_number'];
    const fromNumber = mainUser['twilio_number'];
    let wavvUserId = mainUser._id;
    let wavvError = null;

    if (mainUser.source === 'vortex') {
      try {
        wavvUserId = await getWavvIDWithVortexId(mainUser.vortex_id);
      } catch (error) {
        wavvError = error.message;
        wavvUserId = null;
      }
    }
    if (teamId && !contacts[i].shared_all_member) {
      shareContact(contacts[i], currentUser._id, [], teamId, 'all_member');
    }
    if (wavvNumber) {
      promise = new Promise(async (resolve) => {
        if (!wavvUserId) {
          resolve({
            status: false,
            contact: {
              _id: _contact._id,
              first_name: _contact.first_name,
              cell_phone: phoneNumberToSend,
            },
            error: wavvError,
            body,
            isSent: true,
            sendStatus: {
              service: 'wavv',
              msg_id: '',
              status: 4,
            },
          });
        }

        const data = {
          to: e164Phone,
          from: wavvNumber,
          userId: wavvUserId,
          body,
        };

        const res = await sendMessage(data, mainUser.source);

        if (res && res.success) {
          await Activity.updateOne(
            { _id: activity._id },
            {
              $set: {
                message_id: res.messageId,
                status: 'pending',
              },
            }
          ).catch((err) => {
            console.log('activity err', err.message);
          });

          await Activity.updateMany(
            { _id: { $in: activities } },
            {
              $set: {
                status: 'pending',
                texts: text.id,
              },
            }
          ).catch((err) => {
            console.log('activity err', err.message);
          });

          const segmentCount =
            new SegmentedMessage(body || '', 'auto', true).segmentsCount || 0;

          await updateUserTextCount(currentUser, segmentCount, false).catch(
            () => {}
          );

          resolve({
            status: true,
            contact: _contact,
            sendStatus: {
              service: 'wavv',
              msg_id: res.messageId,
              status: 3,
            },
            activities,
            data: activity.id,
            body,
            material_activities,
            text: text._id,
          });
        } else {
          revertTextWithActivities(
            text._id,
            _contact?.id,
            activities,
            activity._id
          );
          resolve({
            status: false,
            contact: {
              _id: _contact._id,
              first_name: _contact.first_name,
              cell_phone: phoneNumberToSend,
            },
            error: 'Error to send it',
            isSent: true,
            body,
            sendStatus: {
              service: 'wavv',
              msg_id: '',
              status: 4,
            },
          });
        }
      });
    } else if (fromNumber) {
      promise = new Promise(async (resolve) => {
        twilio.messages
          .create({
            from: fromNumber,
            body,
            to: e164Phone,
            statusCallback: `${urls.DOMAIN_ADDR}/api/sms/update-twilio-message-status`,
          })
          .then(async (message) => {
            const segmentCount =
              new SegmentedMessage(body || '', 'auto', true).segmentsCount || 0;
            if (
              message.status === 'accepted' ||
              message.status === 'sending' ||
              message.status === 'queued' ||
              message.status === 'sent'
            ) {
              await Activity.updateOne(
                { _id: activity._id },
                {
                  $set: {
                    message_id: message.sid,
                    status: 'pending',
                  },
                }
              ).catch((err) => {
                console.log('activity err', err.message);
              });

              await Activity.updateMany(
                { _id: { $in: activities } },
                {
                  $set: {
                    status: 'pending',
                    texts: text.id,
                  },
                }
              ).catch((err) => {
                console.log('activity err', err.message);
              });
              await updateUserTextCount(currentUser, segmentCount, false).catch(
                () => {}
              );

              resolve({
                status: true,
                contact: _contact,
                sendStatus: {
                  service: 'twilio',
                  msg_id: message.sid,
                  status: 3,
                },
                activities,
                body,
                data: activity.id,
                material_activities,
                text: text._id,
              });
            } else if (message.status === 'delivered') {
              console.log(
                'Message ID: ',
                message.sid,
                `Send SMS: ${fromNumber} -> ${phoneNumberToSend} :`
              );
              await updateUserTextCount(currentUser, segmentCount, false).catch(
                () => {}
              );
              handleDeliveredText(
                _contact._id,
                activities,
                activity._id,
                text._id
              );
              resolve({
                status: true,
                contact: _contact,
                delivered: true,
                body,
                sendStatus: {
                  service: 'twilio',
                  msg_id: message.sid,
                  status: 2,
                },
                activities,
                data: activity.id,
                material_activities,
                text: text._id,
              });
            } else {
              revertTextWithActivities(
                text._id,
                _contact?.id,
                activities,
                activity._id
              );
              resolve({
                status: false,
                contact: {
                  _id: _contact._id,
                  first_name: _contact.first_name,
                  cell_phone: phoneNumberToSend,
                },
                error: message.errorMessage || 'message response is lost',
                isSent: true,
                body,
                sendStatus: {
                  service: 'twilio',
                  msg_id: message.sid,
                  status: 4,
                },
              });
            }
          })
          .catch((err) => {
            revertTextWithActivities(
              text._id,
              _contact?.id,
              activities,
              activity._id
            );
            resolve({
              status: false,
              contact: {
                _id: _contact._id,
                first_name: _contact.first_name,
                cell_phone: phoneNumberToSend,
              },
              error: err.message || 'Message creating is failed',
            });
            if (err.message === 'Attempt to send to unsubscribed recipient') {
              Contact.updateOne(
                { _id: _contact.id },
                {
                  $set: { 'unsubscribed.text': true },
                }
              ).catch((err) => {
                console.log('err', err);
              });
            }
          });
      });
    }

    promise_array.push(promise);
  }

  const result_promise = new Promise((res) => {
    res({ text: text._id });
  });
  promise_array.push(result_promise);

  return Promise.all(promise_array);
};

const updateWavvMessageStatus = async (message_id, from, status) => {
  if (!message_id || !status || !from) {
    console.log('Invalid Input');
    return;
  }

  const currentUser = await User.findOne({ wavv_number: from });

  const activity = await Activity.findOne({ message_id });

  if (!currentUser || !activity) {
    console.log('Invalid User or Activity');
    return;
  }

  const text = await Text.findOne({ _id: activity.texts });

  const activities = await Activity.find({
    texts: text._id,
    contacts: activity.contacts,
  });

  if (!text) {
    console.log('No Text');
    return;
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
  if (status === 'MESSAGE_SENT') {
    handleDeliveredText(activity.contacts, activityIds, activity._id, text._id);

    notification = {
      contact,
      textId: text._id,
      messageId: message_id,
      status: 'delivered',
    };
  } else if (status === 'MESSAGE_FAILED') {
    revertTextWithActivities(
      text._id,
      activity.contacts,
      activityIds,
      activity._id
    );

    triggerPayload.status = false;

    notification = {
      contact,
      textId: text._id,
      messageId: message_id,
      status: 'failed',
    };
  }

  triggerTimeline(triggerPayload);

  if (notification) {
    sendSocketNotification('messageStatus', currentUser, notification);
  }
};

const handleDeliveredText = async (
  contact_id,
  activities,
  text_activity,
  text_id
) => {
  let update_activities = [...activities, text_activity];
  const text = await Text.findOne({ _id: text_id }).catch((error) => {
    console.log('can`t find text');
  });
  if (text && text.has_shared) {
    if (text) {
      const deal_activity = await Activity.findOne({
        texts: text._id,
        deals: text.deal,
        type: 'texts',
      }).catch((error) => {
        console.log('therge is no deal activity');
      });
      if (deal_activity) {
        const deal = await Deal.findOne({ _id: text.deal }).catch((error) => {
          console.log('there is no deal');
        });
        if (deal?.primary_contact?.toString() === contact_id.toString()) {
          update_activities = [...update_activities, deal_activity._id];
        }
      }
    }
  }

  Activity.updateMany(
    { _id: { $in: update_activities } },
    {
      $set: { status: 'completed' },
    }
  ).catch((err) => {
    console.log('activity update err', err.message);
  });

  Contact.updateOne(
    { _id: contact_id },
    {
      $set: {
        last_activity: text_activity,
        texted_unsbcription_link: true,
      },
    }
  ).catch((err) => {
    console.log('contact update err', err.message);
  });

  // Update sphere relationship
  updateSphereRelationship([contact_id], 'text');
};

const revertTextWithActivities = async (
  textId,
  contactId,
  activities = [],
  activity = null
) => {
  if (activities.length) {
    Activity.deleteMany({ _id: { $in: activities } }).catch((err) => {
      console.log('text material activity delete err', err.message);
    });
  }
  if (activity) {
    Activity.deleteOne({ _id: activity }).catch((err) => {
      console.log('text activity delete err', err.message);
    });
  }
  if (contactId && textId) {
    await Text.updateOne(
      { _id: textId },
      { $pull: { contacts: { $in: [contactId] } } }
    ).catch((err) => {
      console.log('Text update err', err.message);
    });
    Text.deleteOne({ _id: textId, 'contacts.0': { $exists: false } }).catch(
      (err) => {
        console.log('Text delete err', err.message);
      }
    );
    const last_message = await Text.findOne(
      { contacts: contactId },
      {},
      {
        $sort: {
          created_at: -1,
        },
      }
    ).catch((err) => {
      console.log(err.message);
    });
    if (last_message)
      Contact.updateOne(
        { _id: contactId },
        { $set: { 'message.last': last_message._id } }
      ).catch((err) => {
        console.log(err.message);
      });
    else
      Contact.updateOne(
        { _id: contactId },
        { $unset: { message: true } }
      ).catch((err) => {
        console.log(err.message);
      });
  }
};

const createTextCheckTasks = (
  user,
  contact,
  message,
  service,
  activities,
  text_activity,
  text_id,
  process_id,
  detail,
  time,
  tasks
) => {
  delete detail.contacts;
  delete detail.content;
  const task = new Task({
    user: user.id,
    status: 'active',
    type: 'bulk_sms',
    action: {
      message_sid: message.sid,
      activities,
      service,
      activity: text_activity,
      text: text_id,
      tasks,
      ...detail,
    },
    contacts: [contact._id],
    due_date: time,
    process: process_id,
  });

  task.save().catch((err) => {
    console.log('time line save err', err.message);
  });

  createNotification(
    'bulk_text_progress',
    {
      process: process_id,
    },
    { _id: user.id }
  );

  Activity.updateOne(
    { _id: text_activity },
    {
      $set: {
        status: 'pending',
      },
    }
  ).catch((err) => {
    console.log('activity err', err.message);
  });

  Activity.updateMany(
    { _id: { $in: activities } },
    {
      $set: {
        status: 'pending',
        texts: text_id,
      },
    }
  ).catch((err) => {
    console.log('activity err', err.message);
  });
};

/**
 *
 * @param {*} textInfo
 * @param {*} text
 * @param {*} contactsCount
 */
const checkTextCount = (textInfo, text, contactsCount) => {
  const POSSIBLE_OVER_COUNT = 20; // possible over count
  if (!textInfo.is_limit) {
    return true;
  }
  const count = (textInfo.count || 0) + (textInfo.subaccount_used_count || 0);
  const maxTextCount = textInfo.max_count || PACKAGE.PRO.text_info.max_count; // possible count
  const additionalTextCount = textInfo.additional_credit?.amount || 0; // additional possible count (when sent text, this is reduced.)

  const textSegmentCount =
    new SegmentedMessage(text || '', 'auto', true).segmentsCount || 0;
  const requestedCount = textSegmentCount * contactsCount;

  if (maxTextCount < count && !additionalTextCount) {
    return false;
  }

  const availableCount =
    count > maxTextCount
      ? additionalTextCount + POSSIBLE_OVER_COUNT
      : maxTextCount + additionalTextCount - count + POSSIBLE_OVER_COUNT;

  if (availableCount < requestedCount) {
    return false;
  }
  return true;
};

/**
 * Update the user text count
 * @param {*} user
 * @param {*} count
 * @param {*} isReceive
 * @returns
 */
const updateUserTextCount = (user, count, isReceive = false) => {
  const newPromise = new Promise(async (resolve, reject) => {
    const text_info = user.text_info;
    if (!text_info) {
      reject({ messsage: 'invalid_user_text_info' });
    }
    if (!user.is_primary) {
      let primaryUserTextInfoUpdateQuery = {};
      let currentUserTextInfoUpdateQuery = {};
      const primaryUser = await User.findOne({
        organization: user.organization,
        is_primary: true,
      }).catch((err) => {
        console.log('user find err', err.message);
      });
      const pirmaryUserTextInfo = primaryUser.text_info;
      const maxCount =
        pirmaryUserTextInfo.max_count || PACKAGE.PRO.text_info.max_count;
      const subAccountUsedCount =
        pirmaryUserTextInfo.subaccount_used_count || 0;
      const usedCount = (pirmaryUserTextInfo.count || 0) + subAccountUsedCount;
      if (pirmaryUserTextInfo.is_limit && maxCount < usedCount + count) {
        // need to update the additional credit count (reduce it)
        const overUsedCount =
          usedCount < maxCount ? usedCount + count - maxCount : count;
        let additionalRemainedCount =
          (pirmaryUserTextInfo.additional_credit?.amount || 0) - overUsedCount;
        if (additionalRemainedCount < 0) {
          additionalRemainedCount = 0;
        }
        primaryUserTextInfoUpdateQuery = {
          $set: {
            'text_info.subaccount_used_count': subAccountUsedCount + count,
            'text_info.additional_credit.amount': additionalRemainedCount,
          },
        };
      } else {
        primaryUserTextInfoUpdateQuery = {
          $set: {
            'text_info.subaccount_used_count': subAccountUsedCount + count,
          },
        };
      }
      currentUserTextInfoUpdateQuery = {
        $set: {
          'text_info.count': text_info.count || 0 + count,
          'text_info.received': text_info.received + (isReceive ? count : 0),
        },
      };
      if (currentUserTextInfoUpdateQuery) {
        User.updateOne(
          {
            _id: user.id,
          },
          currentUserTextInfoUpdateQuery
        ).catch((err) => {
          console.log('user sms count updaet error: ', err);
        });
      }
      if (primaryUserTextInfoUpdateQuery) {
        User.updateOne(
          {
            _id: primaryUser.id,
          },
          primaryUserTextInfoUpdateQuery
        ).catch((err) => {
          console.log('user sms count updaet error: ', err);
        });
      }
      resolve({ status: true });
      return;
    }
    let updateQuery;
    const maxCount = text_info.max_count || PACKAGE.PRO.text_info.max_count;
    const usedCount = text_info.count || 0;
    const receivedCount = text_info.received || 0;
    if (text_info.is_limit && maxCount < usedCount + count) {
      // need to update the additional credit count (reduce it)
      const overUsedCount =
        usedCount < maxCount ? usedCount + count - maxCount : count;
      let additionalRemainedCount =
        (text_info.additional_credit?.amount || 0) - overUsedCount;
      if (additionalRemainedCount < 0) {
        additionalRemainedCount = 0;
      }
      updateQuery = {
        $set: {
          'text_info.count': usedCount + count,
          'text_info.additional_credit.amount': additionalRemainedCount,
          'text_info.received': receivedCount + (isReceive ? count : 0),
        },
      };
    } else {
      updateQuery = {
        $set: {
          'text_info.count': usedCount + count,
          'text_info.received': receivedCount + (isReceive ? count : 0),
        },
      };
    }
    if (updateQuery) {
      User.updateOne(
        {
          _id: user.id,
        },
        updateQuery
      ).catch((err) => {
        console.log('user sms count updaet error: ', err);
      });
    }
    resolve({ status: true });
  });
  return newPromise;
};

const createSubAccount = (data) => {
  const { user_id, user_name } = data;
  defaultTwilio.api.accounts
    .create({ friendlyName: user_name })
    .then((account) => {
      Garbage.updateOne(
        { user: user_id },
        {
          $set: {
            twilio_sub_account: {
              is_enabled: true,
              sid: account.sid,
              auth_token: account.auth_token,
            },
          },
        }
      ).catch((err) => {
        console.log('user update err', err.message);
      });
    });
};

module.exports = {
  sendText,
  getTwilioNumber,
  getStatus,
  matchUSPhoneNumber,
  generateUnsubscribeLink,
  releaseTwilioNumber,
  handleDeliveredText,
  updateUserTextCount,
  createSubAccount,
  getTwilio,
  attachPhoneNumberToService,
  attachPhoneNumberOwnService,
  getPhoneNumberService,
  revertTextWithActivities,
  getWavvIDWithVortexId,
  updateWavvMessageStatus,
  checkTextCount,
};
