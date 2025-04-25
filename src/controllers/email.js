const moment = require('moment-timezone');
const base64url = require('base64url');

const path = require('path');
const mime = require('mime-types');
const mongoose = require('mongoose');
require('isomorphic-fetch');

const Activity = require('../models/activity');
const ExtActivity = require('../models/ext_activity');
const Contact = require('../models/contact');
const Deal = require('../models/deal');
const Email = require('../models/email');
const EmailTracker = require('../models/email_tracker');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const User = require('../models/user');
const TimeLine = require('../models/time_line');
const Label = require('../models/label');
const system_settings = require('../configs/system_settings');
const { google } = require('googleapis');
const api = require('../configs/api');
const { sendExtensionSocketSignal } = require('../helpers/socket');
const urls = require('../constants/urls');
const { replaceToken, sendErrorToSentry } = require('../helpers/utility');
const { TRAKER_PATH } = require('../configs/path');
const {
  abstractHeaderValue,
  abstractCC,
  passGmailAttachment,
  getGmailMessageFullContent,
} = require('../helpers/email');

const { disableNext } = require('../services/automation_line');
const { triggerTimeline, activeTimeline } = require('../services/time_line');
const { createNotification } = require('../helpers/notification');
const { sendSESEmail } = require('../helpers/email');
const { checkIdentityTokens, getOauthClients } = require('../helpers/user');

const getLabelName = (labelId) => {
  return new Promise((resolve) => {
    if (!labelId) resolve(null);
    Label.findOne({
      _id: mongoose.Types.ObjectId(labelId),
    })
      .then((res) => {
        if (res) resolve(res.name);
        else resolve(null);
      })
      .catch(() => {
        resolve(null);
      });
  });
};

const openTrack = async (req, res) => {
  const message_id = req.params.id;
  const _email = await Email.findOne({ message_id }).catch((err) => {
    console.log('err', err);
  });
  const user = await User.findOne({ _id: _email.user, del: false }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  const contact = await Contact.findOne({ _id: _email.contacts }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  const opened = new Date();
  if (contact && user) {
    const email_activity = await Activity.findOne({
      contacts: contact.id,
      emails: _email.id,
    }).catch((err) => {
      console.log('err', err);
    });

    let reopened = moment();
    reopened = reopened.subtract(1, 'hours');
    const old_activity = await EmailTracker.findOne({
      activity: email_activity.id,
      type: 'open',
      created_at: { $gte: reopened },
    }).catch((err) => {
      console.log('err', err);
    });

    if (!old_activity) {
      const email_tracker = new EmailTracker({
        user: user.id,
        contact: contact.id,
        email: _email.id,
        type: 'open',
        activity: email_activity.id,
        updated_at: opened,
        created_at: opened,
      });

      const _email_tracker = await email_tracker
        .save()
        .then()
        .catch((err) => {
          console.log('err', err);
        });

      const activity = new Activity({
        content: 'opened email',
        contacts: contact.id,
        user: user.id,
        type: 'email_trackers',
        emails: _email.id,
        email_trackers: _email_tracker.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const _activity = await activity
        .save()
        .then()
        .catch((err) => {
          console.log('err', err);
        });

      Contact.updateOne(
        { _id: contact.id },
        { $set: { last_activity: _activity.id } }
      ).catch((err) => {
        console.log('err', err);
      });
    }
  }
  const contentType = mime.contentType(path.extname(TRAKER_PATH));
  res.set('Content-Type', contentType);
  return res.sendFile(TRAKER_PATH);
};

const receiveEmailSendGrid = async (req, res) => {
  const message_id = req.body[0].sg_message_id.split('.')[0];
  const event = req.body[0].event;
  const email = req.body[0].email;
  const time_stamp = req.body[0].timestamp;
  const _email = await Email.findOne({ message_id }).catch((err) => {
    console.log('err', err);
  });
  if (_email) {
    const user = await User.findOne({ _id: _email.user, del: false }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    let contact;
    if (user) {
      contact = await Contact.findOne({ email, user: user.id }).catch((err) => {
        console.log('err', err);
      });
    }

    if (contact && user) {
      const opened = new Date(time_stamp * 1000);
      let action = '';
      if (event === 'open') {
        action = 'opened';
        const email_activity = await Activity.findOne({
          contacts: contact.id,
          emails: _email.id,
        }).catch((err) => {
          console.log('err', err);
        });

        let old_activity;
        if (email_activity) {
          const reopened = new Date(time_stamp * 1000 - 60 * 60 * 1000);
          old_activity = await EmailTracker.findOne({
            activity: email_activity.id,
            type: 'open',
            created_at: { $gte: reopened },
          }).catch((err) => {
            console.log('err', err.message);
          });
        }

        if (!old_activity && email_activity) {
          const sent = new Date(email_activity.updated_at);
          const opened_gap = opened.getTime() - sent.getTime();

          if (opened_gap < 2000) {
            return;
          }

          const email_tracker = new EmailTracker({
            user: user.id,
            contact: contact.id,
            email: _email.id,
            type: 'open',
            activity: email_activity.id,
            updated_at: opened,
            created_at: opened,
          });
          const _email_tracker = await email_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          const activity = new Activity({
            content: 'opened email',
            contacts: contact.id,
            user: user.id,
            type: 'email_trackers',
            emails: _email.id,
            email_trackers: _email_tracker.id,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const _activity = await activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: _activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          createNotification(
            'open_email',
            {
              criteria: 'open_email',
              contact,
              user,
              action: {
                object: 'email',
                email: _email.id,
              },
              email_tracker: _email_tracker,
              email: _email,
            },
            user
          );

          /**
           * Automation checking
           */
          const timelines = await TimeLine.find({
            contact: contact.id,
            status: 'active',
            opened_email: req.params.id,
            'condition.case': 'opened_email',
            'condition.answer': true,
          }).catch((err) => {
            console.log('err', err);
          });

          if (timelines.length > 0) {
            for (let i = 0; i < timelines.length; i++) {
              try {
                const timeline = timelines[i];
                activeTimeline({ userId: user.id, timeline_id: timeline.id });
              } catch (err) {
                console.log('err', err.message);
              }
            }
          }
          const unopened_timelines = await TimeLine.findOne({
            contact: contact.id,
            status: 'active',
            opened_email: req.params.id,
            'condition.case': 'opened_email',
            'condition.answer': false,
          }).catch((err) => {
            console.log('err', err);
          });
          if (unopened_timelines.length > 0) {
            for (let i = 0; i < unopened_timelines.length; i++) {
              const timeline = unopened_timelines[i];
              disableNext({ userId: user.id, timeline_id: timeline.id });
            }
          }
        } else {
          return;
        }
      }
      if (event === 'click') {
        action = 'clicked the link on';
        const email_activity = await Activity.findOne({
          contacts: contact.id,
          emails: _email.id,
        }).catch((err) => {
          console.log('err', err);
        });
        const reclicked = new Date(time_stamp * 1000 - 60 * 60 * 1000);
        const old_activity = await EmailTracker.findOne({
          activity: email_activity.id,
          type: 'click',
          created_at: { $gte: reclicked },
        }).catch((err) => {
          console.log('err', err);
        });

        if (old_activity) {
          return;
        }
        const email_tracker = new EmailTracker({
          user: user.id,
          contact: contact.id,
          email: _email.id,
          type: 'click',
          activity: email_activity.id,
          updated_at: opened,
          created_at: opened,
        });
        if (email_activity.campaign) {
          email_tracker['campaign'] = email_activity.campaign;
        }
        const _email_tracker = await email_tracker
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        const activity = new Activity({
          content: 'clicked the link on email',
          contacts: contact.id,
          user: user.id,
          type: 'email_trackers',
          emails: _email.id,
          email_trackers: _email_tracker.id,
          created_at: new Date(),
          updated_at: new Date(),
        });
        if (email_activity.campaign) {
          activity['campaign'] = email_activity.campaign;
        }

        const _activity = await activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });

        createNotification(
          'click_link',
          {
            criteria: 'click_link',
            contact,
            user,
            action: {
              object: 'email',
              email: _email.id,
            },
            email: _email,
            email_tracker: _email_tracker,
          },
          user
        );
      }
      if (event === 'unsubscribe') {
        action = 'unsubscribed';
        const email_activity = await Activity.findOne({
          contacts: contact.id,
          emails: _email.id,
        }).catch((err) => {
          console.log('err', err);
        });
        const email_tracker = new EmailTracker({
          user: user.id,
          contact: contact.id,
          email: _email.id,
          type: 'unsubscribe',
          activity: email_activity.id,
          updated_at: opened,
          created_at: opened,
        });
        const _email_tracker = await email_tracker
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        const activity = new Activity({
          content: 'unsubscribed email',
          contacts: contact.id,
          user: user.id,
          type: 'email_trackers',
          emails: _email.id,
          email_trackers: _email_tracker.id,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const _activity = await activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: _activity.id, 'unsubscribed.email': true },
          }
        ).catch((err) => {
          console.log('err', err);
        });

        createNotification(
          'unsubscribe_email',
          {
            criteria: 'unsubscribe_email',
            contact,
            user,
            action: {
              object: 'email',
              email: _email.id,
            },
            email: _email,
            email_trackers: _email_tracker,
          },
          user
        );
      }
    }
  }

  return res.send({
    status: true,
  });
};

const receiveEmail = async (req, res) => {
  const activity = await Activity.findOne({ _id: req.params.id })
    .populate({ path: 'emails', select: 'has_shared shared_email' })
    .catch((err) => {
      console.log('activity finding err', err.message);
    });

  if (activity) {
    const user = await User.findOne({ _id: activity.user, del: false }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const contact = await Contact.findOne({ _id: activity.contacts }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const opened = new Date();
    if (contact && user) {
      const sent = new Date(activity.updated_at);
      const opened_gap = opened.getTime() - sent.getTime();

      if (opened_gap < 4000) {
        return;
      }

      let reopened = moment();
      reopened = reopened.subtract(1, 'hours');

      const old_activity = await EmailTracker.findOne({
        activity: req.params.id,
        type: 'open',
        created_at: { $gte: reopened },
      }).catch((err) => {
        console.log('err', err);
      });

      if (!old_activity) {
        const email_tracker = new EmailTracker({
          user: user.id,
          contact: contact.id,
          email: activity.emails,
          type: 'open',
          activity: req.params.id,
          updated_at: opened,
          created_at: opened,
        });
        if (activity.campaign) {
          email_tracker['campaign'] = activity.campaign;
        }

        const _email_tracker = await email_tracker
          .save()
          .then()
          .catch((err) => {
            console.log('email tracker err', err.message);
          });

        const opened_activity = new Activity({
          content: 'opened email',
          contacts: contact.id,
          user: user.id,
          type: 'email_trackers',
          emails: activity.emails,
          email_trackers: _email_tracker.id,
          created_at: new Date(),
          updated_at: new Date(),
        });

        if (activity.campaign) {
          opened_activity.campaign = activity.campaign;
        }

        const _activity = await opened_activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          { $set: { last_activity: _activity.id } }
        ).catch((err) => {
          console.log('err', err);
        });
        /**
         * Deal activity
         */

        if (activity && activity.emails && activity.emails.has_shared) {
          Email.updateOne(
            {
              _id: activity.emails._id,
            },
            {
              $set: {
                email_tracker: _email_tracker.id,
              },
              $unset: {
                video_tracker: true,
                pdf_tracker: true,
                image_tracker: true,
              },
            }
          ).catch((err) => {
            console.log('email update one', err.message);
          });
        }

        const timeline_data = {
          userId: user.id,
          type: 'opened_email',
          email_activity: activity.id,
        };

        triggerTimeline(timeline_data);

        /**
         * Notification
         */
        const _email = await Email.findOne({ _id: activity.emails }).catch(
          (err) => {
            console.log('email finding err', err);
          }
        );

        createNotification(
          'open_email',
          {
            criteria: 'open_email',
            contact,
            user,
            action: {
              object: 'email',
              email: activity.emails,
            },
            email_tracker: _email_tracker,
            email: _email,
          },
          user
        );
      }
    }
  }

  const contentType = mime.contentType(path.extname(TRAKER_PATH));
  res.set('Content-Type', contentType);
  res.sendFile(TRAKER_PATH);
};

const receiveEmailExtension = async (req, res) => {
  const activity = await ExtActivity.findOne({
    send_uuid: req.params.id,
  }).catch((err) => {
    console.log('activity finding err', err.message);
  });

  if (activity) {
    const user = await User.findOne({ _id: activity.user, del: false }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const opened = new Date();

    if (user) {
      const sent = new Date(activity.updated_at);
      const opened_gap = opened.getTime() - sent.getTime();

      if (opened_gap < 4000) {
        return;
      }

      let reopened = moment();
      reopened = reopened.subtract(1, 'hours');

      const old_activity = await ExtActivity.findOne({
        pair_activity: activity._id,
        created_at: { $gte: reopened },
      }).catch((err) => {
        console.log('err', err);
      });

      if (!old_activity) {
        const email_tracker = new ExtActivity({
          user: user._id,
          to_emails: activity.to_emails,
          type: 'email_trackers',
          content: 'opened email',
          pair_activity: activity._id,
          updated_at: opened,
          created_at: opened,
        });

        email_tracker.save().catch((err) => {
          console.log('email tracker err', err.message);
        });

        ExtActivity.updateOne(
          {
            _id: activity._id,
          },
          {
            $set: {
              pair_activity: email_tracker.id,
            },
          }
        ).catch((err) => {
          console.log('email update one', err.message);
        });

        let i = 1;
        const emailInterval = setInterval(function () {
          sendExtensionSocketSignal(user, 'updated_activity', {
            last_time: email_tracker.updated_at,
          });
          i++;
          if (i > 5) {
            clearInterval(emailInterval);
          }
        }, 1000);
      }
    }
  }

  const contentType = mime.contentType(path.extname(TRAKER_PATH));
  res.set('Content-Type', contentType);
  return res.sendFile(TRAKER_PATH);
};

const unSubscribePage = async (req, res) => {
  const activity = await Activity.findOne({ _id: req.query.activity }).catch(
    (err) => {
      console.log('activity finding err', err);
    }
  );
  const contact = await Contact.findOne({ _id: activity.contacts }).catch(
    (err) => {
      console.log('err', err);
    }
  );
  return res.render('unsubscribe', {
    unsubscribed: contact.unsubscribed.email,
  });
};

const unSubscribeEmail = async (req, res) => {
  const activity = await Activity.findOne({ _id: req.params.id }).catch(
    (err) => {
      console.log('activity finding err', err);
    }
  );

  let _activity;
  if (activity) {
    const user = await User.findOne({ _id: activity.user, del: false }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const contact = await Contact.findOne({ _id: activity.contacts }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const action = 'unsubscribed';

    if (user && contact) {
      const activity_type = activity.type;
      switch (activity_type) {
        case 'emails': {
          const email_tracker = new EmailTracker({
            user: user.id,
            contact: contact.id,
            email: activity.emails,
            type: 'unsubscribe',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          if (activity.campaign) {
            email_tracker.campaign = activity.campaign;
          }
          const _email_tracker = await email_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('email tracker save error', err.message);
            });

          _activity = new Activity({
            content: 'unsubscribed email',
            contacts: contact.id,
            user: user.id,
            type: 'email_trackers',
            emails: activity.emails,
            email_trackers: _email_tracker.id,
            created_at: new Date(),
            updated_at: new Date(),
          });
          break;
        }
        case 'videos': {
          const video_tracker = new VideoTracker({
            user: user.id,
            contact: contact.id,
            video: activity.videos,
            type: 'unsubscribe',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          if (activity.campaign) {
            video_tracker.campaign = activity.campaign;
          }
          const _video_tracker = await video_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('video track save error', err.message);
            });

          _activity = new Activity({
            content: 'unsubscribed video email',
            contacts: contact.id,
            user: user.id,
            type: 'video_trackers',
            videos: activity.videos,
            video_trackers: _video_tracker.id,
            created_at: new Date(),
            updated_at: new Date(),
          });
          break;
        }
        case 'pdfs': {
          const pdf_tracker = new PDFTracker({
            user: user.id,
            contact: contact.id,
            pdf: activity.pdfs,
            type: 'unsubscribe',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          if (activity.campaign) {
            pdf_tracker.campaign = activity.campaign;
          }
          const _pdf_tracker = await pdf_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('pdf track save error', err.message);
            });

          _activity = new Activity({
            content: 'unsubscribed pdf email',
            contacts: contact.id,
            user: user.id,
            type: 'pdf_trackers',
            pdfs: activity.pdfs,
            pdf_trackers: _pdf_tracker.id,
            created_at: new Date(),
            updated_at: new Date(),
          });
          break;
        }
        case 'images': {
          const image_tracker = new ImageTracker({
            user: user.id,
            contact: contact.id,
            image: activity.images,
            type: 'unsubscribe',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          if (activity.campaign) {
            image_tracker.campaign = activity.campaign;
          }
          const _image_tracker = await image_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('image track save error', err.message);
            });

          _activity = new Activity({
            content: 'unsubscribed image email',
            contacts: contact.id,
            user: user.id,
            type: 'image_trackers',
            images: activity.images,
            image_trackers: _image_tracker.id,
            created_at: new Date(),
            updated_at: new Date(),
          });
          break;
        }
        default:
          break;
      }
    }

    if (activity.campaign) {
      _activity.campaign = activity.campaign;
    }

    const last_activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });
    Contact.updateOne(
      { _id: contact.id },
      {
        $set: { last_activity: last_activity.id, 'unsubscribed.email': true },
      }
    ).catch((err) => {
      console.log('err', err);
    });
    // Unsubscribe Notification
    createNotification(
      'unsubscribe_email',
      {
        criteria: 'unsubscribe_email',
        user,
        contact,
      },
      user
    );
  }
  res.send('You successfully unsubscribed CRMGrow email');
};

const reSubscribeEmail = async (req, res) => {
  const activity = await Activity.findOne({ _id: req.params.id }).catch(
    (err) => {
      console.log('activity finding err', err.message);
    }
  );

  let _activity;
  if (activity) {
    const user = await User.findOne({ _id: activity.user }).catch((err) => {
      console.log('err', err.message);
    });

    const contact = await Contact.findOne({ _id: activity.contacts }).catch(
      (err) => {
        console.log('err', err.message);
      }
    );

    const action = 'resubscribed';

    if (user && contact) {
      const activity_type = activity.type;
      switch (activity_type) {
        case 'emails': {
          const email_tracker = new EmailTracker({
            user: user.id,
            contact: contact.id,
            email: activity.emails,
            type: 'resubscribe',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _email_tracker = await email_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('email tracker save error', err.message);
            });

          _activity = new Activity({
            content: 'resubscribed email',
            contacts: contact.id,
            user: user.id,
            type: 'email_trackers',
            emails: activity.emails,
            email_trackers: _email_tracker.id,
            created_at: new Date(),
            updated_at: new Date(),
          });
          break;
        }
        case 'videos': {
          const video_tracker = new VideoTracker({
            user: user.id,
            contact: contact.id,
            video: activity.videos,
            type: 'resubscribe',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _video_tracker = await video_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('video track save error', err.message);
            });

          _activity = new Activity({
            content: 'resubscribed video email',
            contacts: contact.id,
            user: user.id,
            type: 'video_trackers',
            videos: activity.videos,
            video_trackers: _video_tracker.id,
          });
          break;
        }
        case 'pdfs': {
          const pdf_tracker = new PDFTracker({
            user: user.id,
            contact: contact.id,
            pdf: activity.pdfs,
            type: 'resubscribe',
            activity: activity.id,
          });

          const _pdf_tracker = await pdf_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('pdf track save error', err.message);
            });

          _activity = new Activity({
            content: 'resubscribed pdf email',
            contacts: contact.id,
            user: user.id,
            type: 'pdf_trackers',
            pdfs: activity.pdfs,
            pdf_trackers: _pdf_tracker.id,
          });
          break;
        }
        case 'images': {
          const image_tracker = new ImageTracker({
            user: user.id,
            contact: contact.id,
            image: activity.images,
            type: 'resubscribe',
            activity: activity.id,
          });

          const _image_tracker = await image_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('image track save error', err.message);
            });

          _activity = new Activity({
            content: 'resubscribed image email',
            contacts: contact.id,
            user: user.id,
            type: 'image_trackers',
            images: activity.images,
            image_trackers: _image_tracker.id,
          });
          break;
        }
        default:
          break;
      }
    }

    const last_activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err.message);
      });
    Contact.updateOne(
      { _id: contact.id },
      {
        $set: { last_activity: last_activity.id, 'unsubscribed.email': false },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });

    // Notification
    createNotification(
      'resubscribe_email',
      {
        criteria: 'resubscribe_email',
        user,
        contact,
      },
      user
    );
  }
  res.send('You successfully resubscribed CRMGrow email');
};

const sharePlatform = async (req, res) => {
  const { currentUser } = req;
  const { contacts, content, subject } = req.body;

  const promise_array = [];
  const error = [];

  for (let i = 0; i < contacts.length; i++) {
    let email_content = content;
    let email_subject = subject;
    const _contact = contacts[i];
    let assignee;
    if (_contact.owner) {
      assignee = await User.findOne({
        _id: _contact.owner,
      });
    }
    const contactLabel = await getLabelName(_contact.label);
    const tokenData = {
      currentUser,
      contact: _contact,
      assignee,
      contactLabel,
    };
    email_subject = replaceToken(email_subject, tokenData);
    email_content = replaceToken(email_content, tokenData);
    const msg = {
      to_email: _contact.email,
      user_email: currentUser.email,
      user_name: currentUser.user_name,
      subject: email_subject,
      html: email_content + '<br/><br/>' + currentUser.email_signature,
      text: email_content,
    };

    const promise = new Promise((resolve, reject) => {
      sendSESEmail(msg)
        .then(() => {
          resolve();
        })
        .catch((err) => {
          console.log('ses email(%s) send err: %s', err);
          error.push({
            contact: {
              first_name: _contact.name,
              email: _contact.email,
            },
            err,
          });
          resolve();
        });
    });
    promise_array.push(promise);
  }
  Promise.all(promise_array)
    .then(() => {
      if (error.length > 0) {
        return res.status(405).json({
          status: false,
          error,
        });
      }
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('err', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const clickEmailLink = async (req, res) => {
  const { url, activity_id } = req.query;

  res.render('redirect', {
    url,
  });

  // eliminate http, https, ftp from url.
  const pattern = /^((http|https|ftp):\/\/)/;
  if (url) {
    const link = url.replace(pattern, '');
    const activity = await Activity.findOne({ _id: activity_id }).catch(
      (err) => {
        console.log('activity finding err', err.message);
      }
    );

    let _activity;
    if (activity) {
      const user = await User.findOne({ _id: activity.user, del: false }).catch(
        (err) => {
          console.log('user found err', err.message);
        }
      );

      const contact = await Contact.findOne({ _id: activity.contacts }).catch(
        (err) => {
          console.log('contact found err', err.message);
        }
      );

      if (user && contact) {
        if (user.link_track_enabled) {
          const email_tracker = new EmailTracker({
            user: user.id,
            contact: contact.id,
            email: activity.emails,
            type: 'click',
            link,
            activity: activity.id,
          });

          if (activity.campaign) {
            email_tracker.campaign = activity.campaign;
          }

          const _email_tracker = await email_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('email tracker save error', err.message);
            });

          _activity = new Activity({
            content: 'clicked the link on email',
            contacts: contact.id,
            user: user.id,
            type: 'email_trackers',
            emails: activity.emails,
            email_trackers: _email_tracker.id,
          });

          if (activity.campaign) {
            _activity.campaign = activity.campaign;
          }
          const last_activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('activity save err', err.message);
            });

          Contact.updateOne(
            { _id: contact.id },
            {
              $set: { last_activity: last_activity.id },
            }
          ).catch((err) => {
            console.log('contact update err', err.message);
          });

          // Notification disable code for now
          /**
           * 
          const _email = await Email.findOne({ _id: activity.emails }).catch(
            (err) => {
              console.log('err', err);
            }
          );
          createNotification(
            'click_link',
            {
              criteria: 'click_link',
              contact,
              user,
              action: {
                object: 'email',
                email: activity.emails,
              },
              email_tracker: _email_tracker,
              email: _email,
            },
            user
          );
           */
        }
      }
    }
  }
};

const watchGmail = async (req, res) => {
  const { message } = req.body;

  const data = base64url.decode(message.data);
  const { emailAddress, historyId } = JSON.parse(data);
  const currentUser = await User.findOne({ email: emailAddress, del: false });
  if (!currentUser) {
    console.log('****user not found****');
    return res.send({
      status: true,
      data: 'user not exist',
    });
  }
  await checkIdentityTokens(currentUser);
  const { googleClient } = getOauthClients(currentUser.source);
  const token = JSON.parse(currentUser.google_refresh_token);
  googleClient.setCredentials({ refresh_token: token.refresh_token });
  const gmail = google.gmail({ auth: googleClient, version: 'v1' });

  try {
    const historyList = await gmail.users.history
      .list({
        userId: 'me',
        startHistoryId: currentUser.email_watch.history_id,
        includeSpamTrash: true,
        historyTypes: ['messageAdded'],
      })
      .catch((error) => {
        console.log('history list get error: ', error.message);
        throw error;
      });
    const data = historyList?.data;
    if (!data?.history?.length) throw new Error('no history List');
    const history = data.history;
    for (let i = 0; i < history.length; i++) {
      const lastMessages = history[i]?.messages;
      if (!lastMessages?.length) continue;
      const messageId = lastMessages[0]?.id;
      if (!messageId) continue;
      const msg = await gmail.users.messages
        .get({
          userId: 'me',
          id: messageId,
        })
        .catch((error) => {
          console.log('message get error: ', error.message);
        });
      if (!msg?.data) continue;
      const data = msg.data;
      const content = data?.snippet;
      const headers = data?.payload?.headers;
      if (headers && Array.isArray(headers) && headers.length) {
        let contactEmail = '';
        let ccEmails = null;
        let subject = '';
        let date = null;
        const _from = headers.filter((h) => h.name === 'From');
        if (Array.isArray(_from) && _from.length) {
          contactEmail = abstractHeaderValue(_from[0]?.value);
        }
        const _cc = headers.filter((h) => h.name === 'CC');
        if (Array.isArray(_cc) && _cc.length) {
          ccEmails = abstractCC(_cc[0]?.value);
        }
        const _subject = headers.filter((_h) => _h.name === 'Subject');
        if (Array.isArray(_subject) && _subject.length) {
          subject = _subject[0]?.value;
        }
        const _date = headers.filter((h) => h.name === 'Date');
        if (Array.isArray(_date) && _date.length) {
          // 'Wed, 13 Sep 2023 02:33:16 -0700'
          date = moment(
            _date[0]?.value,
            'ddd, DD MMM YYYY hh:mm:ss z'
          ).toDate();
        }

        if (!contactEmail) continue;
        const contact = await Contact.findOne({
          email: contactEmail,
          user: currentUser._id,
        }).catch((err) => {
          console.log('contact search err', err.message);
        });
        if (contact) {
          const cc = [];
          if (Array.isArray(ccEmails) && ccEmails.length) {
            const ccContacts = await Contact.find({
              email: { $in: ccEmails },
            }).catch((err) => {
              console.log('cc search err', err.message);
            });
            if (Array.isArray(ccContacts) && ccContacts.length) {
              ccContacts.forEach((c) => {
                cc.push(c._id);
              });
            }
          }
          const email = new Email({
            user: currentUser.id,
            type: 1, // recv
            subject,
            content,
            cc,
            contacts: [contact._id],
            email_message_id: messageId,
          });

          await email.save().catch((err) => {
            console.log('new email save err', err.message);
          });

          const activity = new Activity({
            content: 'received email',
            contacts: contact.id,
            user: currentUser.id,
            emails: email._id,
            type: 'emails',
            created_at: date,
            updated_at: date,
          });

          const _activity = await activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          Contact.updateOne(
            { _id: contact.id },
            {
              $set: { last_activity: _activity.id },
            }
          ).catch((err) => {
            console.log('err', err);
          });

          await createNotification(
            'received_email',
            {
              criteria: 'received_email',
              user: currentUser,
              contact,
            },
            currentUser
          );
        }
      }
    }
  } catch (error) {
    console.log('****email watch error****', error.message);
    sendErrorToSentry(currentUser, error);
    return res.send({
      status: false,
    });
  }

  User.updateOne(
    { _id: currentUser._id, del: false },
    {
      $set: { 'email_watch.history_id': historyId },
    }
  ).catch((err) => {
    console.log('err', err.message);
  });
  return res.send({
    status: true,
  });
};

const getGmailAttachment = async (req, res) => {
  const { currentUser } = req;
  const { messageId, attachmentId } = req.body;
  const _res = await passGmailAttachment({
    userId: currentUser.id,
    messageId,
    attachmentId,
  });
  if (_res.status) {
    return res.send({
      status: true,
      data: { mimeData: _res.data },
    });
  }
  return res.status(500).json({
    status: false,
    error: _res.error,
  });
};

const getGmailMessage = async (req, res) => {
  const messageId = req.params.id;
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { googleClient } = getOauthClients(currentUser.source);
  if (!messageId) {
    console.log('invalid email message id');
    return res.status(400).json({
      status: false,
      error: 'invalid email message id',
    });
  }
  const token = JSON.parse(currentUser.google_refresh_token);
  googleClient.setCredentials({ refresh_token: token.refresh_token });
  const gmail = google.gmail({ auth: googleClient, version: 'v1' });
  const msg = await gmail.users.messages
    .get({
      userId: 'me',
      id: messageId,
    })
    .catch((error) => {
      console.log('email message get error: ', error.message);
      return res.status(500).json({
        status: false,
        error,
      });
    });
  if (!msg?.data) {
    console.log('invalid message data');
    return res.status(400).json({
      status: false,
      error: 'invalid email message data',
    });
  }
  const data = msg.data;
  const result = { emailContent: '', emailAttachments: [] };
  if (data?.payload?.body?.data) {
    result.emailContent = base64url.decode(data.payload.body.data);
  } else {
    const parts = data?.payload?.parts;
    if (parts?.length > 0) {
      await getGmailMessageFullContent({
        userId: currentUser.id,
        messageId,
        parts,
        result,
      });
    }
  }

  res.send({
    status: true,
    data: result,
  });
};

module.exports = {
  openTrack,
  receiveEmailSendGrid,
  receiveEmail,
  receiveEmailExtension,
  clickEmailLink,
  unSubscribeEmail,
  unSubscribePage,
  reSubscribeEmail,
  sharePlatform,
  watchGmail,
  getGmailMessage,
  getGmailAttachment,
};
