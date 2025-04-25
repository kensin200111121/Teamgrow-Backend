const jwt = require('jsonwebtoken');
const Garbage = require('../models/garbage');
const api = require('../configs/api');
const User = require('../models/user');
const { sendSocketNotification } = require('./socket');
const urls = require('../constants/urls');
const { SESClient, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const mail_contents = require('../constants/mail_contents');
const FBAdmin = require('firebase-admin');
const moment = require('moment-timezone');
const { getUserTimezone } = require('./utility');
const { phone } = require('phone');
const webpush = require('web-push');
const Notification = require('../models/notification');
const Automation = require('../models/automation');
const Contact = require('../models/contact');

const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const FBConfig = api.FIREBASE;
try {
  FBAdmin.initializeApp({
    credential: FBAdmin.credential.cert(FBConfig),
  });
} catch (e) {
  console.log('Firebase initialize failed', e.message);
}

const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;
const twilio = require('twilio')(accountSid, authToken);

const setupNotification = (io) => {
  io.on('connection', async (socket) => {
    socket.emit('connected');

    socket.on('join', async (data) => {
      if (data.token) {
        let decoded;
        try {
          decoded = jwt.verify(data.token, api.APP_JWT_SECRET);
        } catch (err) {
          const error = new Error('not_found_user');
          error.type = 'auth_failed';
          socket.emit('error', error);
          socket.disconnect();
          return;
        }

        const user = await User.findOne({ _id: decoded.id }).catch((err) => {
          console.log('err', err);
        });
        if (!user) {
          const error = new Error('not_found_user');
          error.type = 'auth_failed';
          socket.emit('error', error);
          socket.disconnect();
          return;
        }
        socket.join(user._id + '');
        socket.emit('joined');
      }
    });

    socket.on('leave', async (data) => {
      if (data.token) {
        let decoded;
        try {
          decoded = jwt.verify(data.token, api.APP_JWT_SECRET);
        } catch (err) {
          const error = new Error('not_found_user');
          error.type = 'auth_failed';
          socket.emit('error', error);
          socket.disconnect();
          return;
        }

        const user = await User.findOne({ _id: decoded.id }).catch((err) => {
          console.log('err', err);
        });
        if (!user) {
          const error = new Error('not_found_user');
          error.type = 'auth_failed';
          socket.emit('error', error);
          socket.disconnect();
          return;
        }
        socket.leave('custom_group');
      }
    });
  });
};

const createNotification = async (type, notification, targetUser) => {
  // Read the notification setting information
  const garbage = await Garbage.findOne({
    user: targetUser._id,
  }).catch((err) => {
    console.log('not_found_user_setting_notification', err);
  });
  if (!garbage) return;
  const emailNotification = garbage.email_notification || {};
  const textNotification = garbage.text_notification || {};
  const desktopNotification = garbage.desktop_notification || {};
  const mobileNotification = garbage.mobile_notification || {};

  // Check the notification type and setting and call detail functions
  switch (type) {
    case 'watch_video':
    case 'review_pdf':
    case 'review_image':
      // check the email notification setting
      emailNotification.material &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.material &&
        sendTextNotification(type, notification, targetUser);
      // check the mobile notification setting
      mobileNotification.material &&
        sendMobileNotification(type, notification, targetUser);
      // check the desktop notification setting
      desktopNotification.material &&
        sendSocketNotification('notification', targetUser, {
          ...notification,
          criteria: type,
        });
      break;
    case 'video_lead_capture':
    case 'pdf_lead_capture':
    case 'image_lead_capture':
    case 'video_interesting_capture':
    case 'pdf_interesting_capture':
    case 'image_interesting_capture':
    case 'page_lead_capture':
      // check the email notification setting
      emailNotification.lead_capture &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.lead_capture &&
        sendTextNotification(type, notification, targetUser);
      // check the mobile notification setting
      mobileNotification.lead_capture &&
        sendMobileNotification(type, notification, targetUser);
      // check the desktop notification setting
      desktopNotification.lead_capture &&
        sendSocketNotification('notification', targetUser, {
          ...notification,
          criteria: type,
        });
      break;
    // case 'open_email':
    //   // check the email notification setting
    //   emailNotification.email &&
    //     sendEmailNotification(type, notification, targetUser);
    //   // check the text notification setting
    //   textNotification.email &&
    //     sendTextNotification(type, notification, targetUser);
    //   // check the mobile notification setting
    //   mobileNotification.email &&
    //     sendMobileNotification(type, notification, targetUser);
    //   // check the desktop notification setting
    //   desktopNotification.email &&
    //     sendSocketNotification('notification', targetUser, notification);
    //   break;
    // case 'click_link':
    //   // check the email notification setting
    //   emailNotification.link_clicked &&
    //     sendEmailNotification(type, notification, targetUser);
    //   // check the text notification setting
    //   textNotification.link_clicked &&
    //     sendTextNotification(type, notification, targetUser);
    //   // check the mobile notification setting
    //   mobileNotification.link_clicked &&
    //     sendMobileNotification(type, notification, targetUser);
    //   // check the desktop notification setting
    //   desktopNotification.link_clicked &&
    //     sendSocketNotification('notification', targetUser, notification);
    //   break;
    case 'unsubscribe_email':
      // check the email notification setting
      emailNotification.unsubscription &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.unsubscription &&
        sendTextNotification(type, notification, targetUser);
      // check the mobile notification setting
      mobileNotification.unsubscription &&
        sendMobileNotification(type, notification, targetUser);
      // check the desktop notification setting
      desktopNotification.unsubscription &&
        sendSocketNotification('notification', targetUser, notification);
      break;
    case 'unsubscribe_text':
      // check the email notification setting
      emailNotification.unsubscription &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.unsubscription &&
        sendTextNotification(type, notification, targetUser);
      // check the mobile notification setting
      mobileNotification.unsubscription &&
        sendMobileNotification(type, notification, targetUser);
      // check the desktop notification setting
      desktopNotification.unsubscription &&
        sendSocketNotification('notification', targetUser, notification);
      break;
    case 'lead_capture':
      sendSocketNotification('notification', targetUser, notification);
      break;
    case 'receive_text':
      // check the email notification setting
      emailNotification.text_replied &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.text_replied &&
        sendTextNotification(type, notification, targetUser);
      // check the mobile notification setting
      mobileNotification.text_replied &&
        sendMobileNotification(type, notification, targetUser);
      // check the desktop notification setting
      desktopNotification.text_replied &&
        sendSocketNotification('notification', targetUser, notification);
      sendSocketNotification('receive_text', targetUser, notification);
      break;
    case 'received_email':
      mobileNotification.unsubscription &&
        sendMobileNotification(type, notification, targetUser);
      // check the desktop notification setting
      desktopNotification.unsubscription &&
        sendSocketNotification('notification', targetUser, notification);
      break;
    case 'task_reminder':
      // check the email notification setting
      emailNotification.follow_up &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.follow_up &&
        sendTextNotification(type, notification, targetUser);
      // check the web push notification setting
      // check the mobile notification setting
      mobileNotification.follow_up &&
        sendMobileNotification(type, notification, targetUser);
      // Socket Notification
      desktopNotification.follow_up &&
        sendSocketNotification('notification', targetUser, notification);
      break;
    case 'scheduler_reminder':
      // check the email notification setting
      emailNotification.reminder_scheduler &&
        sendEmailNotification(type, notification, targetUser);
      // check the text notification setting
      textNotification.reminder_scheduler &&
        sendTextNotification(type, notification, targetUser);
      // check the web push notification setting
      // check the mobile notification setting
      mobileNotification.reminder_scheduler &&
        sendMobileNotification(type, notification, targetUser);
      // Socket Notification
      desktopNotification.reminder_scheduler &&
        notification.desktop_notification &&
        sendSocketNotification('notification', targetUser, notification);
      break;
    case 'bulk_email':
      // Update Command
      sendSocketNotification('bulk_email', targetUser, {
        process: notification.process,
      });
      break;
    case 'assign_automation':
      // Notification load command
      sendSocketNotification('load_notification', targetUser, {
        process: notification.process,
      });
      break;
    case 'bulk_email_progress':
      // Update Command
      sendSocketNotification('bulk_email_progress', targetUser, {
        process: notification.process,
      });
      break;
    case 'bulk_text_progress':
      // Update Command
      sendSocketNotification('bulk_text_progress', targetUser, {
        process: notification.process,
      });
      break;
    case 'share_material':
      sendSocketNotification('share_material', targetUser, {
        process: notification.process,
      });
      break;
    case 'share_template':
      sendSocketNotification('share_template', targetUser, {
        process: notification.process,
      });
      break;
    case 'share_automation':
      sendSocketNotification('share_automation', targetUser, {
        process: notification.process,
      });
      break;
    case 'team_invited':
      sendSocketNotification('team_invited', targetUser, {
        process: notification.process,
      });
      break;
    case 'automation_assign_progress':
      // Update Command
      sendSocketNotification('automation_assign_progress', targetUser, {
        process: notification.process,
      });
      break;
    case 'automation':
      asyncCreateDBNotification(type, notification).then((data) => {
        sendSocketNotification('load_notification', targetUser, {
          _id: data._id,
        });
      });
      break;
    case 'campaign':
      break;
    case 'team_accept':
      break;
    case 'team_reject':
      break;
    case 'team_requested':
      break;
    case 'join_accept':
      break;
    case 'join_reject':
      break;
    case 'team_remove':
      break;
    case 'team_member_remove':
      break;
    case 'team_role_change':
      break;
    case 'stop_share_template':
      break;
    case 'contact_shared':
      break;
    case 'stop_share_contact':
      break;
    case 'stop_share_automation':
      break;
    case 'stop_share_material':
      break;
    case 'automation_error':
      sendEmailNotification(type, notification, targetUser);
      break;
  }
};

const sendNotificationEmail = async (data) => {
  const { email, template_data, template_name, cc, required_reply, source } =
    data;
  const templatedData = {
    ...template_data,
    facebook_url: urls.FACEBOOK_URL,
    login_url: urls.LOGIN_URL,
    terms_url: urls.TERMS_SERVICE_URL,
    privacy_url: urls.PRIVACY_URL,
    unsubscription_url: urls.UNSUSCRIPTION_URL,
  };

  let source_email;
  if (required_reply) {
    source_email =
      source === 'vortex' ? mail_contents.VORTEX_REPLY : mail_contents.REPLY;
  } else {
    source_email =
      source === 'vortex'
        ? mail_contents.VORTEX_NO_REPLAY
        : mail_contents.NO_REPLAY;
  }

  let toAddresses = Array.isArray(email) ? email : [email];
  let ccAddresses = Array.isArray(cc) ? cc : [cc];
  toAddresses = toAddresses.filter((e) => !!e);
  ccAddresses = ccAddresses.filter((e) => !!e);
  const params = {
    Destination: {
      ToAddresses: toAddresses,
      CcAddresses: ccAddresses,
    },
    Source: source_email,
    Template: template_name,
    TemplateData: JSON.stringify(templatedData),
  };

  const command = new SendTemplatedEmailCommand(params);
  try {
    await ses.send(command);
  } catch (err) {
    console.log('ses command err', err);
  }
};

const convertTime = (value, isMili = false) => {
  let ms;
  try {
    ms = parseInt(value) * (isMili ? 1 : 1000);
  } catch (err) {
    ms = 0;
  }
  if (isNaN(ms)) {
    ms = 0;
  }
  const h = Math.floor(ms / 3600000);
  const s = Math.floor(ms % 3600000);
  let msStr = moment(s).format('mm:ss');
  if (h) {
    msStr = (h + '').padStart(2, '0') + ':' + msStr;
  }
  return msStr;
};

/**
 * Send Email Notification
 * @param {*} type: Notification detail type
 * @param {*} notification: Notification object with whole related object
 * @param {*} user: Target user
 * @param {*} sourceUser: Source user for user-user action
 * @returns : void
 */
const sendEmailNotification = async (type, notification, user, sourceUser) => {
  const prefix = user.source === 'vortex' ? 'Vortex' : '';
  const contactPageUrl =
    user.source === 'vortex'
      ? urls.VORTEX_CONTACT_PAGE_URL
      : urls.CONTACT_PAGE_URL;
  const automationPageUrl =
    user.source === 'vortex'
      ? urls.DOMAIN_URL + 'autoflow/edit/'
      : urls.VORTEX_DOMAIN_URL + 'autoflow/edit/';
  const dealPageUrl =
    user.source === 'vortex'
      ? urls.DOMAIN_URL + 'pipeline/deals/'
      : urls.VORTEX_DOMAIN_URL + 'pipeline/deals/';
  const time_zone = getUserTimezone(user);
  const materialUserViewVideoURL =
    user.source === 'vortex'
      ? urls.VORTEX_MATERIAL_USER_VIEW_VIDEO_URL
      : urls.MATERIAL_USER_VIEW_VIDEO_URL;
  const materialUserViewImageURL =
    user.source === 'vortex'
      ? urls.VORTEX_MATERIAL_USER_VIEW_IMAGE_URL
      : urls.MATERIAL_USER_VIEW_IMAGE_URL;
  const materialUserViewPdfURL =
    user.source === 'vortex'
      ? urls.VORTEX_MATERIAL_USER_VIEW_PDF_URL
      : urls.MATERIAL_USER_VIEW_PDF_URL;
  if (type === 'watch_video') {
    const { video, contact, detail } = notification;
    const created_at = moment(detail.created_at).tz(time_zone).format('h:mm A');
    let data;
    if (contact) {
      data = {
        template_data: {
          user_name: user.user_name,
          created_at,
          contact_url: contactPageUrl + contact._id,
          contact_name: contact.first_name + ' ' + contact.last_name,
          material_title: video.title,
          material_url: `${materialUserViewVideoURL}/${video._id}`,
          thumbnail_url: video.thumbnail,
          duration: detail.watched_time,
          end_at: convertTime(detail.end),
          start_at: convertTime(detail.start),
        },
        template_name: prefix + 'VideoWatched',
        required_reply: false,
        email: user.email,
        source: user.source,
      };
    } else {
      data = {
        template_data: {
          user_name: user.user_name,
          created_at,
          contact_url:
            urls.ANALYTIC_VIDEO_PAGE_URL +
            video._id +
            '/' +
            notification['activity'],
          contact_name: 'Someone',
          material_title: video.title,
          material_url: `${materialUserViewVideoURL}/${video._id}`,
          thumbnail_url: video.thumbnail,
          duration: detail.watched_time,
          end_at: convertTime(detail.end),
          start_at: convertTime(detail.start),
        },
        template_name: prefix + 'VideoWatched',
        required_reply: false,
        email: user.email,
        source: user.source,
      };
    }

    sendNotificationEmail(data);
    return;
  }
  if (type === 'review_pdf') {
    const { pdf, contact } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');
    let data;
    if (contact) {
      data = {
        template_data: {
          user_name: user.user_name,
          created_at,
          contact_url: contactPageUrl + contact._id,
          contact_name: contact.first_name + ' ' + contact.last_name,
          material_url: `${materialUserViewPdfURL}/${pdf._id}`,
          material_title: pdf.title,
          thumbnail_url: pdf.preview || '',
        },
        template_name: prefix + 'PdfWatched',
        required_reply: false,
        email: user.email,
        source: user.source,
      };
    } else {
      data = {
        template_data: {
          user_name: user.user_name,
          created_at,
          contact_url:
            urls.ANALYTIC_PDF_PAGE_URL +
            pdf._id +
            '/' +
            notification['activity'],
          contact_name: 'Someone',
          material_url: `${materialUserViewPdfURL}/${pdf._id}`,
          material_title: pdf.title,
          thumbnail_url: pdf.preview || '',
        },
        template_name: prefix + 'PdfWatched',
        required_reply: false,
        email: user.email,
        source: user.source,
      };
    }
    sendNotificationEmail(data);
    return;
  }
  if (type === 'review_image') {
    const { image, contact } = notification;
    const created_at = moment().tz(time_zone).format('h:mmA');
    let data;
    if (contact) {
      data = {
        template_data: {
          user_name: user.user_name,
          created_at,
          contact_url: contactPageUrl + contact._id,
          contact_name: contact.first_name + ' ' + contact.last_name,
          material_url: `${materialUserViewImageURL}/${image._id}`,
          material_title: image.title,
          thumbnail_url: image.preview,
        },
        template_name: prefix + 'ImageWatched',
        required_reply: false,
        email: user.email,
        source: user.source,
      };
    } else {
      data = {
        template_data: {
          user_name: user.user_name,
          created_at,
          contact_url:
            urls.ANALYTIC_IMAGE_PAGE_URL +
            image._id +
            '/' +
            notification['activity'],
          contact_name: 'Someone',
          material_url: `${materialUserViewImageURL}/${image._id}`,
          material_title: image.title,
          thumbnail_url: image.preview,
        },
        template_name: prefix + 'ImageWatched',
        required_reply: false,
        email: user.email,
        source: user.source,
      };
    }
    sendNotificationEmail(data);
    return;
  }
  if (type === 'open_email') {
    const { contact, email } = notification;
    const data = {
      template_data: {
        user_name: user.user_name,
        created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
        contact_url: contactPageUrl + contact._id,
        contact_name: `${contact.first_name} ${contact.last_name}`,
        email_subject: email.subject,
        email_sent: moment(new Date(email.created_at))
          .tz(time_zone)
          .format('MMMM Do, YYYY - hh:mm A'),
        email_opened: moment().tz(time_zone).format('MMMM Do, YYYY - hh:mm A'),
      },
      template_name: prefix + 'EmailOpened',
      required_reply: false,
      email: user.email,
      source: user.source,
    };

    sendNotificationEmail(data);
  }
  if (type === 'video_lead_capture' || type === 'video_interest_capture') {
    const { contact, video, form_name, form_link } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');

    const data = {
      template_data: {
        user_name: user.user_name,
        created_at,
        contact_url: contactPageUrl + contact._id,
        contact_name: contact.first_name + ' ' + contact.last_name,
        material_title: video.title,
        material_url: `${materialUserViewVideoURL}/${video._id}`,
        thumbnail_url: video.thumbnail,
        form_name,
        form_link,
      },
      template_name: prefix + 'VideoLeadCapture',
      required_reply: false,
      email: user.email,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'pdf_lead_capture' || type === 'pdf_interest_capture') {
    const { contact, pdf } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');

    const data = {
      template_data: {
        user_name: user.user_name,
        created_at,
        contact_url: contactPageUrl + contact._id,
        contact_name: contact.first_name + ' ' + contact.last_name,
        material_url: `${materialUserViewPdfURL}/${pdf._id}`,
        material_title: pdf.title,
        thumbnail_url: pdf.preview || '',
      },
      template_name: prefix + 'PdfLeadCapture',
      required_reply: false,
      email: user.email,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'image_lead_capture' || type === 'image_interest_capture') {
    const { contact, image } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');
    const data = {
      template_data: {
        user_name: user.user_name,
        created_at,
        contact_url: contactPageUrl + contact._id,
        contact_name: contact.first_name + ' ' + contact.last_name,
        material_url: `${materialUserViewImageURL}/${image._id}`,
        material_title: image.title,
        thumbnail_url: image.preview,
      },
      template_name: prefix + 'ImageLeadCapture',
      required_reply: false,
      email: user.email,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'page_lead_capture') {
    const { contact, form_name, form_link } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');

    const data = {
      template_data: {
        user_name: user.user_name,
        contact_name: contact.first_name + ' ' + contact.last_name,
        contact_email: contact.email,
        contact_url: contactPageUrl + contact._id,
        created_at,
        email: user.email,
        form_name,
        form_link,
      },
      template_name: prefix + 'PageLeadCapture',
      required_reply: false,
      email: user.email,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'click_link') {
    const { contact, email, email_tracker } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');
    const data = {
      template_data: {
        contact_name: contact.first_name + ' ' + contact.last_name,
        clicked_at: created_at,
        contact_url: contactPageUrl + contact._id,
      },
      template_name: prefix + 'EmailClicked',
      required_reply: false,
      email: user.email,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'unsubscribe_email') {
    const { contact } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');

    const data = {
      template_data: {
        user_name: user.user_name,
        contact_name: contact.first_name + ' ' + contact.last_name,
        contact_email: contact.email,
        created_at,
        email: user.email,
      },
      template_name: prefix + 'UnsubscribedEmail',
      required_reply: false,
      email: user.email,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'unsubscribe_text') {
    // Unsubscribe text
  }
  if (type === 'receive_text') {
    const { contact, text } = notification;
    const created_at = moment().tz(time_zone).format('h:mm A');
    const data = {
      template_data: {
        contact_name: contact.first_name + ' ' + contact.last_name,
        replied_at: created_at,
        text_content: text,
        contact_url: contactPageUrl + contact._id,
      },
      template_name: prefix + 'TextReplied',
      required_reply: false,
      email: user.email,
      source: user.source,
    };

    sendNotificationEmail(data);
  }
  if (type === 'task_reminder') {
    const { contact, task, deal } = notification;
    const due_date = moment(task.due_date).tz(time_zone).format('h:mm a');
    const data = {
      template_data: {
        user_name: user.user_name,
        created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
        contact_url: contactPageUrl + contact._id,
        contact_name: `${contact.first_name} ${contact.last_name}`,
        follow_up_type: task.type,
        follow_up_description: task.content,
        follow_up_type_url: urls.FOLLOWUP_TYPE_URL[task.type],
        due_start: due_date,
        deal_title: deal ? deal.title : undefined,
      },
      template_name: deal
        ? prefix + 'DealTaskReminder'
        : prefix + 'TaskReminder',
      required_reply: false,
      email: user.email,
      source: user.source,
    };

    sendNotificationEmail(data);
  }
  if (type === 'scheduler_reminder') {
    const { contact, appointment, to_address } = notification;
    const data = {
      template_data: {
        contact_name: `${contact.first_name} ${contact.last_name}`,
        contact_email: contact.email,
        contact_url: contactPageUrl + contact._id,
        title: appointment.title || '',
        description: appointment.description || '',
        due_start: moment(appointment.due_start).tz(time_zone).format('h:mm a'),
        due_end: moment(appointment.due_end).tz(time_zone).format('h:mm a'),
      },
      template_name: prefix + 'SchedulerReminder',
      required_reply: false,
      email: to_address,
      source: user.source,
    };
    sendNotificationEmail(data);
  }
  if (type === 'automation_error') {
    const created_at = moment().tz(time_zone).format('h:mm A');
    const { template_name, errorMsg } = notification;
    if (template_name === 'AutomationExecuteContactError') {
      const { contact_id, automation_id, automation_title } = notification;
      const contact = await Contact.findOne({
        _id: contact_id,
      }).catch((err) => {
        console.log('err', err);
      });
      const errorNotificationParams = {
        template_data: {
          user_name: user.user_name,
          created_at,
          automation_url: automationPageUrl + automation_id,
          contact_url: contactPageUrl + contact._id,
          contact_name: `${contact.first_name} ${contact.last_name}`,
          automation_title,
          errorMsg,
        },
        template_name: prefix + template_name,
        required_reply: false,
        email: user.email,
        source: user.source,
      };
      sendNotificationEmail(errorNotificationParams);
    } else {
      const { deal_id, deal_title, automation_id, automation_title } =
        notification;
      const errorNotificationParams = {
        template_data: {
          user_name: user.user_name,
          created_at,
          deal_url: dealPageUrl + deal_id,
          deal_title,
          automation_url: automationPageUrl + automation_id,
          automation_title,
          errorMsg,
        },
        template_name: prefix + template_name,
        required_reply: false,
        email: user.email,
        source: user.source,
      };
      sendNotificationEmail(errorNotificationParams);
    }
  }
};

/**
 * Send Text Notification
 * @param {*} type : notification Detail Type
 * @param {*} notification : Notification data with the whole related objects
 * @param {*} user : target users
 * @param {*} sourceUser : source user for user-user notification
 * @returns : void
 */
const sendTextNotification = (type, notification, user, sourceUser) => {
  if (user.twilio_number === user.cell_phone) {
    return;
  }

  const contactPageUrl =
    user.source === 'vortex'
      ? urls.VORTEX_CONTACT_PAGE_URL
      : urls.CONTACT_PAGE_URL;

  const time_zone = getUserTimezone(user);

  const e164Phone = phone(user.cell_phone)?.phoneNumber;
  if (!e164Phone) {
    const error = {
      error: 'Invalid Phone Number',
    };
    throw error; // Invalid phone number
  }
  const fromNumber = api.TWILIO.SYSTEM_NUMBER;
  const unsubscribeLink = '\n\nReply STOP to unsubscribe.';
  if (type === 'watch_video') {
    const { video, contact, detail } = notification;
    const created_at =
      moment(detail.created_at).tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment(detail.created_at).tz(time_zone).format('h:mm a');
    let title;
    let body;
    let contact_link;
    if (contact) {
      title =
        contact.first_name +
        ' ' +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        '\n' +
        'Watched video: ' +
        video.title +
        '\n';
      body =
        'watched ' +
        detail.watched_time +
        ' of ' +
        detail.total_time +
        ' on ' +
        created_at;
      contact_link = contactPageUrl + contact._id;
    } else {
      title = 'Someone watched video: ' + video.title + '\n';
      body =
        'watched ' +
        detail.watched_time +
        ' of ' +
        detail.total_time +
        ' on ' +
        created_at;
      contact_link =
        urls.ANALYTIC_VIDEO_PAGE_URL +
        video._id +
        '/' +
        notification['activity'];
    }
    const sms =
      title + '\n' + body + '\n' + contact_link + '\n\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
    return;
  }
  if (type === 'review_pdf') {
    const { pdf, contact } = notification;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    let title;
    let body;
    let contact_link;
    if (contact) {
      title =
        contact.first_name +
        ' ' +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        '\n' +
        'Reviewed pdf: ' +
        pdf.title +
        '\n';
      body = 'reviewed on ' + created_at;
      contact_link = contactPageUrl + contact._id;
    } else {
      title = 'Someone reviewed pdf: ' + pdf.title + '\n';
      body = 'reviewed on ' + created_at;
      contact_link =
        urls.ANALYTIC_PDF_PAGE_URL + pdf._id + '/' + notification['activity'];
    }
    const sms =
      title + '\n' + body + '\n' + contact_link + '\n\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
    return;
  }
  if (type === 'review_image') {
    const { image, contact } = notification;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    let title;
    let body;
    let contact_link;
    if (contact) {
      title =
        contact.first_name +
        ' ' +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        '\n' +
        'Reviewed image: ' +
        image.title +
        '\n';
      body = 'reviewed on ' + created_at;
      contact_link = contactPageUrl + contact._id;
    } else {
      title = 'Someone reviewed image: ' + image.title + '\n';
      body = 'reviewed on ' + created_at;
      contact_link =
        urls.ANALYTIC_IMAGE_PAGE_URL +
        image._id +
        '/' +
        notification['activity'];
    }
    const sms =
      title + '\n' + body + '\n' + contact_link + '\n\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
    return;
  }
  if (type === 'open_email') {
    const { contact, email } = notification;
    const title =
      contact.first_name +
      ' ' +
      contact.last_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'opened email: ' +
      '\n' +
      email.subject;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const time = 'on ' + created_at;
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'video_lead_capture' || type === 'video_interest_capture') {
    const { contact, video } = notification;
    const title =
      contact.first_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'Watched lead capture video: ' +
      '\n' +
      video.title;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const time = 'on ' + created_at;
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'pdf_lead_capture' || type === 'pdf_interest_capture') {
    const { contact, pdf } = notification;
    const title =
      contact.first_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'Reviewed lead capture pdf: ' +
      '\n' +
      pdf.title;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const time = 'on ' + created_at;
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'image_lead_capture' || type === 'image_interest_capture') {
    const { contact, image } = notification;
    const title =
      contact.first_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'Reviewed lead capture image: ' +
      '\n' +
      image.title;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const time = 'on ' + created_at;
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'page_lead_capture') {
    const { contact } = notification;
    const title =
      contact.first_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'visited landing page';
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const time = 'on ' + created_at;
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'click_link') {
    const { contact, email, email_tracker } = notification;
    const title =
      contact.first_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      `Clicked link(${email_tracker.link})` +
      '\n' +
      `from email: ${email.subject}`;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const time = 'on ' + created_at;
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'unsubscribe_email') {
    const { contact, email, email_tracker } = notification;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const title =
      contact.first_name +
      ' ' +
      contact.last_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'unsubscribed email';
    const time = ' on ' + created_at + '\n ';
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'unsubscribe_text') {
    const { contact } = notification;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const title =
      contact.first_name +
      ' ' +
      contact.last_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'Unsubscribed sms';
    const time = 'on ' + created_at + '\n ';
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'receive_text') {
    console.log('receive text text notification');
    const { contact, text } = notification;
    const created_at =
      moment().tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment().tz(time_zone).format('h:mm a');
    const title =
      contact.first_name +
      ' ' +
      contact.last_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n' +
      'Replied text: ' +
      (text || '').slice(0, 30) +
      '...';
    const time = 'on ' + created_at + '\n ';
    const contact_link = contactPageUrl + contact._id;
    const sms =
      title + '\n' + time + '\n\n' + contact_link + '\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'task_reminder') {
    const { contact, task } = notification;
    const due_date = moment(task.due_date).tz(time_zone).format('h:mm a');
    const title =
      `Follow up task due today at ${due_date} with following contact` +
      '\n' +
      '\n' +
      contact.first_name +
      contact.last_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n';
    const body = task.content + '\n';
    const sms = title + body + '\n\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
  if (type === 'scheduler_reminder') {
    const { contact, appointment } = notification;
    const due_start = moment(appointment.due_start)
      .tz(time_zone)
      .format('h:mm a');
    const due_end = moment(appointment.due_end).tz(time_zone).format('h:mm a');
    const title =
      `Scheduled Event due today at ${due_start} with following contact` +
      '\n' +
      '\n' +
      contact.first_name +
      ' ' +
      contact.last_name +
      '\n' +
      contact.email +
      '\n' +
      contact.cell_phone +
      '\n' +
      '\n';
    const body =
      'Title: ' +
      appointment.title +
      '\n' +
      'End Time: ' +
      due_end +
      ' mins' +
      '\n';
    const sms = title + body + '\n\n' + unsubscribeLink;
    sendSNSMessage(fromNumber, e164Phone, sms);
  }
};

/**
 * Send SNS message
 * @param {*} from: from number
 * @param {*} to: target number
 * @param {*} body: body content
 */
const sendSNSMessage = (from, to, body) => {
  twilio.messages
    .create({
      from,
      to,
      body,
    })
    .catch((err) => console.error(err));
};

/**
 * Send the desktop notification
 * @param {*} type : notification detail type
 * @param {*} notification : notification content
 * @param {*} user : target user
 */
const sendWebPushNotification = (type, notification, user) => {
  webpush.setVapidDetails(
    'mailto:support@crmgrow.com',
    api.VAPID.PUBLIC_VAPID_KEY,
    api.VAPID.PRIVATE_VAPID_KEY
  );

  const subscription = JSON.parse(user.desktop_notification_subscription);
  // Related Data
  let contact;
  let video;
  let pdf;
  let image;
  let email;
  let detail;
  // template,
  // automation,
  // team,
  // task,
  // Create at
  const time_zone = getUserTimezone(user);
  let created_at = moment().tz(time_zone).format('h:mm a');

  let title = '';
  let body = '';

  switch (type) {
    case 'watch_video':
      contact = notification.contact;
      video = notification.video;
      detail = notification.detail;
      created_at =
        moment(detail.created_at).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(detail.created_at).tz(time_zone).format('h:mm a');
      title = `${contact.first_name} (${contact.email}) watched video - ${video.title}`;
      body = `Watched ${detail.watched_time} of + ${detail.total_time} on ${created_at}`;
      break;
    case 'review_pdf':
      contact = notification.contact;
      pdf = notification.pdf;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      title = `${contact.first_name} (${contact.email}) reviewed pdf - ${pdf.title}`;
      body = `Reviewed on ${created_at}`;
      break;
    case 'review_image':
      contact = notification.contact;
      image = notification.image;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      title = `${contact.first_name} (${contact.email}) reviewed image - ${image.title}`;
      body = `Reviewed on ${created_at}`;
      break;
    case 'video_lead_capture':
    case 'video_interest_capture':
      contact = notification.contact;
      video = notification.video;
      title = contact.first_name + ' watched lead capture video';
      body = `${contact.first_name} (${contact.email}) watched lead capture video: ${video.title} on ${created_at}`;
      break;
    case 'pdf_lead_capture':
    case 'pdf_interest_capture':
      contact = notification.contact;
      pdf = notification.pdf;
      title = contact.first_name + ' reviewed lead capture pdf';
      body = `${contact.first_name} (${contact.email}) reviewed lead capture pdf: ${pdf.title} on ${created_at}`;
      break;
    case 'image_lead_capture':
    case 'image_interest_capture':
      contact = notification.contact;
      image = notification.image;
      title = contact.first_name + ' reviewed lead capture image';
      body = `${contact.first_name} (${contact.email}) reviewed lead capture image: ${image.title} on ${created_at}`;
      break;
    case 'open_email':
      contact = notification.contact;
      email = notification.email;
      title = contact.first_name + ' opened email';
      body = `${contact.first_name} (${contact.email}) opened email: ${email.subject} on ${created_at}`;
      break;
    case 'click_link':
      contact = notification.contact;
      email = notification.email;
      detail = notification.email_tracker;
      title = contact.first_name + ` clicked link`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} (${contact.email}) clicked link(${detail.link}) from email: ${email.subject} on ${created_at}`;
      break;
    case 'unsubscribe_email':
      contact = notification.contact;
      title = contact.first_name + ` unsubscribed`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} (${contact.email}) unsubscribed email on ${created_at}`;
      break;
    case 'resubscribe_email':
      break;
    case 'unsubscribe_text':
      contact = notification.contact;
      title = contact.first_name + ` unsubscribed`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} (${contact.cell_phone}) unsubscribed sms on ${created_at}`;
      break;
    case 'receive_text':
      contact = notification.contact;
      detail = notification.text;
      title = contact.first_name + ` unsubscribed`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} (${contact.cell_phone}) replied text: ${
        (detail || '').slice(0, 30) + '...'
      } on ${created_at}`;
      break;
    case 'task_reminder':
      contact = notification.contact;
      detail = notification.task;
      created_at =
        moment(detail.due_date).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(detail.due_date).tz(time_zone).format('h:mm a');
      title = `CRMGrow follow up reminder`;
      body =
        `Follow up task due today at ${created_at} with contact name:` +
        '\n' +
        contact.first_name +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        detail.content;
      break;
  }

  const playload = JSON.stringify({
    notification: {
      title,
      body,
      icon: '/fav.ico',
      badge: '/fav.ico',
    },
  });
  webpush
    .sendNotification(subscription, playload)
    .catch((err) => console.error(err));
};

const sendMobileNotification = (type, notification, user) => {
  let contact;
  let video;
  let pdf;
  let image;
  let email;
  let detail;
  let title;
  let body;
  const time_zone = getUserTimezone(user);
  let created_at = moment().tz(time_zone).format('h:mm a');

  switch (type) {
    case 'watch_video':
      contact = notification.contact;
      video = notification.video;
      detail = notification.detail;
      if (contact) {
        title = `${contact.first_name} watched video - ${video.title}`;
      } else {
        title = `Someone watched video - ${video.title}`;
      }
      created_at =
        moment(detail.created_at).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(detail.created_at).tz(time_zone).format('h:mm a');
      body = `Watched ${detail.watched_time} of ${detail.total_time} on ${created_at}`;
      break;
    case 'review_pdf':
      contact = notification.contact;
      pdf = notification.pdf;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      if (contact) {
        title = `${contact.first_name} reviewed pdf - ${pdf.title}`;
      } else {
        title = `Someone reviewed pdf - ${pdf.title}`;
      }
      body = `Reviewed on ${created_at}`;
      break;
    case 'review_image':
      contact = notification.contact;
      image = notification.image;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      if (contact) {
        title = `${contact.first_name} reviewed image - ${image.title}`;
      } else {
        title = `Someone reviewed image - ${image.title}`;
      }
      body = `Reviewed on ${created_at}`;
      break;
    case 'video_lead_capture':
    case 'video_interest_capture':
      contact = notification.contact;
      video = notification.video;
      title = contact.first_name + ' watched lead capture video';
      body = `${contact.first_name} watched lead capture video: ${video.title} on ${created_at}`;
      break;
    case 'pdf_lead_capture':
    case 'pdf_interest_capture':
      contact = notification.contact;
      pdf = notification.pdf;
      title = contact.first_name + ' reviewed lead capture pdf';
      body = `${contact.first_name} reviewed lead capture pdf: ${pdf.title} on ${created_at}`;
      break;
    case 'image_lead_capture':
    case 'image_interest_capture':
      contact = notification.contact;
      image = notification.image;
      title = contact.first_name + ' reviewed lead capture image';
      body = `${contact.first_name} reviewed lead capture image: ${image.title} on ${created_at}`;
      break;
    case 'page_lead_capture':
      contact = notification.contact;
      image = notification.image;
      title = contact.first_name + ' visited landing page';
      body = `${contact.first_name} visited the crmgrow landing page on ${created_at}`;
      break;
    case 'click_link':
      contact = notification.contact;
      email = notification.email;
      detail = notification.email_tracker;
      title = contact.first_name + ` clicked link`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} clicked link(${detail.link}) from email: ${email.subject} on ${created_at}`;
      break;
    case 'unsubscribe_email':
      contact = notification.contact;
      title = contact.first_name + ` unsubscribed`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} unsubscribed email on ${created_at}`;
      break;
    case 'unsubscribe_text':
      contact = notification.contact;
      title = contact.first_name + ` unsubscribed`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${contact.first_name} unsubscribed sms on ${created_at}`;
      break;
    case 'receive_text':
      contact = notification.contact;
      detail = notification.text;
      title = `${contact.first_name} replied text`;
      created_at =
        moment().tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment().tz(time_zone).format('h:mm a');
      body = `${(detail || '').slice(0, 60) + '...'} on ${created_at}`;
      break;
    case 'task_reminder':
      contact = notification.contact;
      detail = notification.task;
      created_at =
        moment(detail.due_date).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(detail.due_date).tz(time_zone).format('h:mm a');
      title = `CRMGrow follow up reminder`;
      body =
        `Follow up task due today at ${created_at} with contact name:` +
        '\n' +
        contact.first_name +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        detail.content;
      break;
  }

  const iOSDeviceToken = user.iOSDeviceToken;
  const androidDeviceToken = user.androidDeviceToken;
  const tokens = [];
  if (iOSDeviceToken) {
    tokens.push(iOSDeviceToken);
  }
  if (androidDeviceToken) {
    tokens.push(androidDeviceToken);
  }
  var payload = {
    notification: {
      title,
      body,
    },
  };

  var options = {
    priority: 'high',
    timeToLive: 60 * 60 * 24,
  };

  if (tokens.length) {
    FBAdmin.messaging()
      .sendToDevice(tokens, payload, options)
      .then((response) => {})
      .catch((error) => {});
  }
};

const createDBNotification = (type, notification) => {
  const _n = new Notification(notification);
  _n.save().catch((err) => {
    console.log('notification save err', err.message);
  });
};

const asyncCreateDBNotification = (type, notification) => {
  return new Promise((resolve, reject) => {
    const _n = new Notification(notification);
    _n.save().catch((err) => {
      console.log('notification save err', err.message);
      resolve(_n);
    });
  });
};

const sendUpdatePackageNotificationEmail = (user, level) => {
  let template_name;
  if (level === 'PRO') template_name = 'WelcomePro';
  else if (level === 'ELITE') template_name = 'WelcomeElite';
  else if (level === 'GROWTH') template_name = 'WelcomeGrowth';
  else if (level === 'GROWTH_PLUS_TEXT')
    template_name = 'WelcomeGrowthPlusText';

  const email_data = {
    template_data: {
      user_name: user.user_name,
    },
    template_name,
    required_reply: false,
    cc: user.email,
    email: mail_contents.REPLY,
    source: user.source,
  };

  if (template_name) {
    sendNotificationEmail(email_data);
  }
};

module.exports = {
  setupNotification,
  createNotification,
  sendNotificationEmail,
  sendUpdatePackageNotificationEmail,
};
