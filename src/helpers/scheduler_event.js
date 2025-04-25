const moment = require('moment-timezone');
const { sendNotificationEmail } = require('./notification');
const Notification = require('../models/notification');

const THIRD_PARTIES = {
  GOOGLE_CALENDAR: 'GOOGLE_CALENDAR',
  OUTLOOK_CALENDAR: 'OUTLOOK_CALENDAR',
  ZOOM_MEETING: 'ZOOM_MEETING',
};
const thirdPartyConnectionError = (tokenType, currentUser, err) => {
  const time_zone = currentUser.time_zone_info;
  switch (tokenType) {
    case THIRD_PARTIES.GOOGLE_CALENDAR:
      if (err?.response?.data?.error === 'invalid_grant') {
        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            calendar_token_name: 'Google calendar token',
          },
          template_name: 'CalendarTokenExpired',
          required_reply: false,
          email: currentUser.email,
          source: currentUser.source,
        };
        sendNotificationEmail(data);

        const notification = new Notification({
          type: 'personal',
          criteria: 'Calendar token expired',
          content: `Your Google calendar token on CRMGROW Schedure was expired. Please connnect it again.`,
          user: currentUser.id,
        });

        notification.save().catch((err) => {
          console.log('err', err.message);
        });
      }

      break;
    case THIRD_PARTIES.OUTLOOK_CALENDAR:
      if (err?.data?.payload?.error === 'invalid_grant') {
        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            calendar_token_name: 'Outlook calendar token',
          },
          template_name: 'CalendarTokenExpired',
          required_reply: false,
          email: currentUser.email,
          source: currentUser.source,
        };
        sendNotificationEmail(data);
        const notification = new Notification({
          type: 'personal',
          criteria: 'Calendar token expired',
          content: `Your Outlook calendar token on CRMGROW Schedure was expired. Please connnect it again.`,
          user: currentUser.id,
        });

        notification.save().catch((err) => {
          console.log('err', err.message);
        });
      }
      break;
    case THIRD_PARTIES.ZOOM_MEETING:
      if (err === 'zoom token expired') {
        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          },
          template_name: 'ZoomTokenExpired',
          required_reply: false,
          email: currentUser.email,
          source: currentUser.source,
        };
        sendNotificationEmail(data);
        const notification = new Notification({
          type: 'personal',
          criteria: 'Zoom token expired',
          content: `Your Zoom Meeting token on CRMGROW Schedure was expired. Please connnect it again.`,
          user: currentUser.id,
        });

        notification.save().catch((err) => {
          console.log('err', err.message);
        });
      }
      break;
    default:
      console.log('---------Other Calendar error', err);
      break;
  }
};

module.exports = {
  thirdPartyConnectionError,
  THIRD_PARTIES,
};
