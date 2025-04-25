const { google } = require('googleapis');

const graph = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

const base64url = require('base64url');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const Email = require('../models/email');
const User = require('../models/user');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Garbage = require('../models/garbage');
const Task = require('../models/task');
const ActivityHelper = require('./activity');
const mail_contents = require('../constants/mail_contents');
const system_settings = require('../configs/system_settings');
const api = require('../configs/api');
const urls = require('../constants/urls');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { TIME_ZONE_NAMES } = require('../constants/variable');
const {
  sendErrorToSentry,
  getUserTimezone,
  replaceTokenFunc,
} = require('./utility');
const { updateSphereRelationship } = require('./contact');
const { downloadFile } = require('./fileUpload');

const cheerio = require('cheerio');

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const moment = require('moment-timezone');
const mime = require('mime-types');

const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const { checkIdentityTokens, getOauthClients } = require('./user');
const LandingPage = require('../models/landing_page');

const isBlockedEmail = (email) => {
  const mac = /^[a-z0-9](\.?[a-z0-9]){2,}@mac\.com$/;
  const me = /^[a-z0-9](\.?[a-z0-9]){2,}@me\.com$/;
  const icloud = /^[a-z0-9](\.?[a-z0-9]){2,}@icloud\.com$/;
  const yahoo = /^[a-z0-9](\.?[a-z0-9]){2,}@yahoo\.com$/;
  return (
    mac.test(String(email).toLowerCase()) ||
    me.test(String(email).toLowerCase()) ||
    icloud.test(String(email).toLowerCase()) ||
    yahoo.test(String(email).toLowerCase())
  );
};

const encodeMessage = (message) => {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const createMail = async (
  to,
  from,
  subject,
  cc,
  bcc,
  text,
  html,
  attachments
) => {
  const mailComposer = new MailComposer({
    to,
    from,
    subject,
    cc,
    bcc,
    text,
    html,
    textEncoding: 'base64',
    attachments,
  }).compile();
  mailComposer.keepBcc = true;
  const message = await mailComposer.build();
  return encodeMessage(message);
};

const revertEmailing = (activities, email_activity, email_id, tasks) => {
  Activity.deleteMany({ _id: { $in: activities } }).catch((err) => {
    console.log('email material activity delete err', err.message);
  });
  Activity.deleteOne({ _id: email_activity }).catch((err) => {
    console.log('email activity delete err', err.message);
  });
  // Email.deleteOne({ _id: email_id }).catch((err) => {
  //   console.log('activity delete err', err.message);
  // });
  Task.deleteMany({ _id: { $in: tasks } }).catch((err) => {
    console.log('auto tasks delete err', err.message);
  });
};

const revertEmailContact = (emailId, contactId) => {
  Email.updateOne(
    { _id: emailId },
    { $pull: { contacts: { $in: [contactId] } } }
  ).catch((err) => {
    console.log('email update err', err.message);
  });
};

const handleSuccessEmailing = (contact, email_activity) => {
  Contact.updateOne(
    { _id: contact },
    {
      $set: { last_activity: email_activity },
    }
  ).catch((err) => {
    console.log('err', err.message);
  });

  updateSphereRelationship([contact], 'email');
};

const addLinkTracking = (content, activity) => {
  const $ = cheerio.load(content);
  const urlPattern = /^((http|https|ftp):\/\/)/;
  $('a[href]').each((index, elem) => {
    let url = $(elem).attr('href');
    if (!urlPattern.test(url)) {
      url = 'http://' + url;
    }
    if (url.indexOf(urls.MATERIAL_URL) === -1) {
      const attached_link =
        urls.CLICK_REDIRECT_URL + `?url=${url}&activity_id=${activity}`;
      $(elem).attr('href', attached_link);
    }
  });

  const divUrlPattern = /https?:\/\/[^\s]+/g;
  $('div').each((index, elem) => {
    const text = $(elem).html();
    if (
      divUrlPattern.test(text) &&
      $(elem).find('a[href]').length === 0 &&
      $(elem).find('img[src]').length === 0
    ) {
      const newContent = text.replace(divUrlPattern, (url) => {
        if (
          url.indexOf(urls.CLICK_REDIRECT_URL) === -1 &&
          url.indexOf(urls.MATERIAL_URL) === -1
        ) {
          const attached_link =
            urls.CLICK_REDIRECT_URL +
            `?url=${encodeURIComponent(url)}&activity_id=${activity}`;
          return `<a href="${attached_link}">${url}</a>`;
        }
        return url;
      });
      $(elem).html(newContent);
    }
  });
  return $.html();
};

const generateUnsubscribeLink = (id, isBulkEmail = true) => {
  if (isBulkEmail) {
    return `<p style="color: #222;margin-top: 20px;font-size: 11px;">If you'd like to unsubscribe and stop receiving these emails <a href="${urls.UNSUBSCRIPTION_URL}?activity=${id}" style="color: #222;"> Unsubscribe.</a></p>`;
    // <p style="color: #222;margin-top: 20px;font-size: 11px;">Or If you'd like to resubscribe receiving these emails <a href="${urls.RESUBSCRIPTION_URL}${id}" style="color: #222;"> Resubscribe.</a></p>`;
  }

  return '';
};

const generateOpenTrackLink = (id) => {
  return `<img src='${urls.TRACK_URL}${id}'/>`;
};

const findSender = async (user, email) => {
  const defaultAlias = { email: user.connected_email, name: user.user_name };
  const aliasList = user.email_alias || [];
  if (!aliasList.length) {
    return defaultAlias;
  }
  if (!email) {
    const primarySender = aliasList.filter((e) => e.primary)[0];
    if (primarySender) {
      return primarySender;
    } else {
      return defaultAlias;
    }
  }
  let sender;
  aliasList.some((e) => {
    if (e.email === email) {
      sender = e;
      return true;
    }
  });
  if (sender) {
    return sender;
  } else {
    return defaultAlias;
  }
};

const sendEmail = async (data) => {
  const {
    user,
    contacts,
    video_ids,
    pdf_ids,
    image_ids,
    page_ids,
    content,
    subject,
    cc,
    bcc,
    mode,
    attachments,
    is_guest,
    guest,
    sender,
    appointment,
    deal,
    has_shared,
    toEmails,
  } = data;

  const currentUser = await User.findOne({ _id: user }).catch((err) => {
    console.log('user find err', err.message);
  });

  const isBulkEmail = contacts.length > 1;

  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  const senderAlias = await findSender(currentUser, sender);
  let email_count = currentUser['email_info']['count'] || 0;
  const max_email_count =
    currentUser['email_info']['max_count'] ||
    system_settings.EMAIL_DAILY_LIMIT.BASIC;
  const email_info = currentUser['email_info'] || {};

  const garbage = await Garbage.findOne({
    user: currentUser.id,
  }).catch((err) => {
    console.log('garbage find err', err.message);
  });

  const connected_email_type = currentUser.connected_email_type;
  const emailAttachments = [];
  const attachment_array = [];
  if (attachments) {
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      try {
        const content = await makeAttachmentContent(attachments[i]);
        const file_type = mime.extension(attachment.type);
        if (
          connected_email_type === 'outlook' ||
          connected_email_type === 'microsoft'
        ) {
          const contentBytes = content.replace(/^data:.+;base64,/, '');
          attachment_array.push({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: attachment.filename,
            contentType: attachment.type,
            contentBytes,
          });
        } else {
          attachment_array.push({
            contentType: attachment.type,
            filename: attachment.filename,
            content,
            encoding: 'base64',
          });
        }
        emailAttachments.push({
          name: attachment.filename,
          file_type,
          size: Math.floor(
            (4 * Math.ceil(content.length / 3) * 0.5624896334383812) / 1024
          ),
        });
      } catch (err) {
        console.log('remove attachment err', err);
      }
    }
  }

  const email = new Email({
    user: currentUser.id,
    type: 0, // send
    subject,
    content,
    cc,
    bcc,
    contacts,
    has_shared,
    deal,
    attachments: emailAttachments,
  });

  email.save().catch((err) => {
    console.log('email save err', err.message);
  });

  const promise_array = [];

  for (let i = 0; i < contacts.length; i++) {
    let promise;
    let emailToSend = contacts.length === 1 ? toEmails : undefined;
    const activities = [];
    const autoResends = [];
    const autoFollowUps = [];
    const material_activities = [];
    const contact = await Contact.findById(contacts[i])
      .populate('label')
      .exec()
      .catch((err) => {
        console.log('contact found err', err.message);
      });

    if (!contact) {
      revertEmailContact(email.id, contacts[i]);
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

    if (contact.unsubscribed?.email) {
      revertEmailContact(email.id, contact._id);
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contacts[i],
            first_name: contact.first_name,
            email: contact.email,
          },
          error: 'contact email unsubscribed',
          type: 'unsubscribed_contact',
        });
      });

      promise_array.push(promise);
      continue;
    }

    if (email_info['is_limit'] && email_count > max_email_count) {
      revertEmailContact(email.id, contact._id);
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contact._id,
            first_name: contact.first_name,
            email: contact.email,
          },
          error: 'email daily limit exceed!',
          type: 'email_daily_limit',
        });
      });
      promise_array.push(promise);
      break;
    }

    if (!emailToSend?.length && contact.email) {
      emailToSend = [contact.email];
    }
    if (!emailToSend?.length) {
      revertEmailContact(email.id, contact._id);
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contact._id,
            first_name: contact.first_name,
          },
          error: 'No email',
        });
      });
      promise_array.push(promise);
      continue;
    }

    let email_subject = subject;
    let email_content = content || '';
    let material_title;
    let html_content = '';
    const time_zone = appointment?.timezone
      ? appointment?.timezone
      : getUserTimezone(currentUser);

    let scheduled_time =
      appointment && appointment.due_start
        ? moment(appointment.due_start)
            .tz(time_zone)
            .format('h:mm MMMM Do, YYYY')
        : '';

    scheduled_time += ` (${TIME_ZONE_NAMES[time_zone]})`;
    const result = await replaceTokenFunc({
      currentUser,
      garbage,
      contact,
      scheduled_time,
      subject: email_subject,
      content: email_content,
    });
    email_subject = result.subject;
    email_content = result.content;

    if (
      (video_ids && video_ids.length && pdf_ids && pdf_ids.length) ||
      (video_ids && video_ids.length && image_ids && image_ids.length) ||
      (pdf_ids && pdf_ids.length && image_ids && image_ids.length)
    ) {
      material_title = mail_contents.MATERIAL_TITLE;
      email_subject = email_subject.replace(
        /{material_title}/gi,
        material_title
      );
    }

    if (page_ids?.length) {
      const pages = await LandingPage.find({ _id: { $in: page_ids } }).catch(
        (err) => {
          console.log('landing page find error', err.message);
        }
      );
      // TODO: replace the token with landing page title

      let activity_content = 'sent landing page using email';

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
          emails: email?._id,
        });

        activity.save().catch((err) => {
          console.log('activity image err', err.message);
        });

        const material_view_page_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_LANDING_PAGE_URL
            : urls.LANDING_PAGE_URL;
        const page_link = material_view_page_link + activity.id;

        email_content = email_content.replace(
          new RegExp(`{{${page.id}}}`, 'g'),
          page_link
        );

        activities.push(activity.id);
        // CONSIDER: Removed the material_activities & maybe it can be required for the automation running..
      }
    }

    if (video_ids && video_ids.length) {
      let video_titles = '';
      const videos = await Video.find({ _id: { $in: video_ids } }).catch(
        (err) => {
          console.log('video find error', err.message);
        }
      );

      let activity_content = 'sent video using email';
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

      if (videos.length >= 2) {
        video_titles = mail_contents.VIDEO_TITLE;
      } else {
        video_titles = videos[0] ? videos[0].title : mail_contents.VIDEO_TITLE;
      }

      if (!material_title) {
        email_subject = email_subject.replace(
          /{material_title}/gi,
          video_titles
        );
      }

      for (let j = 0; j < videos.length; j++) {
        const video = videos[j];

        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'videos',
          videos: video.id,
          subject: video.title,
          emails: email?._id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        const video_user_link = `${urls.MATERIAL_USER_VIEW_VIDEO_URL}/${video.id}`;
        const video_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_VIDEO_URL}/${video.id}`;
        const material_view_video_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_VIDEO_URL
            : urls.MATERIAL_VIEW_VIDEO_URL;
        const video_link = material_view_video_link + activity.id;

        /**
        if (material_count === 1) {
          if (email_content.indexOf(`{{${video.id}}}`) === -1) {
            const material_html = `
              <div><strong>${video.title}</strong></div>
              <div>
                <a href="${video_link}" class="material-object" contenteditable="false">
                  <span contenteditable="false">
                    <img alt="Preview image went something wrong. Please click here" src="${video.preview}" width="320" height="176">
                  </span>
                </a>
              </div>
            `;
            email_content += `<br/><br/>${material_html}`;
          }
        }
        */
        email_content = email_content.replace(
          new RegExp(`{{${video.id}}}`, 'g'),
          video_link
        );
        email_content = email_content.replace(
          new RegExp(video_user_link, 'g'),
          video_link
        );
        email_content = email_content.replace(
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
      let pdf_titles = '';
      const pdfs = await PDF.find({ _id: { $in: pdf_ids } }).catch((err) => {
        console.log('pdf find error', err.message);
      });

      let activity_content = 'sent pdf using email';

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

      if (pdfs && pdfs.length >= 2) {
        pdf_titles = mail_contents.PDF_TITLE;
      } else {
        pdf_titles = pdfs[0].title;
      }

      if (!material_title) {
        email_subject = email_subject.replace(/{material_title}/gi, pdf_titles);
      }
      for (let j = 0; j < pdfs.length; j++) {
        const pdf = pdfs[j];
        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'pdfs',
          pdfs: pdf.id,
          subject: email_subject,
          emails: email?._id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        const pdf_user_link = `${urls.MATERIAL_USER_VIEW_PDF_URL}/${pdf.id}`;
        const pdf_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_PDF_URL}/${pdf.id}`;
        const material_view_pdf_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_PDF_URL
            : urls.MATERIAL_VIEW_PDF_URL;
        const pdf_link = material_view_pdf_link + activity.id;

        /**
        if (material_count === 1) {
          if (email_content.indexOf(`{{${pdf.id}}}`) === -1) {
            const material_html = `
              <div><strong>${pdf.title}</strong></div>
              <div>
                <a href="${pdf_link}" class="material-object" contenteditable="false">
                  <span contenteditable="false">
                    <img alt="Preview image went something wrong. Please click here" src="${pdf.preview}" width="320" height="176">
                  </span>
                </a>
              </div>
            `;
            email_content += `<br/><br/>${material_html}`;
          }
        }
        */

        email_content = email_content.replace(
          new RegExp(`{{${pdf.id}}}`, 'g'),
          pdf_link
        );
        email_content = email_content.replace(
          new RegExp(pdf_user_link, 'g'),
          pdf_link
        );
        email_content = email_content.replace(
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
      let image_titles = '';
      const images = await Image.find({ _id: { $in: image_ids } }).catch(
        (err) => {
          console.log('image find error', err.message);
        }
      );

      let activity_content = 'sent image using email';

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

      if (images.length >= 2) {
        image_titles = mail_contents.IMAGE_TITLE;
      } else {
        image_titles = images[0].title;
      }

      if (!material_title) {
        email_subject = email_subject.replace(
          /{material_title}/gi,
          image_titles
        );
      }
      for (let j = 0; j < images.length; j++) {
        const image = images[j];
        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'images',
          images: image.id,
          subject: email_subject,
          emails: email?._id,
        });

        activity.save().catch((err) => {
          console.log('activity image err', err.message);
        });

        const image_user_link = `${urls.MATERIAL_USER_VIEW_IMAGE_URL}/${image.id}`;
        const image_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_IMAGE_URL}/${image.id}`;
        const material_view_image_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_IMAGE_URL
            : urls.MATERIAL_VIEW_IMAGE_URL;
        const image_link = material_view_image_link + activity.id;

        /**
        if (material_count === 1) {
          if (email_content.indexOf(`{{${image.id}}}`) === -1) {
            const material_html = `
              <div><strong>${image.title}</strong></div>
              <div>
                <a href="${image_link}" class="material-object" contenteditable="false">
                  <span contenteditable="false">
                    <img alt="Preview image went something wrong. Please click here" src="${image.preview}" width="320" height="176">
                  </span>
                </a>
              </div>
            `;
            email_content += `<br/><br/>${material_html}`;
          }
        }
         */

        email_content = email_content.replace(
          new RegExp(`{{${image.id}}}`, 'g'),
          image_link
        );
        email_content = email_content.replace(
          new RegExp(image_user_link, 'g'),
          image_link
        );
        email_content = email_content.replace(
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

    let activity_content = 'sent email';

    if (is_guest) {
      activity_content = ActivityHelper.assistantLog(
        activity_content,
        guest.name
      );
    }

    if (mode) {
      activity_content = `${activity_content} (${mode})`;
    }

    const activity = new Activity({
      content: activity_content,
      contacts: contacts[i],
      user: currentUser.id,
      type: 'emails',
      subject: email_subject,
      emails: email.id,
      videos: video_ids,
      pdfs: pdf_ids,
      images: image_ids,
      assigned_id: contact?.owner,
      receivers: emailToSend,
    });

    activity.save().catch((err) => {
      console.log('email send err', err.message);
    });

    if ((cc && cc.length > 0) || (bcc && bcc.length > 0)) {
      html_content =
        '<html><head><title>Email</title></head><body><tbody><tr><td>' +
        email_content +
        '</td></tr><tr><td>' +
        currentUser.email_signature +
        '</td></tr><tr><td>' +
        generateUnsubscribeLink(activity.id, isBulkEmail) +
        '</td></tr></tbody></body></html>';
    } else {
      email_content = addLinkTracking(email_content, activity.id);
      html_content =
        '<html><head><title>Email</title></head><body><tbody><tr><td>' +
        email_content +
        '</td></tr><tr><td>' +
        generateOpenTrackLink(activity.id) +
        '</td></tr><tr><td>' +
        currentUser.email_signature +
        '</td></tr><tr><td>' +
        generateUnsubscribeLink(activity.id, isBulkEmail) +
        '</td></tr></tbody></body></html>';
    }

    if (connected_email_type === 'gmail' || connected_email_type === 'gsuit') {
      const token = JSON.parse(currentUser.google_refresh_token);
      const refresh_token = token.refresh_token;

      googleClient.setCredentials({ refresh_token });

      await googleClient.getAccessToken().catch((err) => {
        console.log('get access err', err.message);
      });

      if (!googleClient.credentials.access_token) {
        revertEmailContact(email.id, contact._id);
        promise = new Promise((resolve) => {
          resolve({
            status: false,
            contact: {
              _id: contact._id,
              first_name: contact.first_name,
              email: emailToSend,
            },
            email: email._id,
            error: 'google access token invalid!',
            type: 'google_token_invalid',
          });
        });

        promise_array.push(promise);

        // Remove created activity and email
        revertEmailing(activities, activity._id, email._id, [
          ...autoResends,
          ...autoFollowUps,
        ]);
        break;
      }

      promise = new Promise(async (resolve) => {
        try {
          const rawBody = await createMail(
            emailToSend,
            `${senderAlias.name} <${senderAlias.email}>`,
            email_subject,
            cc,
            bcc,
            html_content,
            html_content,
            attachment_array
          );
          google
            .gmail({ version: 'v1', auth: googleClient })
            .users.messages.send(
              {
                userId: 'me',
                resource: {
                  raw: rawBody,
                },
              },
              (err, sendRes) => {
                const sendResult = sendRes || {};
                const { data: { id } = {} } = sendResult;
                if (id) {
                  email_count += 1;

                  handleSuccessEmailing(contact._id, activity._id);

                  resolve({
                    status: true,
                    contact: {
                      _id: contact._id,
                      email: emailToSend,
                      first_name: contact.first_name,
                    },
                    email: email._id,
                    data: activity.id,
                    activities,
                    material_activities,
                  });
                } else {
                  console.log('gmail video send err inner', err.message);

                  revertEmailing(activities, activity._id, email._id, [
                    ...autoResends,
                    ...autoFollowUps,
                  ]);
                  revertEmailContact(email.id, contact._id);

                  if (err.statusCode === 403) {
                    // no_connected = true;
                    resolve({
                      status: false,
                      contact: {
                        _id: contact['_id'],
                        first_name: contact.first_name,
                        email: emailToSend,
                      },
                      email: email._id,
                      error: 'No Connected Gmail',
                      type: 'connection_failed',
                    });
                  } else if (err.statusCode === 400) {
                    resolve({
                      status: false,
                      contact: {
                        _id: contact['_id'],
                        first_name: contact.first_name,
                        email: emailToSend,
                      },
                      email: email._id,
                      error: err.message,
                      type: 'general',
                    });
                  } else {
                    let errorMessage = 'Unknown Error';
                    try {
                      const errorObj = JSON.parse(err.error);
                      errorMessage = errorObj.error.message;
                    } catch (_) {
                      console.log(_);
                    }
                    resolve({
                      status: false,
                      contact: {
                        _id: contact['_id'],
                        first_name: contact.first_name,
                        email: emailToSend,
                      },
                      email: email._id,
                      error: errorMessage,
                      type: 'general',
                    });
                  }
                }
              }
            );
        } catch (err) {
          console.log('gmail video send err outer', err.message);

          revertEmailing(activities, activity._id, email._id, [
            ...autoResends,
            ...autoFollowUps,
          ]);
          revertEmailContact(email.id, contact._id);
          resolve({
            status: false,
            contact: {
              _id: contact._id,
              first_name: contact.first_name,
              email: emailToSend,
            },
            email: email._id,
            error: err.message,
            type: 'internal_error',
          });
        }
      });
      promise_array.push(promise);
    } else if (
      connected_email_type === 'outlook' ||
      connected_email_type === 'microsoft'
    ) {
      const refresh_token = currentUser.outlook_refresh_token;
      const token = msClient.createToken({
        refresh_token,
        expires_in: 0,
      });

      let accessToken;

      await new Promise((resolve, reject) => {
        token
          .refresh()
          .then((data) => resolve(data.token))
          .catch((err) => reject(err));
      })
        .then((token) => {
          accessToken = token.access_token;
        })
        .catch((error) => {
          revertEmailContact(email.id, contact._id);
          promise = new Promise(async (resolve) => {
            resolve({
              status: false,
              contact: {
                _id: contact._id,
                first_name: contact.first_name,
                email: emailToSend,
              },
              email: email._id,
              error: 'not connected',
              type: 'outlook_token_invalid',
            });
          });

          revertEmailing(activities, activity._id, email._id, [
            ...autoResends,
            ...autoFollowUps,
          ]);
          promise_array.push(promise);
        });

      if (!accessToken) {
        revertEmailContact(email.id, contact._id);
        break;
      }

      const client = graph.Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const cc_array = [];
      const bcc_array = [];

      if (cc) {
        for (let i = 0; i < cc.length; i++) {
          cc_array.push({
            emailAddress: {
              address: cc[i],
            },
          });
        }
      }

      if (bcc) {
        for (let i = 0; i < bcc.length; i++) {
          bcc_array.push({
            emailAddress: {
              address: bcc[i],
            },
          });
        }
      }
      let toRecipients;
      if (Array.isArray(emailToSend)) {
        toRecipients = emailToSend.map((et) => {
          return {
            emailAddress: {
              address: et,
            },
          };
        });
      } else {
        toRecipients = {
          emailAddress: {
            address: emailToSend,
          },
        };
      }

      const sendMail = {
        message: {
          subject: email_subject,
          body: {
            contentType: 'HTML',
            content: html_content,
          },
          sender: {
            emailAddress: {
              address: senderAlias.email,
              name: senderAlias.name,
            },
          },

          toRecipients,
          ccRecipients: cc_array || [],
          bccRecipients: bcc_array || [],
          attachments: attachment_array || [],
        },
        saveToSentItems: 'true',
      };

      promise = new Promise((resolve) => {
        client
          .api('/me/sendMail')
          .post(sendMail)
          .then(async () => {
            email_count += 1;

            handleSuccessEmailing(contact._id, activity._id);

            resolve({
              status: true,
              contact: {
                _id: contact._id,
                email: emailToSend,
                first_name: contact.first_name,
              },
              email: email._id,
              data: activity.id,
              activities,
              material_activities,
            });
          })
          .catch((err) => {
            revertEmailing(activities, activity._id, email._id, [
              ...autoResends,
              ...autoFollowUps,
            ]);
            revertEmailContact(email.id, contact._id);
            console.log('microsoft email send error', err.message);
            resolve({
              status: false,
              contact: {
                _id: contact._id,
                first_name: contact.first_name,
                email: emailToSend,
              },
              email: email._id,
              error: err.message || err.msg,
              type: 'internal_error',
            });
          });
      });
      promise_array.push(promise);
    } else {
      const host = currentUser.smtp_info.host;
      const user = currentUser.smtp_info.user;
      const pass = currentUser.smtp_info.pass;
      const port = currentUser.smtp_info.port;
      const secure = currentUser.smtp_info.secure;
      const emailAddress = currentUser.smtp_info.email;
      const smtpOption = {
        port,
        host,
        secure,
        auth: {
          user,
          pass,
        },
        debug: true,
      };

      if (!secure) {
        smtpOption['tls'] = {
          // do not fail on invalid certs
          rejectUnauthorized: false,
        };
      }
      var smtpTransporter = nodemailer.createTransport(smtpOption);

      var mailOptions = {
        from: `${senderAlias.name} <${senderAlias.email}>`,
        to: emailToSend,
        text: email_content,
        subject: email_subject,
        html: html_content,
        cc,
        bcc,
        attachments: attachment_array,
      };

      promise = new Promise((resolve) => {
        smtpTransporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            revertEmailing(activities, activity._id, email._id, []);
            revertEmailContact(email.id, contact._id);
            if (error?.responseCode === 535) {
              const data = {
                host,
                user,
                port,
                email: emailAddress,
                smtp_connected: false,
                secure,
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
              resolve({
                status: false,
                contact: {
                  _id: contact['_id'],
                  first_name: contact.first_name,
                  email: emailToSend,
                },
                email: email._id,
                error: 'No Connected SMTP',
                type: 'connection_failed',
              });
            }
            resolve({
              status: false,
              contact: {
                _id: contact['_id'],
                first_name: contact.first_name,
                email: emailToSend,
              },
              email: email._id,
              error: error.message || JSON.stringify(error),
              type: 'general',
            });
          } else {
            handleSuccessEmailing(contact._id, activity._id);

            resolve({
              status: true,
              contact: {
                _id: contact._id,
                email: emailToSend,
                first_name: contact.first_name,
              },
              email: email._id,
              data: activity.id,
              activities,
              material_activities,
            });
          }
        });
      });
      promise_array.push(promise);
    }
  }

  return Promise.all(promise_array);
};

const sendEmailBySMTP = async (data) => {
  const {
    user,
    contacts,
    video_ids,
    pdf_ids,
    image_ids,
    page_ids,
    content,
    subject,
    attachments,
    campaign,
    content_type,
  } = data;

  const currentUser = await User.findOne({ _id: user }).catch((err) => {
    console.log('user find err', err.message);
  });

  const garbage = await Garbage.findOne({
    user: currentUser.id,
  }).catch((err) => {
    console.log('garbage find err', err.message);
  });

  const attachment_array = [];
  const emailAttachments = [];
  if (attachments) {
    for (let i = 0; i < attachments.length; i++) {
      try {
        const content = await makeAttachmentContent(attachments[i]);
        attachment_array.push({
          contentType: attachments[i].type,
          filename: attachments[i].filename,
          content,
          encoding: 'base64',
        });
        emailAttachments.push({
          name: attachments[i].filename,
          file_type: attachments[i].type,
          size: 4 * Math.ceil(content.length / 3) * 0.5624896334383812,
        });
      } catch (err) {
        console.log('remove attachment err', err);
      }
    }
  }

  const email = new Email({
    user: currentUser.id,
    type: 0, // send
    subject,
    content,
    contacts,
    campaign,
    attachments: emailAttachments,
  });

  email.save().catch((err) => {
    console.log('email save err', err.message);
  });

  const promise_array = [];
  for (let i = 0; i < contacts.length; i++) {
    let promise;
    const activities = [];

    const contact = await Contact.findOne({ _id: { $in: contacts[i] } })
      .populate('label')
      .exec()
      .catch((err) => {
        console.log('contact found err', err.message);
      });

    if (!contact) {
      revertEmailContact(email.id, contact._id);
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

    if (contact.unsubscribed?.email) {
      revertEmailContact(email.id, contact._id);
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          contact: {
            _id: contacts[i],
            first_name: contact.first_name,
            email: contact.email,
          },
          error: 'contact email unsubscribed',
          type: 'unsubscribed_contact',
        });
      });

      promise_array.push(promise);
      continue;
    }

    let email_subject = subject;
    let email_content = content || '';
    let html_content;
    let material_title;

    const scheduled_time = '';
    const result = await replaceTokenFunc({
      currentUser,
      garbage,
      contact,
      scheduled_time,
      subject: email_subject,
      content: email_content,
    });

    email_subject = result.subject;
    email_content = result.content;
    if (
      (video_ids && video_ids.length && pdf_ids && pdf_ids.length) ||
      (video_ids && video_ids.length && image_ids && image_ids.length) ||
      (pdf_ids && pdf_ids.length && image_ids && image_ids.length)
    ) {
      material_title = mail_contents.MATERIAL_TITLE;
      email_subject = email_subject.replace(
        /{material_title}/gi,
        material_title
      );
    }

    const material_count =
      (video_ids ? video_ids.length : 0) +
      (pdf_ids ? pdf_ids.length : 0) +
      (image_ids ? image_ids.length : 0);

    if (page_ids?.length) {
      const pages = await LandingPage.find({ _id: { $in: page_ids } }).catch(
        (err) => {
          console.log('landing page find error', err.message);
        }
      );
      // TODO: replace the token with landing page title

      let activity_content = 'sent landing page using email';
      activity_content = ActivityHelper.campaignLog(activity_content);

      for (let j = 0; j < pages.length; j++) {
        const page = pages[j];
        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'landing_pages',
          landing_pages: page.id,
          emails: email?._id,
        });

        activity.save().catch((err) => {
          console.log('activity image err', err.message);
        });

        const material_view_page_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_LANDING_PAGE_URL
            : urls.LANDING_PAGE_URL;
        const page_link = material_view_page_link + activity.id;

        email_content = email_content.replace(
          new RegExp(`{{${page.id}}}`, 'g'),
          page_link
        );

        activities.push(activity.id);
        // CONSIDER: Removed the material_activities & maybe it can be required for the automation running..
      }
    }

    if (video_ids && video_ids.length) {
      let video_titles = '';
      const videos = await Video.find({ _id: { $in: video_ids } }).catch(
        (err) => {
          console.log('video find error', err.message);
        }
      );

      let activity_content = 'sent video using email';
      activity_content = ActivityHelper.campaignLog(activity_content);

      if (videos.length >= 2) {
        video_titles = mail_contents.VIDEO_TITLE;
      } else {
        video_titles = videos[0].title;
      }

      if (!material_title) {
        email_subject = email_subject.replace(
          /{material_title}/gi,
          video_titles
        );
      }

      for (let j = 0; j < videos.length; j++) {
        const video = videos[j];

        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'videos',
          videos: video.id,
          subject: video.title,
          emails: email?._id,
          campaign,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        const video_user_link = `${urls.MATERIAL_USER_VIEW_VIDEO_URL}/${video.id}`;
        const video_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_VIDEO_URL}/${video.id}`;
        const material_view_video_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_VIDEO_URL
            : urls.MATERIAL_VIEW_VIDEO_URL;
        const video_link = material_view_video_link + activity.id;

        if (
          email_content.indexOf(video_user_link) >= 0 ||
          email_content.indexOf(video.id) >= 0
        ) {
          email_content = email_content.replace(
            new RegExp(`{{${video.id}}}`, 'g'),
            video_link
          );
          email_content = email_content.replace(
            new RegExp(video_user_link, 'g'),
            video_link
          );
          email_content = email_content.replace(
            new RegExp(video_old_user_link, 'g'),
            video_link
          );
        } else {
          const material_html = `
            <div><strong>${video.title}</strong></div>
            <div>
              <a href="${video_link}" class="material-object" contenteditable="false">
                <span contenteditable="false">
                  <img alt="Preview image went something wrong. Please click here" src="${video.preview}" width="320" height="176">
                </span>
              </a>
            </div>
          `;
          email_content += `<br/><br/>${material_html}`;
        }

        activities.push(activity.id);
      }
    }

    if (pdf_ids && pdf_ids.length > 0) {
      let pdf_titles = '';
      const pdfs = await PDF.find({ _id: { $in: pdf_ids } }).catch((err) => {
        console.log('pdf find error', err.message);
      });

      let activity_content = 'sent pdf using email';
      activity_content = ActivityHelper.campaignLog(activity_content);

      if (pdfs.length >= 2) {
        pdf_titles = mail_contents.PDF_TITLE;
      } else {
        pdf_titles = pdfs[0].title;
      }

      if (!material_title) {
        email_subject = email_subject.replace(/{material_title}/gi, pdf_titles);
      }
      for (let j = 0; j < pdfs.length; j++) {
        const pdf = pdfs[j];
        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'pdfs',
          pdfs: pdf.id,
          subject: email_subject,
          emails: email?._id,
          campaign,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        const pdf_user_link = `${urls.MATERIAL_USER_VIEW_PDF_URL}/${pdf.id}`;
        const pdf_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_PDF_URL}/${pdf.id}`;
        const material_view_pdf_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_PDF_URL
            : urls.MATERIAL_VIEW_PDF_URL;
        const pdf_link = material_view_pdf_link + activity.id;

        if (
          email_content.indexOf(pdf_user_link) >= 0 ||
          email_content.indexOf(`{{${pdf.id}}}`) >= 0
        ) {
          email_content = email_content.replace(
            new RegExp(`{{${pdf.id}}}`, 'g'),
            pdf_link
          );
          email_content = email_content.replace(
            new RegExp(pdf_user_link, 'g'),
            pdf_link
          );
          email_content = email_content.replace(
            new RegExp(pdf_old_user_link, 'g'),
            pdf_link
          );
        } else {
          const material_html = `
            <div><strong>${pdf.title}</strong></div>
            <div>
              <a href="${pdf_link}" class="material-object" contenteditable="false">
                <span contenteditable="false">
                  <img alt="Preview image went something wrong. Please click here" src="${pdf.preview}" width="320" height="176">
                </span>
              </a>
            </div>
          `;
          email_content += `<br/><br/>${material_html}`;
        }

        activities.push(activity.id);
      }
    }

    if (image_ids && image_ids.length > 0) {
      let image_titles = '';
      const images = await Image.find({ _id: { $in: image_ids } }).catch(
        (err) => {
          console.log('image find error', err.message);
        }
      );

      let activity_content = 'sent image using email';
      activity_content = ActivityHelper.campaignLog(activity_content);

      if (images.length >= 2) {
        image_titles = mail_contents.IMAGE_TITLE;
      } else {
        image_titles = images[0].title;
      }

      if (!material_title) {
        email_subject = email_subject.replace(
          /{material_title}/gi,
          image_titles
        );
      }
      for (let j = 0; j < images.length; j++) {
        const image = images[j];
        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'images',
          images: image.id,
          subject: email_subject,
          emails: email?._id,
          campaign,
        });

        activity.save().catch((err) => {
          console.log('activity image err', err.message);
        });

        const image_user_link = `${urls.MATERIAL_USER_VIEW_IMAGE_URL}/${image.id}`;
        const image_old_user_link = `${urls.MATERIAL_OLD_USER_VIEW_IMAGE_URL}/${image.id}`;
        const material_view_image_link =
          currentUser.source === 'vortex'
            ? urls.VORTEX_MATERIAL_VIEW_IMAGE_URL
            : urls.MATERIAL_VIEW_IMAGE_URL;
        const image_link = material_view_image_link + activity.id;
        if (
          email_content.indexOf(image_user_link) >= 0 ||
          email_content.indexOf(`{{${image.id}}}`) >= 0
        ) {
          email_content = email_content.replace(
            new RegExp(`{{${image.id}}}`, 'g'),
            image_link
          );
          email_content = email_content.replace(
            new RegExp(image_user_link, 'g'),
            image_link
          );
          email_content = email_content.replace(
            new RegExp(image_old_user_link, 'g'),
            image_link
          );
        } else {
          const material_html = `
            <div><strong>${image.title}</strong></div>
            <div>
              <a href="${image_link}" class="material-object" contenteditable="false">
                <span contenteditable="false">
                  <img alt="Preview image went something wrong. Please click here" src="${image.preview}" width="320" height="176">
                </span>
              </a>
            </div>
          `;
          email_content += `<br/><br/>${material_html}`;
        }

        activities.push(activity.id);
      }
    }

    let activity_content = 'sent email';
    activity_content = ActivityHelper.campaignLog(activity_content);
    // if (is_guest) {
    //   activity_content = ActivityHelper.assistantLog(activity_content, guest.name);
    // }
    const activity = new Activity({
      content: activity_content,
      contacts: contacts[i],
      user: currentUser.id,
      type: 'emails',
      subject: email_subject,
      emails: email.id,
      videos: video_ids,
      pdfs: pdf_ids,
      images: image_ids,
      campaign,
    });

    activity.save().catch((err) => {
      console.log('email send err', err.message);
    });

    email_content = addLinkTracking(email_content, activity.id);

    if (content_type !== 2) {
      html_content =
        '<html><head><title>Email</title></head><body><tbody><tr><td>' +
        email_content +
        '<br/><br/>' +
        currentUser.email_signature +
        '</td></tr><tr><td>' +
        generateOpenTrackLink(activity.id) +
        '</td></tr><tr><td>' +
        generateUnsubscribeLink(activity.id) +
        '</td></tr></tbody></body></html>';
    } else {
      html_content =
        '<html><head><title>Email</title></head><body><tbody><tr><td>' +
        email_content +
        '</td></tr><tr><td>' +
        generateOpenTrackLink(activity.id) +
        '</td></tr><tr><td>' +
        generateUnsubscribeLink(activity.id) +
        '</td></tr></tbody></body></html>';
    }

    const hostName = garbage.smtp_info.host;
    const user = garbage.smtp_info.user;
    const pass = garbage.smtp_info.pass;
    const port = garbage.smtp_info.port;
    const ssl = garbage.smtp_info.secure;
    const emailAddress = garbage.smtp_info.email;
    var smtpTransporter = nodemailer.createTransport({
      port,
      host: hostName,
      secure: ssl,
      auth: {
        user,
        pass,
      },
      debug: true,
    });

    var mailOptions = {
      from: `${currentUser.user_name} <${emailAddress}>`,
      to: contact.email,
      text: email_content,
      subject: email_subject,
      html: html_content,
      attachments: attachment_array,
    };

    promise = new Promise((resolve) => {
      smtpTransporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          revertEmailing(activities, activity._id, email._id, []);
          revertEmailContact(email.id, contact._id);
          if (error?.responseCode === 535) {
            const data = {
              host: hostName,
              user,
              port,
              email: emailAddress,
              smtp_connected: false,
              secure: ssl,
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
            resolve({
              status: false,
              contact: {
                _id: contact['_id'],
                first_name: contact.first_name,
                email: contact.email,
              },
              email: email._id,
              error: 'No Connected SMTP',
              type: 'connection_failed',
            });
          }
          resolve({
            status: false,
            contact: {
              _id: contact['_id'],
              first_name: contact.first_name,
              email: contact.email,
            },
            error: error.message || JSON.stringify(error),
            type: 'general',
          });
        } else {
          handleSuccessEmailing(contact._id, activity._id);

          resolve({
            status: true,
            contact: {
              _id: contact._id,
              email: contact.email,
              first_name: contact.first_name,
            },
            data: activities,
          });
        }
      });
    });
    promise_array.push(promise);
  }

  return Promise.all(promise_array);
};

const updateUserCount = (userId, count) => {
  const newPromise = new Promise(async (resolve, reject) => {
    const user = await User.findOne({ _id: userId }).catch((err) => {
      reject({ message: 'not_found_user' });
    });
    if (user['email_info'] && count) {
      if (user['email_info']['count']) {
        user['email_info']['count'] += count;
      } else {
        user['email_info']['count'] = count;
      }
      user.save().catch((err) => {
        console.log('current user email count update is failed.', err);
      });
      resolve({ status: true });
    } else {
      reject({ message: 'not_found_email_info' });
    }
  });
  return newPromise;
};

const sendSESEmail = async (data) => {
  const { to_email, user_name, user_email, html, text, subject, cc } = data;

  const params = {
    Destination: {
      ToAddresses: Array.isArray(to_email) ? to_email : [to_email],
      CcAddresses: [cc],
    },
    Source: `${user_name} <${mail_contents.MAIL_SEND}>`,
    ReplyToAddresses: [user_email],
    Message: {
      /* required */
      Body: {
        /* required */
        Html: {
          Charset: 'UTF-8',
          Data: html,
        },
        Text: {
          Charset: 'UTF-8',
          Data: text,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: subject,
      },
    },
  };

  console.log('params', params);
  const command = new SendEmailCommand(params);
  await ses.send(command).catch((err) => {
    console.log('ses command err', err.message);
  });
};

const abstractHeaderValue = (rawString) => {
  if (!rawString) return '';
  const _splited = rawString.split(/[<>]/);
  if (_splited.length >= 3) return _splited[1];
  else return '';
};

const abstractCC = (rawString) => {
  if (!rawString) return null;
  const result = [];
  const _comma = rawString.split(/[,]/);
  if (_comma.length > 0) {
    _comma.forEach((c) => {
      const _splited = c.split(/[<>]/);
      if (_splited.length >= 3) result.push(_splited[1]);
    });
  }
  return result;
};

const passGmailAttachment = async (data) => {
  const { userId, messageId, attachmentId } = data;
  let currentUser;
  try {
    currentUser = await User.findOne({ _id: userId, del: false }).catch(
      (error) => {
        console.log('get user error:', error);
        throw error;
      }
    );
    await checkIdentityTokens(currentUser);
    const { googleClient } = getOauthClients(currentUser.source);
    const token = JSON.parse(currentUser.google_refresh_token);
    googleClient.setCredentials({ refresh_token: token.refresh_token });
    const gmail = google.gmail({ auth: googleClient, version: 'v1' });
    const _attachment = await gmail.users.messages.attachments
      .get({
        userId: 'me',
        messageId,
        id: attachmentId,
      })
      .catch((error) => {
        console.log('get gmail attachment error:', error);
        throw error;
      });
    if (_attachment?.data?.data)
      return { status: true, data: _attachment.data.data };
    else {
      console.log('get email attachment data not found');
      throw new Error('get email attachment data not found');
    }
  } catch (error) {
    sendErrorToSentry(currentUser, error);
    return { status: false, error };
  }
};

const getGmailMessageFullContent = async (data) => {
  const { userId, messageId, parts, result } = data;
  if (!parts?.length) return;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part?.filename === '') {
      if (part?.mimeType === 'text/html' && part?.body?.data) {
        result.emailContent = base64url.decode(part.body.data);
      }
    } else {
      const attachmentId = part?.body?.attachmentId;
      const mimeType = part?.mimeType;
      const size = part?.body?.size;
      const filename = part?.filename;
      let contentId;
      let mimeData;
      const _contentId = part.headers.filter((_h) => _h.name === 'Content-ID');
      if (Array.isArray(_contentId) && _contentId.length) {
        contentId = abstractHeaderValue(_contentId[0]?.value);
        if (contentId) {
          const _res = await passGmailAttachment({
            userId,
            messageId,
            attachmentId,
          });
          if (_res.status) mimeData = _res.data;
        }
      }
      const data = {
        filename,
        mimeType,
        attachmentId,
        size,
        contentId,
        mimeData,
      };
      result.emailAttachments.push(data);
    }
    if (part?.parts?.length > 0) {
      const subParts = part.parts;
      await getGmailMessageFullContent({
        userId,
        messageId,
        subParts,
        result,
      });
    }
  }
};

const makeAttachmentContent = async (attachment) => {
  let content;
  if (attachment.url) {
    const key = attachment.url.slice(urls.STORAGE_BASE.length + 1);
    const data = await downloadFile(key);
    content = data.toString('base64');
  } else {
    content = attachment.content;
  }
  return content;
};

/// //////////////////////////////////////////////////////////////

const startGmailWatcher = async (token, source = 'crmgrow') => {
  const { googleClient } = getOauthClients(source);

  googleClient.setCredentials({ refresh_token: token.refresh_token });

  await googleClient.getAccessToken().catch((err) => {
    console.log('get access err', err.message);
  });

  const response = await google
    .gmail({ version: 'v1', auth: googleClient })
    .users.watch({
      userId: 'me',
      requestBody: {
        topicName: `projects/crmgrow-stage/topics/InboxTopic`,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      },
    })
    .catch((err) => {
      console.log(
        'Starting google email inbox hook error',
        err.message || err.msg || err
      );
    });
  /**
   * must be like below
   * data: { historyId: '2045543', expiration: '1695009371544' }
   *  */
  return response?.data?.historyId || null;
};

module.exports = {
  sendEmail,
  sendEmailBySMTP,
  sendSESEmail,
  isBlockedEmail,
  addLinkTracking,
  generateUnsubscribeLink,
  generateOpenTrackLink,
  revertEmailing,
  handleSuccessEmailing,
  updateUserCount,
  abstractHeaderValue,
  abstractCC,
  passGmailAttachment,
  getGmailMessageFullContent,
  startGmailWatcher,
};
