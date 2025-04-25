const mongoose = require('mongoose');
const moment = require('moment-timezone');
const CronJob = require('cron').CronJob;
const fs = require('fs');
const { v1: uuidv1 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const child_process = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });
require('../configureSentry');
const User = require('../src/models/user');
const Contact = require('../src/models/contact');
const Activity = require('../src/models/activity');
const FollowUp = require('../src/models/follow_up');
const Video = require('../src/models/video');
const Notification = require('../src/models/notification');

const CampaignJob = require('../src/models/campaign_job');
const EmailTemplate = require('../src/models/email_template');
const Payment = require('../src/models/payment');

const api = require('../src/configs/api');
const system_settings = require('../src/configs/system_settings');
const { VIDEO_PATH, TEMP_PATH } = require('../src/configs/path');
const urls = require('../src/constants/urls');
const notifications = require('../src/constants/notification');
const mail_contents = require('../src/constants/mail_contents');

const { sendNotificationEmail } = require('../src/helpers/notification');
const EmailHelper = require('../src/helpers/email');
const FileHelper = require('../src/helpers/file');
const { clearData, releaseData, suspendData } = require('../src/helpers/user');

const { DB_PORT } = require('../src/configs/database');
const Team = require('../src/models/team');
const { getUserTimezone } = require('../src/helpers/utility');
const { getWavvBrandState } = require('../src/services/message');
const { updateSubscription } = require('../src/helpers/payment');
const {
  sendUpdatePackageNotificationEmail,
} = require('../src/helpers/notification');
const { setPackage } = require('../src/helpers/user');
const { sendErrorToSentry } = require('../src/helpers/utility');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const daily_report = new CronJob(
  '0 21 * * 1-6',
  async () => {
    await User.find({ daily_report: true, del: false })
      .then(async (users) => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        // end.setHours(20, 59, 59, 999);
        for (let i = 0; i < users.length; i++) {
          const currentUser = users[i];
          const activity = await Activity.find({
            user: currentUser.id,
            created_at: { $gte: start, $lt: end },
          }).catch((err) => {
            console.log('err: ', err);
          });

          let content_html = '';

          for (let j = 0; j < activity.length; j++) {
            const contact = await Contact.findOne({
              _id: activity[j].contacts,
            }).catch((err) => {
              console.log('err: ', err);
            });

            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';

            const content =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              activity[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.CONTACT_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/contact.png'/></a></td></tr>";

            content_html += content;
          }

          const _follow_up = await FollowUp.find({
            user: currentUser.id,
            status: 0,
            due_date: { $lt: end },
          }).catch((err) => {
            console.log('err: ', err);
          });

          for (let j = 0; j < _follow_up.length; j++) {
            const contact = await Contact.findOne({
              _id: _follow_up[j].contact,
            }).catch((err) => {
              console.log('err: ', err);
            });

            if (!contact.cell_phone) {
              contact.cell_phone = '';
            }

            const content =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              _follow_up[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.FOLLOWUP_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/followup.png'/></a></td></tr>";

            content_html += content;
          }

          const time_zone = getUserTimezone(currentUser);

          if (activity.length > 0 || _follow_up.length > 0) {
            const data = {
              template_data: {
                user_name: currentUser.user_name,
                created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
                content: content_html,
              },
              template_name: 'DailyReport',
              required_reply: false,
              email: currentUser.email,
              source: currentUser.source,
            };

            sendNotificationEmail(data);
          }
        }
      })
      .catch((err) => {
        console.log('err', err);
      });
  },
  function () {
    console.log('Daily Report Job finished.');
  },
  false,
  'US/Central'
);

const weekly_report = new CronJob({
  // Run at 21:00 Central time, only on friday
  cronTime: '00 21 * * Sun',
  onTick: async () => {
    await User.find({ weekly_report: true, del: false })
      .then(async (users) => {
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(today.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(20, 59, 59, 999);
        for (let i = 0; i < users.length; i++) {
          const currentUser = users[i];
          const activity = await Activity.find({
            user: currentUser.id,
            created_at: { $gte: monday, $lt: end },
          })
            .sort({ _id: -1 })
            .limit(15)
            .catch((err) => {
              console.log('err: ', err);
            });
          const now = moment();
          const today = now.format('MMMM, dddd Do YYYY');

          const contacts = [];
          for (let j = 0; j < activity.length; j++) {
            const contact = await Contact.findOne({
              _id: activity[j].contacts,
            }).catch((err) => {
              console.log('err: ', err);
            });
            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';
            const content =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              activity[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.CONTACT_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/contact.png'/></a></td></tr>";
            contacts.push(content);
          }

          const _follow_up = await FollowUp.find({
            user: currentUser.id,
            status: 0,
            due_date: { $lt: end },
          }).catch((err) => {
            console.log('err: ', err);
          });
          const overdue = [];

          for (let j = 0; j < _follow_up.length; j++) {
            const contact = await Contact.findOne({
              _id: _follow_up[j].contact,
            }).catch((err) => {
              console.log('err: ', err);
            });
            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';
            const _overdue =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              _follow_up[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.FOLLOWUP_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/contact.png'/></a></td></tr>";
            overdue.push(_overdue);
          }

          if (contacts.length > 0 || overdue.length > 0) {
            const msg = {
              to: currentUser.email,
              from: mail_contents.DAILY_REPORT.MAIL,
              subject: mail_contents.DAILY_REPORT.SUBJECT,
              templateId: api.SENDGRID.SENDGRID_DAILY_REPORT_TEMPLATE,
              dynamic_template_data: {
                contacts,
                overdue,
                day: today,
              },
            };

            /*
            sgMail
              .send(msg)
              .then((res) => {
                console.log('mailres.errorcode', res[0].statusCode);
                if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                  console.log('Successful send to ' + msg.to);
                } else {
                  console.log(res[0].statusCode);
                }
              })
              .catch((err) => {
                console.log('err: ', err);
              });
              */
          }
        }
      })
      .catch((err) => {
        console.log('err', err);
      });
  },
  start: false,
  timeZone: 'US/Central',
});

const signup_job = new CronJob(
  '0,30 * * * 0-6',
  async () => {
    const subscribers = await User.find({
      welcome_email: false,
      del: false,
    }).catch((err) => {
      console.log('err', err);
    });

    if (subscribers) {
      for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        const created_at = new Date(subscriber['created_at']).getTime();
        const now = new Date().getTime();
        const offset = now - created_at;
        if (offset >= 30 * 60 * 1000 && offset < 60 * 60 * 1000) {
          // const msg = {
          //   to: subscriber.email,
          //   from: mail_contents.WELCOME_SIGNUP.MAIL,
          //   templateId: api.SENDGRID.SENDGRID_SIGNUP_FLOW_REACH,
          //   dynamic_template_data: {
          //     first_name: subscriber.user_name,
          //   },
          // };
          // sgMail
          //   .send(msg)
          //   .then((res) => {
          //     console.log('mailres.errorcode', res[0].statusCode);
          //     if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
          //       console.log('Successful send to ' + msg.to);
          //     } else {
          //       console.log('email sending err', msg.to + res[0].statusCode);
          //     }
          //   })
          //   .catch((err) => {
          //     console.log('err', err);
          //   });

          const templatedData = {
            user_name: subscriber.user_name,
            created_at: moment().format('h:mm MMMM Do, YYYY'),
            webinar_link: system_settings.WEBINAR_LINK,
          };

          const params = {
            Destination: {
              ToAddresses: [subscriber.email],
            },
            Source: mail_contents.REPLY,
            Template: 'WebinarInvitation',
            TemplateData: JSON.stringify(templatedData),
          };

          // Create the promise and SES service object
          const command = new SendTemplatedEmailCommand(params);
          await ses.send(command).catch((err) => {
            console.log('ses command err', err.message);
          });

          const notification = new Notification({
            user: subscribers[i].id,
            criteria: 'webniar',
            content: notifications.webinar.content,
            description: notifications.webinar.description,
          });
          notification.save().catch((err) => {
            console.log('notification save err', err.message);
          });
        }
        if (offset >= 24 * 60 * 60 * 1000 && offset < 24.5 * 60 * 60 * 1000) {
          const msg = {
            to: subscriber.email,
            from: mail_contents.WELCOME_SIGNUP.MAIL,
            templateId: api.SENDGRID.SENDGRID_SIGNUP_FLOW_THIRD,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              video_link: `<a href="${urls.INTRO_VIDEO_URL}">Click this link - Download Video</a>`,
              recruiting_material: `<a href="${urls.MATERIAL_VIEW_PAGE}">Material Page</a>`,
            },
          };
          /*
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
            */
        }
        if (offset >= 48 * 60 * 60 * 1000 && offset < 48.5 * 60 * 60 * 1000) {
          const msg = {
            to: subscriber.email,
            from: mail_contents.WELCOME_SIGNUP.MAIL,
            templateId: api.SENDGRID.SENDGRID_SIGNUP_FLOW_FORTH,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              login_link: `<a href="${urls.LOGIN_URL}">Click here to login into your account</a>`,
            },
          };
          /*
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
                subscriber['welcome_email'] = true;
                subscriber.save().catch((err) => {
                  console.log('err', err);
                });
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
            */
        }
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const payment_check = new CronJob(
  '0 21 */3 * *',
  async () => {
    const subscribers = await User.find({
      'subscription.is_failed': true,
      'subscription.is_suspended': false,
      del: false,
    }).catch((err) => {
      console.log('err', err.messsage);
    });

    if (subscribers && subscribers.length > 0) {
      for (let i = 0; i < subscribers.length; i++) {
        const user = subscribers[i];

        const time_zone = getUserTimezone(user);

        const payment = await Payment.findOne({ _id: user.payment }).catch(
          (err) => {
            console.log('payment find err', err.message);
          }
        );

        const data = {
          template_data: {
            user_name: user.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            amount: user.subscription.amount / 100 || 29,
            last_4_cc: payment.last4 || 'Unknown',
          },
          template_name: 'PaymentFailed',
          required_reply: true,
          email: user.email,
          source: user.source,
        };

        sendNotificationEmail(data);
      }
    }
  },
  function () {
    console.log('Payment Check Job finished.');
  },
  false,
  'US/Central'
);

const logger_check = new CronJob(
  '0 21 */3 * *',
  async () => {
    const logger_notification = await Notification.findOne({
      type: 'urgent',
      criteria: 'long_out',
    }).catch((err) => {
      console.log('err', err);
    });
    if (logger_notification) {
      let startdate = moment();
      startdate = startdate.subtract(30, 'days');
      const users = await User.find({
        last_logged: { $lt: startdate },
        del: false,
      }).catch((err) => {
        console.log('err', err);
      });
      if (users) {
        for (let i = 0; i < users.length; i++) {
          const subscriber = users[i];

          const msg = {
            to: users.email,
            from: mail_contents.SUPPORT_CRMGROW.MAIL,
            templateId: api.SENDGRID.SENDGRID_SYSTEM_NOTIFICATION,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              content: logger_notification['content'],
            },
          };

          /*
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
            */
        }
      }
    }
  },
  function () {
    console.log('Logger check Job finished.');
  },
  false,
  'US/Central'
);

const notification_check = new CronJob(
  '0 21 * * *',
  async () => {
    const notifications = await Notification.find({
      type: 'static',
      sent: false,
    }).catch((err) => {
      console.log('err', err);
    });
    if (notifications) {
      const subscribers = await User.find({ del: false }).catch((err) => {
        console.log('err', err);
      });
      for (let i = 0; i < notifications.length; i++) {
        const notification = notifications[i];

        for (let j = 0; j < subscribers.length; j++) {
          const subscriber = subscribers[j];
          const msg = {
            to: subscriber.email,
            from: mail_contents.SUPPORT_CRMGROW.MAIL,
            templateId: api.SENDGRID.SENDGRID_SYSTEM_NOTIFICATION,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              content: notification.content,
            },
          };
          /*
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
                notification['sent'] = true;
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
            */
        }
      }
    }

    let startdate = moment();
    startdate = startdate.subtract(7, 'days');
    const old_notifications = await Notification.find({
      type: 'static',
      created_at: { $lte: startdate },
    }).catch((err) => {
      console.log('err', err);
    });
    for (let i = 0; i < old_notifications.length; i++) {
      const old_notification = old_notifications[i];
      old_notification['del'] = true;
      old_notification.save().catch((err) => {
        console.log('err', err);
      });
    }
  },
  function () {
    console.log('Notification Check Job finished.');
  },
  false,
  'US/Central'
);

const convert_video_job = new CronJob(
  '0 1 * * *',
  async () => {
    const record_videos = await Video.find({
      recording: true,
      converted: 'none',
      del: false,
    }).catch((err) => {
      console.log('record videos convert err', err.message);
    });
    for (let i = 0; i < record_videos.length; i++) {
      const video = record_videos[i];
      const file_path = video.path;
      if (file_path) {
        if (fs.existsSync(file_path)) {
          const new_file = uuidv1() + '.mov';
          const new_path = TEMP_PATH + new_file;
          const args = [
            '-i',
            file_path,
            '-max_muxing_queue_size',
            '1024',
            '-vf',
            'pad=ceil(iw/2)*2:ceil(ih/2)*2',
            new_path,
          ];
          const ffmpegConvert = await child_process.spawn(ffmpegPath, args);
          ffmpegConvert.on('close', function () {
            console.log('converted end', file_path);
            const new_url = urls.VIDEO_URL + new_file;
            video['url'] = new_url;
            video['recording'] = false;
            video['path'] = new_path;
            video['converted'] = 'completed';
            video
              .save()
              .then(() => {
                fs.unlinkSync(file_path);
              })
              .catch((err) => {
                console.log('err', err.message);
              });
          });
        }
      }
    }

    const uploaded_videos = await Video.find({
      recording: false,
      converted: 'none',
      del: false,
      type: { $nin: ['youtube', 'vimeo'] },
    }).catch((err) => {
      console.log('uploaded videos convert err', err.message);
    });
    for (let i = 0; i < uploaded_videos.length; i++) {
      const video = uploaded_videos[i];
      const file_path = video.path;
      if (file_path) {
        if (fs.existsSync(file_path)) {
          const new_file = uuidv1() + '.mp4';
          const new_path = TEMP_PATH + new_file;
          const args = [
            '-i',
            file_path,
            '-c:v',
            'libx264',
            '-b:v',
            '1.5M',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            new_path,
          ];

          const ffmpegConvert = await child_process.spawn(ffmpegPath, args);
          ffmpegConvert.on('close', function () {
            console.log('converted end', file_path);
            if (fs.existsSync(new_path)) {
              const new_url = urls.VIDEO_URL + new_file;
              video['url'] = new_url;
              video['converted'] = 'completed';
              video['path'] = new_path;
              video
                .save()
                .then(() => {
                  fs.unlinkSync(file_path);
                })
                .catch((err) => {
                  console.log('err', err.message);
                });
            }
          });
        }
      }
    }
  },
  function () {
    console.log('Video Convert Job Finished.');
  },
  false,
  'US/Central'
);

const upload_video_job = new CronJob(
  '0 4 * * *',
  async () => {
    const videos = await Video.find({
      uploaded: false,
      del: false,
      type: { $nin: ['youtube', 'vimeo'] },
    }).catch((err) => {
      console.log('err', err.message);
    });

    if (videos) {
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const file_path = video.path;
        const old_path = video.old_path;
        if (file_path) {
          const file_name = video.path.slice(37);

          if (fs.existsSync(file_path)) {
            const today = new Date();
            const year = today.getYear();
            const month = today.getMonth();
            const key = 'video' + year + '/' + month + '/' + file_name;
            const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
            try {
              fs.readFile(file_path, async (err, data) => {
                if (err) {
                  FileHelper.readFile(file_path)
                    .then(async (data1) => {
                      console.log('File read was successful by stream', data1);
                      const params = {
                        Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
                        Key: key,
                        Body: data1,
                        ACL: 'public-read',
                      };
                      await s3.send(new PutObjectCommand(params));
                      video['url'] = location;
                      video['uploaded'] = true;
                      video
                        .save()
                        .then(() => {
                          fs.unlinkSync(file_path);
                        })
                        .catch((err) => {
                          console.log('err', err);
                        });
                    })
                    .catch(function (err) {
                      console.log('File read by stream error', err);
                    });
                } else {
                  console.log('File read was successful', data);
                  const params = {
                    Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
                    Key: key,
                    Body: data,
                    ACL: 'public-read',
                  };
                  await s3.send(new PutObjectCommand(params));
                  video['url'] = location;
                  video['uploaded'] = true;
                  video
                    .save()
                    .then(() => {
                      fs.unlinkSync(file_path);
                    })
                    .catch((err) => {
                      console.log('err', err.message);
                    });
                }
              });
            } catch (err) {
              console.log('err', err.message);
              // read file
            }
          }
          if (old_path && fs.existsSync(old_path)) {
            fs.unlinkSync(old_path);
          }
        }
      }
    }
  },
  function () {
    console.log('Convert Job finished.');
  },
  false,
  'US/Central'
);

const reset_daily_limit = new CronJob(
  '0 3 * * *',
  async () => {
    User.updateMany(
      {
        del: false,
      },
      {
        $set: {
          'email_info.count': 0,
        },
      }
    ).catch((err) => {
      console.log('daily email reset failed', err.message);
    });

    /** I don't think we need this code anymore
    const smtp_users = await User.find({
      primary_connected: true,
      connected_email_type: 'smtp',
      del: false,
    }).catch((err) => {
      console.log('smtp user get err', err.message);
    });
    for (let i = 0; i < smtp_users.length; i++) {
      const smtp_user = smtp_users[i];
      const garbage = await Garbage.findOne({ user: smtp_user.id });

      const active_task = await Task.findOne({
        'action.type': 'assign_automation',
        user: smtp_user.id,
        status: 'pending',
      });

      const smtp_email_limit = garbage['smtp_info']['daily_limit'];

      if (active_task) {
        User.updateOne(
          {
            _id: smtp_user.id,
          },
          {
            $set: { 'email_info.max_count': smtp_email_limit },
          }
        ).catch((err) => {
          console.log('user update err', err.message);
        });
      } else {
        User.updateOne(
          {
            _id: smtp_user.id,
          },
          {
            $set: { 'email_info.max_count': smtp_email_limit * 2 },
          }
        ).catch((err) => {
          console.log('user update err', err.message);
        });
      }
    }
     */
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const reset_monthly_limit = new CronJob(
  '0 3 1 * *',
  async () => {
    User.updateMany(
      { del: false },
      {
        $set: {
          'text_info.count': 0,
        },
      }
    ).catch((err) => {
      console.log('users found err', err.message);
    });
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const campaign_job = new CronJob(
  '0 * * * *',
  async () => {
    const due_date = new Date();
    const campaign_jobs = await CampaignJob.find({
      status: 'active',
      due_date: { $lte: due_date },
    }).populate({
      path: 'campaign',
      select: {
        email_template: 1,
        video: 1,
        pdf: 1,
        image: 1,
      },
    });

    if (campaign_jobs && campaign_jobs.length > 0) {
      for (let i = 0; i < campaign_jobs.length; i++) {
        const campaign_job = campaign_jobs[i];
        const campaign = campaign_job.email_template;
        const email_template = await EmailTemplate.findOne({
          _id: campaign.email_template,
        });

        const { user, contacts } = campaign_job;
        const data = {
          user,
          content: email_template.content,
          subject: email_template.subject,
          contacts,
          video_ids: campaign.videos,
          pdf_ids: campaign.pdfs,
          image_ids: campaign.images,
        };

        EmailHelper.sendEmail(data)
          .then((res) => {})
          .catch((err) => {
            console.log('err', err.message);
          });
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const clean_data = new CronJob(
  '0 1 * * *',
  async () => {
    const expired_date = new Date();
    expired_date.setDate(
      expired_date.getDate() - system_settings.DATA_RETENTION
    );

    const users = await User.find({
      user_disabled: true,
      data_cleaned: false,
      disabled_at: { $lte: expired_date },
    }).catch((err) => {
      console.log('admin user found err', err.message);
    });

    if (users && users.length) {
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        clearData(user.id);
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const release_data = new CronJob(
  '15 5 * * *',
  async () => {
    const expired_date = new Date();
    expired_date.setDate(
      expired_date.getDate() - system_settings.DATA_RELEASE_RETENTION
    );

    const users = await User.find({
      user_disabled: true,
      data_released: false,
      disabled_at: { $lte: expired_date },
    }).catch((err) => {
      console.log('admin user found err', err.message);
    });

    if (users && users.length) {
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        releaseData(user.id);
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const clean_old_notifications = new CronJob(
  '0 21 * * *',
  async () => {
    let expired_date = moment();
    expired_date = expired_date.subtract(30, 'days');
    await Notification.deleteMany({
      created_at: { $lte: expired_date },
      type: 'personal',
    }).catch((err) => {
      console.log('notification clean error', err.message);
    });
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const trial_user_check = new CronJob(
  '0 1 * * *',
  async () => {
    const before14Days = moment().clone().subtract(15, 'days').endOf('day');
    const suspendUsers = await User.find({
      is_trial: true,
      user_disabled: false,
      del: false,
      is_free: { $ne: true },
      created_at: { $lte: before14Days },
    });

    for (const suspendUser of suspendUsers) {
      // clear account
      suspendData(suspendUser.id);

      // send notification email
      const time_zone = getUserTimezone(suspendUser);
      const data = {
        template_data: {
          user_name: suspendUser.user_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          amount: suspendUser.subscription.amount / 100 || 29,
          last_4_cc: 'Unknown',
        },
        template_name: 'SuspendNotification',
        required_reply: true,
        email: suspendUser.email,
        source: suspendUser.source,
      };

      sendNotificationEmail(data);
    }

    await User.updateMany(
      {
        is_trial: true,
        user_disabled: false,
        del: false,
        is_free: { $ne: true },
        created_at: { $lte: before14Days },
      },
      {
        $set: {
          user_disabled: true,
          'subscription.is_failed': true,
          'subscription.is_suspended': true,
          data_cleaned: false,
          data_released: false,
          disabled_at: new Date(),
        },
      }
    );
  },
  function () {
    console.log('Trial User has disabled Check Job finished.');
  },
  false,
  'US/Central'
);

const clean_round_robin_expire_cursors = new CronJob(
  '0 21 * * *',
  async () => {
    const expireLimit = system_settings.ROUND_ROBIN_CURSOR_EXPIRE;
    const compareTime = moment()
      .clone()
      .subtract(expireLimit, 'days')
      .endOf('day');
    await Team.updateMany(
      {
        last_rounded_at: { $lte: compareTime },
        cursor: { $exists: true },
      },
      {
        $unset: { cursor: true },
      }
    );
  },
  function () {
    console.log('Cleaning round_robin expired cursors finished.');
  },
  false,
  'US/Central'
);

const wavv_status_check = new CronJob(
  '0 1 * * *',
  async () => {
    const users = await User.find({
      'wavv_status.value': { $exists: true, $ne: 'APPROVED' },
    }).catch((err) => {
      console.log('err', err);
    });

    // Need to add migration code updateMany({ is_wavv_enabled: true }, { $set: {wavv_status: 'subscribed'} })

    let message = 'Wavv User Status Update:';

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      let wavvUserId = user._id;

      if (user.source === 'vortex' && user.vortex_id) {
        wavvUserId = user.vortex_id;
      }
      const brandStatus = await getWavvBrandState(wavvUserId, user.source);
      if (brandStatus && brandStatus.status) {
        let status = '';
        const upper_status = brandStatus.status.toUpperCase();
        if (upper_status !== user.wavv_status?.value) {
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                'wavv_status.value': upper_status,
                'wavv_status.updated_at': new Date(),
              },
            }
          );
          if (
            upper_status === 'APPROVED' &&
            user.user_version >= system_settings.USER_VERSION
          ) {
            // TODO: Call the Helper function to upgrade the Growth to Growth+
            const level = 'GROWTH_PLUS_TEXT';
            updateSubscription({
              payment_id: user.payment,
              type: 'update',
              level,
            })
              .then(() => {
                sendUpdatePackageNotificationEmail(user, level);
                setPackage({ user: user.id, level });
              })
              .catch((err) => {
                sendErrorToSentry(user, err);
                console.log('user set package err', err.message);
              });
          }
          status = upper_status;
        }

        if (status) {
          message = `${message}\n${user.email}: ${status}`;
        }
      }
    }

    // Add Send message logic here.
  },
  () => {
    console.log('Wavv Status check Job finished.');
  },
  false,
  'US/Central'
);

wavv_status_check.start();

clean_data.start();
release_data.start();
// signup_job.start();

// weekly_report.start();
// upload_video_job.start();
// convert_video_job.start();
payment_check.start();
// campaign_job.start();
// logger_check.start()
// notification_check.start();
reset_daily_limit.start();
reset_monthly_limit.start();

// daily_report.start();
clean_old_notifications.start();
trial_user_check.start();
clean_round_robin_expire_cursors.start();
