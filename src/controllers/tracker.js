const moment = require('moment-timezone');

const User = require('../models/user');
const Contact = require('../models/contact');
const Email = require('../models/email');
const Text = require('../models/text');
const PDFTracker = require('../models/pdf_tracker');
const PDF = require('../models/pdf');
const VideoTracker = require('../models/video_tracker');
const Video = require('../models/video');
const Image = require('../models/image');
const ImageTracker = require('../models/image_tracker');
const Activity = require('../models/activity');
const ExtActivity = require('../models/ext_activity');
const { triggerTimeline } = require('../services/time_line');
const Notification = require('../models/notification');
const { createNotification } = require('../helpers/notification');
const { outbound_constants } = require('../constants/variable');
const { sendExtensionSocketSignal } = require('../helpers/socket');
const {
  getWatchMaterialOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');

const createPDF = async (req, res) => {
  const { activity_id } = req.body;
  const { total_pages } = req.body;
  if (!activity_id) {
    return;
  }
  const sent_activity = await Activity.findOne({ _id: activity_id })
    .populate([
      { path: 'emails', select: 'has_shared' },
      { path: 'texts', select: 'has_shared' },
    ])
    .catch((err) => {
      console.log('send activity', err.message);
    });
  let queryContact = null;
  if (!sent_activity) {
    return;
  }
  if (sent_activity.contacts) {
    queryContact = sent_activity.contacts;
  }

  if (sent_activity) {
    const user_id = sent_activity.user;
    const contact_id = sent_activity.contacts;
    const pdf_id = sent_activity.pdfs;
    const user = await User.findOne({ _id: user_id });
    const pdf = await PDF.findOne({ _id: pdf_id });

    const params = {
      contactId: contact_id,
      material: {
        title: pdf.title,
        type: 'PDF',
        id: pdf._id,
        amount: total_pages,
      },
      create_at: new Date(),
    };

    await outboundCallhookApi(
      user_id,
      outbound_constants.WATCH_MATERIAL,
      getWatchMaterialOutboundData,
      params
    );

    if (queryContact) {
      const pdf_tracker = new PDFTracker({
        activity: activity_id,
        contact: contact_id,
        user: user_id,
        pdf: pdf_id,
        total_pages,
      });
      pdf_tracker.save().catch((err) => {
        console.log('pdf tracker save err', err.message);
      });
      if (sent_activity.send_type !== 2) {
        const contact = await Contact.findOne({ _id: contact_id });
        createNotification(
          'review_pdf',
          {
            criteria: 'material_track',
            user,
            contact,
            pdf,
            pdf_tracker,
            action: {
              object: 'pdf',
              pdf: [pdf.id],
            },
          },
          user
        );
        const timeline_data = {
          userId: user.id,
          type: 'material',
          material_activity: activity_id,
        };

        triggerTimeline(timeline_data);

        if (sent_activity.send_type === 1) {
          // create send video activity && tracker activity
          const sendActivity = new Activity({
            content: 'sent pdf using mobile',
            contacts: pdf_tracker.contact,
            user: pdf_tracker.user,
            type: 'pdfs',
            pdfs: pdf_tracker.pdf,
            texts: sent_activity.texts,
            send_uuid: sent_activity.send_uuid,
          });
          // Video Tracker activity update with the send activity
          sendActivity.save().then(() => {
            pdf_tracker.activity = sendActivity._id;
            pdf_tracker.save();
          });
        }

        const activity = new Activity({
          content: 'reviewed pdf',
          contacts: contact_id,
          user: user_id,
          type: 'pdf_trackers',
          pdf_trackers: pdf_tracker.id,
          pdfs: pdf.id,
        });

        activity
          .save()
          .then(async (_activity) => {
            // deal last activity check
            if (
              sent_activity &&
              sent_activity.emails &&
              sent_activity.emails.has_shared
            ) {
              Email.updateOne(
                {
                  _id: sent_activity.emails._id,
                },
                {
                  $set: {
                    pdf_tracker: pdf_tracker.id,
                  },
                  $unset: {
                    video_tracker: true,
                    image_tracker: true,
                    email_tracker: true,
                  },
                }
              ).catch((err) => {
                console.log('email update one', err.message);
              });

              const shared_email = await Email.findOne({
                _id: sent_activity.emails._id,
              });

              if (shared_email && shared_email.deal) {
                const timeline_data = {
                  userId: user_id,
                  type: 'material',
                  material_activity: activity_id,
                };

                triggerTimeline(timeline_data);
              }
            }

            if (
              sent_activity &&
              sent_activity.texts &&
              sent_activity.texts.has_shared
            ) {
              Text.updateOne(
                {
                  _id: sent_activity.texts._id,
                },
                {
                  $set: {
                    pdf_tracker: pdf_tracker.id,
                  },
                  $unset: {
                    video_tracker: true,
                    image_tracker: true,
                    email_tracker: true,
                  },
                }
              ).catch((err) => {
                console.log('email update one', err.message);
              });

              const shared_text = await Email.findOne({
                _id: sent_activity.texts._id,
              });

              if (shared_text && shared_text.deal) {
                const timeline_data = {
                  userId: user_id,
                  type: 'material',
                  material_activity: activity_id,
                };

                triggerTimeline(timeline_data);
              }
            }

            if (contact_id) {
              Contact.updateOne(
                { _id: contact_id },
                {
                  $set: { last_activity: _activity.id },
                }
              ).catch((err) => {
                console.log('err', err.message);
              });
            }
          })
          .catch((err) => {
            console.log('err', err.message);
          });
        Activity.updateOne(
          {
            _id: activity_id,
          },
          {
            $set: {
              pdf_trackers: pdf_tracker.id,
            },
            $unset: {
              email_trackers: true,
              video_trackers: true,
              image_trackers: true,
            },
          }
        ).catch((err) => {
          console.log('email update one', err.message);
        });

        let i = 1;
        const pdfInterval = setInterval(function () {
          sendExtensionSocketSignal(user, 'updated_activity', {
            last_time: pdf_tracker.updated_at,
          });
          i++;
          if (i > 5) {
            clearInterval(pdfInterval);
          }
        }, 1000);

        // ========================= Notifications for web push, email, text =========================

        // ========================= Auto Follow up (2nd case) removing logic ========================
      } else {
        /**
        www.ioObject
          .of('/extension')
          .to(user._id)
          .emit('pdf_tracked', {
            data: {
              content: 'reviewed pdf',
              title: pdf.title,
              preview: pdf.preview,
              contact: sent_activity.to_emails,
              watched_date: pdf_tracker.updated_at,
              _id: sent_activity.send_uuid,
            },
          });
        */
        Activity.updateOne(
          {
            _id: activity_id,
          },
          {
            $set: {
              pdf_trackers: pdf_tracker.id,
            },
            $unset: {
              email_trackers: true,
              video_trackers: true,
              image_trackers: true,
            },
          }
        ).catch((err) => {
          console.log('email update one', err.message);
        });

        let i = 1;
        const pdfInterval = setInterval(function () {
          sendExtensionSocketSignal(user, 'updated_activity', {
            last_time: pdf_tracker.updated_at,
          });
          i++;
          if (i > 5) {
            clearInterval(pdfInterval);
          }
        }, 1000);
      }
      return res.send({
        status: true,
        data: pdf_tracker.id,
      });
    } else {
      const pdf_tracker = new PDFTracker({
        activity: activity_id,
        user: user_id,
        pdf: pdf_id,
        total_pages,
      });
      pdf_tracker.save().catch((err) => {
        console.log('pdf tracker save err', err.message);
      });
      createNotification(
        'review_pdf',
        {
          criteria: 'material_track',
          user,
          pdf,
          pdf_tracker,
          activity: activity_id,
          action: {
            object: 'pdf',
            pdf: [pdf.id],
          },
        },
        user
      );
      let i = 1;
      const pdfInterval = setInterval(function () {
        sendExtensionSocketSignal(user, 'updated_activity', {
          last_time: pdf_tracker.updated_at,
        });
        i++;
        if (i > 5) {
          clearInterval(pdfInterval);
        }
      }, 1000);
      return res.send({
        status: true,
        data: pdf_tracker.id,
      });
    }
  } else {
    return res.send({
      status: false,
    });
  }
};

const extensionCreatePDF = async (req, res) => {
  const { activity_id } = req.body;
  const { total_pages } = req.body;
  const sent_activity = await ExtActivity.findOne({ _id: activity_id })
    .populate([{ path: 'emails', select: 'has_shared shared_email' }])
    .catch((err) => {
      console.log('send activity', err.message);
    });
  if (sent_activity) {
    const user_id = sent_activity.user;
    const pdf_id = sent_activity.pdfs;
    const user = await User.findOne({ _id: user_id });
    const pdf_tracker = new ExtActivity({
      type: 'pdf_trackers',
      content: 'reviewed pdf',
      user: user_id,
      pair_activity: activity_id,
      pdfs: [pdf_id],
      tracker: {
        total_pages,
      },
    });
    pdf_tracker.save().catch((err) => {
      console.log('pdf tracker save err', err.message);
    });
    ExtActivity.updateOne(
      {
        _id: activity_id,
      },
      {
        $set: {
          pair_activity: pdf_tracker.id,
        },
      }
    ).catch((err) => {
      console.log('email update one', err.message);
    });
    let i = 1;
    const pdfInterval = setInterval(function () {
      sendExtensionSocketSignal(user, 'updated_activity', {
        last_time: pdf_tracker.updated_at,
      });
      i++;
      if (i > 5) {
        clearInterval(pdfInterval);
      }
    }, 1000);
    return res.send({
      status: true,
      data: pdf_tracker.id,
    });
  } else {
    return res.send({
      status: false,
    });
  }
};

const updatePDF = async (req, res) => {
  PDFTracker.updateOne(
    { _id: req.params.id },
    {
      $set: { ...req.body },
    }
  ).catch((err) => {
    console.log('update pdf track err', err.message);
  });

  return res.send({
    status: true,
  });
};

const extensionUpdatePDF = async (req, res) => {
  ExtActivity.updateOne(
    { _id: req.params.id },
    {
      $set: { tracker: req.body },
    }
  ).catch((err) => {
    console.log('update pdf track err', err.message);
  });

  return res.send({
    status: true,
  });
};

const createVideo = async (data) => {
  const video_tracker = new VideoTracker({
    ...data,
  });
  video_tracker.save().then(() => {
    let contact = null;
    if (video_tracker.contact && video_tracker.contact.length) {
      contact = video_tracker.contact;
    }

    Activity.findOne({
      _id: data.activity,
    })
      .then((send_activity) => {
        if (send_activity.send_type !== 2) {
          if (send_activity.send_type === 1) {
            // create send video activity && tracker activity
            const sendActivity = new Activity({
              content: 'sent video using mobile',
              contacts: contact,
              user: video_tracker.user,
              type: 'videos',
              videos: video_tracker.video,
              texts: send_activity.texts,
              send_uuid: send_activity.send_uuid,
            });
            // Video Tracker activity update with the send activity
            sendActivity.save().then(() => {
              video_tracker.activity = sendActivity._id;
              video_tracker.save();
            });
          }
          const activity = new Activity({
            content: 'watched video',
            contacts: contact,
            user: video_tracker.user,
            type: 'video_trackers',
            video_trackers: video_tracker._id,
            videos: video_tracker.video,
          });
          const trackerId = video_tracker._id;
          if (send_activity && send_activity.campaign) {
            VideoTracker.updateOne(
              { _id: trackerId },
              { $set: { campaign: send_activity.campaign } }
            ).catch(() => {});
            activity.campaign = send_activity.campaign;
          }
          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });
        }
      })
      .catch((err) => {
        console.log('send video activity finding is failed', err.message);
      });
  });
  return video_tracker;
};

/**
 * Get the watched duration and video duration as format
 * @param {*} ms: duration (watched ms)
 * @param {*} duration: video duration (ms)
 * @returns
 */
const convertMs2Time = (ms, duration) => {
  const h = Math.floor(ms / 3600000);
  const s = Math.floor(ms % 3600000);
  let msStr = moment(s).format('mm:ss');
  if (h) {
    msStr = (h + '').padStart(2, '0') + ':' + msStr;
  }
  const watched_time = msStr;

  const tH = Math.floor(duration / 3600000);
  const tS = Math.floor(duration % 3600000);
  let total_time = moment(tS).format('mm:ss');
  if (tH) {
    total_time = (tH + '').padStart(2, '0') + ':' + total_time;
  }

  return {
    watched_time,
    total_time,
  };
};

/**
 * Update the deal related data with tracker, trigger deal automation
 * Direct SMS sending could not pass this function.
 * @param {*} sent_activity: Email or Text Send activity Object
 * @param {*} tracker: Video Tracker Object
 * @param {*} percent: Watched Percentage
 */
const handleDealAction = async (sent_activity, tracker, percent) => {
  if (
    sent_activity &&
    sent_activity.emails &&
    sent_activity.emails.has_shared
  ) {
    Email.updateOne(
      {
        _id: sent_activity.emails._id,
      },
      {
        $set: {
          video_tracker: tracker.id,
        },
        $unset: {
          pdf_tracker: true,
          image_tracker: true,
          email_tracker: true,
        },
      }
    ).catch((err) => {
      console.log('email update one', err.message);
    });

    const shared_email = await Email.findOne({
      _id: sent_activity.emails._id,
    });

    if (shared_email && shared_email.deal) {
      const timeline_data = {
        userId: shared_email.user,
        type: 'material',
        percent,
        material_activity: sent_activity._id,
      };

      triggerTimeline(timeline_data);
    }
  }

  if (
    sent_activity &&
    sent_activity.emails &&
    sent_activity.emails.has_shared
  ) {
    Email.updateOne(
      {
        _id: sent_activity.emails._id,
      },
      {
        $set: {
          video_tracker: tracker.id,
        },
        $unset: {
          pdf_tracker: true,
          image_tracker: true,
          email_tracker: true,
        },
      }
    ).catch((err) => {
      console.log('email update one', err.message);
    });

    const shared_email = await Email.findOne({
      _id: sent_activity.emails._id,
    });

    if (shared_email && shared_email.deal) {
      const timeline_data = {
        userId: shared_email.user,
        type: 'material',
        percent,
        material_activity: sent_activity._id,
      };

      triggerTimeline(timeline_data);
    }
  }
};

const getElementFromData = (data) => {
  if (!data) {
    return;
  }
  if (data instanceof Array) {
    return data[0];
  } else {
    return data;
  }
};

const disconnectVideo = async (video_tracker_id, isEnd = false) => {
  const query = await VideoTracker.findOne({ _id: video_tracker_id });
  const currentUser = await User.findOne({ _id: query['user'], del: false });
  const video = await Video.findOne({ _id: query['video'] });

  if (!query) {
    return;
  }

  const contactId = getElementFromData(query.contact);
  const activityId = getElementFromData(query.activity);
  const watchedDuration = query.duration;
  const videoDuration = video.duration || 100000000;
  const percent = (watchedDuration / videoDuration) * 100;
  const lastWatchedAt = query.material_last || 0;
  let fullWatched = false;
  if (percent > 98) {
    fullWatched = true;
  }

  const params = {
    contactId,
    material: {
      title: video.title,
      type: 'VIDEO',
      id: video._id,
      amount: percent,
    },
    create_at: new Date(),
  };

  await outboundCallhookApi(
    currentUser.id,
    outbound_constants.WATCH_MATERIAL,
    getWatchMaterialOutboundData,
    params
  );
  Activity.updateOne(
    {
      _id: activityId,
    },
    {
      $set: {
        material_last: lastWatchedAt,
        full_watched: fullWatched,
      },
    },
    {
      timestamps: false,
    }
  ).catch((err) => {
    console.log('activty material last update err', err.message);
  });

  const sent_activity = await Activity.findOne({ _id: activityId })
    .populate([
      { path: 'emails', select: 'has_shared' },
      { path: 'texts', select: 'has_shared' },
    ])
    .catch((err) => {
      console.log('send activity', err.message);
    });

  if (!currentUser || !sent_activity) {
    return;
  }

  if (sent_activity.send_type !== 2) {
    // If contact exists for tracking (means email/text tracking, )
    if (contactId) {
      Activity.findOne({ video_trackers: query.id })
        .then(async (_activity) => {
          // If this is deal send activity, deal timeline handle check
          handleDealAction(sent_activity, query, percent);
          // Update the contact last activity with tracker activity
          Contact.updateOne(
            { _id: contactId },
            { $set: { last_activity: _activity._id } }
          ).catch((err) => {
            console.log('err', err.message);
          });
        })
        .catch((err) => {
          console.log('watched acitvity save err', err.message);
        });
      // Contact automation timeline trigger
      const timeline_data = {
        userId: currentUser.id,
        type: 'material',
        percent,
        material_activity: activityId,
      };
      triggerTimeline(timeline_data);
    }
    // send notification
    const notificationAction = {
      object: 'video',
      video: [video.id],
    };
    if (isEnd) {
      notificationAction.isEnd = true;
    }
    const _notificationData = {};
    if (!contactId) {
      _notificationData['activity'] = activityId;
    } else {
      const contact = await Contact.findOne({ _id: contactId });
      _notificationData['contact'] = contact;
    }
    const { watched_time, total_time } = convertMs2Time(
      watchedDuration,
      videoDuration
    );
    // await Notification.deleteMany({ video_tracker: query.id });
    // const currentCount = await Activity.countDocuments({
    //   video_trackers: query.id,
    // }).catch((err) => {
    //   console.log('activity remove err', err.message);
    // });
    const lastTrackedTime = new Date(Date.now() - (videoDuration || 600000));
    const lastTracker = await VideoTracker.findOne({
      user: currentUser._id,
      video: video._id,
      activity: query.activity,
      updated_at: { $gte: lastTrackedTime },
      _id: { $ne: query._id },
    });
    const trackerUpdateData = {
      disconnected_at: new Date(),
      full_watched: fullWatched,
    };
    let shouldSendNotification = false;
    if (!lastTracker && !query.disconnected_at) {
      // First Tracking Notification
      shouldSendNotification = true;
    } else if (!query.full_watched && fullWatched) {
      // First Full Watch Notification
      shouldSendNotification = true;
    }
    if (shouldSendNotification) {
      await Notification.deleteMany({ video_tracker: query.id });
      createNotification(
        'watch_video',
        {
          criteria: 'material_track',
          user: currentUser,
          action: notificationAction,
          video_tracker: query,
          detail: {
            ...query._doc,
            watched_time,
            total_time,
          },
          video,
          ..._notificationData,
        },
        currentUser
      );
      trackerUpdateData['notified'] = true;
    }
    await VideoTracker.updateOne(
      { _id: query._id },
      { $set: trackerUpdateData }
    ).catch(() => {});
  } else {
    Activity.updateOne(
      {
        _id: activityId,
      },
      {
        $set: {
          video_trackers: query.id,
        },
        $unset: {
          email_trackers: true,
          pdf_trackers: true,
          image_trackers: true,
        },
      }
    ).catch((err) => {
      console.log('email update one', err.message);
    });

    // Extension tracking
    let i = 1;
    const videoInterval = setInterval(function () {
      sendExtensionSocketSignal(currentUser, 'updated_activity', {
        last_time: query.updated_at,
      });
      i++;
      if (i > 5) {
        clearInterval(videoInterval);
      }
    }, 1000);
  }
};

const disconnectExtensionVideo = async (video_tracker_id, isEnd = false) => {
  const query = await ExtActivity.findOne({ _id: video_tracker_id });
  const currentUser = await User.findOne({ _id: query['user'], del: false });
  const video = await Video.findOne({ _id: query['videos'][0] });

  let full_watched;
  if (query.material_last * 1000 > video.duration - 10000) {
    full_watched = true;
  }

  if (query.material_last) {
    ExtActivity.updateOne(
      {
        _id: query.id,
      },
      {
        $set: {
          tracker: {
            material_last: query.material_last,
            full_watched,
          },
        },
      },
      {
        timestamps: false,
      }
    ).catch((err) => {
      console.log('activty material last update err', err.message);
    });
  }

  if (currentUser) {
    // Extension tracking
    let i = 1;
    const videoInterval = setInterval(function () {
      sendExtensionSocketSignal(currentUser, 'updated_activity', {
        last_time: query.updated_at,
      });
      i++;
      if (i > 5) {
        clearInterval(videoInterval);
      }
    }, 1000);
  }
};

const updateVideo = async (
  video_tracker_id,
  duration,
  material_last,
  start,
  end,
  gap
) => {
  const gapData = {};
  if (gap && gap.length) {
    gapData['gap'] = gap;
  }
  await VideoTracker.updateOne(
    { _id: video_tracker_id },
    {
      $set: {
        duration,
        material_last,
        start,
        end,
        ...gapData,
      },
    }
  );
};

const updateExtensionVideo = async (
  video_tracker_id,
  duration,
  material_last,
  start,
  end,
  gap
) => {
  const gapData = {};
  if (gap && gap.length) {
    gapData['gap'] = gap;
  }
  await ExtActivity.updateOne(
    { _id: video_tracker_id },
    {
      $set: {
        tracker: {
          duration,
          material_last,
          start,
          end,
          ...gapData,
        },
      },
    }
  );
};

const createImage = async (req, res) => {
  const { activity_id } = req.body;

  const sent_activity = await Activity.findOne({ _id: activity_id }).populate([
    { path: 'emails', select: 'has_shared' },
    { path: 'texts', select: 'has_shared' },
  ]);
  if (sent_activity) {
    const user_id = sent_activity.user;
    let contact_id = null;
    if (sent_activity.contacts) {
      contact_id = sent_activity.contacts;
    }

    const image_id = sent_activity.images;

    const image_tracker = new ImageTracker({
      activity: activity_id,
      contact: contact_id,
      user: user_id,
      image: image_id,
    });

    image_tracker.save().catch((err) => {
      console.log('image tracker save err', err.message);
    });
    const user = await User.findOne({ _id: user_id });
    const image = await Image.findOne({ _id: image_id });

    if (sent_activity.send_type !== 2) {
      let contact;
      if (contact_id) {
        contact = await Contact.findOne({ _id: contact_id });
        createNotification(
          'review_image',
          {
            criteria: 'material_track',
            user,
            image,
            contact,
            image_tracker,
            action: {
              object: 'image',
              image: [image.id],
            },
          },
          user
        );
      } else {
        createNotification(
          'review_image',
          {
            criteria: 'material_track',
            user,
            image,
            activity: activity_id,
            image_tracker,
            action: {
              object: 'image',
              image: [image.id],
            },
          },
          user
        );
      }
      // ======================== Web Push, Email, Text notification ==================
      // ======================== Auto Follow, Auto Send (2nd case) remove logic ==================

      // automation
      const timeline_data = {
        userId: user.id,
        type: 'material',
        material_activity: activity_id,
      };

      triggerTimeline(timeline_data);

      if (sent_activity.send_type === 1) {
        // create send video activity && tracker activity
        const sendActivity = new Activity({
          content: 'sent image using mobile',
          contacts: image_tracker.contact,
          user: image_tracker.user,
          type: 'images',
          pdfs: image_tracker.pdf,
          texts: sent_activity.texts,
          send_uuid: sent_activity.send_uuid,
        });
        // Video Tracker activity update with the send activity
        sendActivity.save().then(() => {
          image_tracker.activity = sendActivity._id;
          image_tracker.save();
        });
      }

      const activity = new Activity({
        content: 'reviewed image',
        contacts: contact_id,
        user: user_id,
        type: 'image_trackers',
        image_trackers: image_tracker.id,
        images: image.id,
      });

      activity
        .save()
        .then(async (_activity) => {
          // Deal shared tracker
          if (
            sent_activity &&
            sent_activity.emails &&
            sent_activity.emails.has_shared
          ) {
            Email.updateOne(
              {
                _id: sent_activity.emails._id,
              },
              {
                $set: {
                  image_tracker: image_tracker.id,
                },
                $unset: {
                  video_tracker: true,
                  pdf_tracker: true,
                  email_tracker: true,
                },
              }
            ).catch((err) => {
              console.log('email update one', err.message);
            });

            const shared_email = await Email.findOne({
              _id: sent_activity.emails._id,
            });

            if (shared_email && shared_email.deal) {
              const timeline_data = {
                userId: user.id,
                type: 'material',
                material_activity: activity_id,
              };

              triggerTimeline(timeline_data);
            }
          }

          if (
            sent_activity &&
            sent_activity.texts &&
            sent_activity.texts.has_shared
          ) {
            Text.updateOne(
              {
                _id: sent_activity.texts._id,
              },
              {
                $set: {
                  image_tracker: image_tracker.id,
                },
                $unset: {
                  video_tracker: true,
                  pdf_tracker: true,
                  email_tracker: true,
                },
              }
            ).catch((err) => {
              console.log('email update one', err.message);
            });

            const shared_text = await Email.findOne({
              _id: sent_activity.texts._id,
            });

            if (shared_text && shared_text.deal) {
              const timeline_data = {
                userId: user.id,
                type: 'material',
                material_activity: activity_id,
              };

              triggerTimeline(timeline_data);
            }
          }

          if (contact_id) {
            Contact.updateOne(
              { _id: contact_id },
              {
                $set: { last_activity: _activity.id },
              }
            ).catch((err) => {
              console.log('err', err.message);
            });
          }
        })
        .catch((err) => {
          console.log('activity save err', err.message);
        });
    } else {
      /**
      www.ioObject
        .of('/extension')
        .to(user._id)
        .emit('image_tracked', {
          data: {
            content: 'reviewed image',
            title: image.title,
            preview: image.preview,
            contact: sent_activity.to_emails,
            watched_date: image_tracker.updated_at,
            _id: sent_activity.send_uuid,
          },
        });
      */

      Activity.updateOne(
        {
          _id: activity_id,
        },
        {
          $set: {
            image_trackers: image_tracker.id,
          },
          $unset: {
            video_trackers: true,
            pdf_trackers: true,
            email_trackers: true,
          },
        }
      ).catch((err) => {
        console.log('email update one', err.message);
      });

      let i = 1;
      const imageInterval = setInterval(function () {
        sendExtensionSocketSignal(user, 'updated_activity', {
          last_time: image_tracker.updated_at,
        });
        i++;
        if (i > 5) {
          clearInterval(imageInterval);
        }
      }, 1000);
    }

    const params = {
      contactId: contact_id,
      material: {
        title: image.title,
        type: 'IMAGE',
        id: image._id,
        amount: 1,
      },
      create_at: new Date(),
    };

    await outboundCallhookApi(
      user_id,
      outbound_constants.WATCH_MATERIAL,
      getWatchMaterialOutboundData,
      params
    );
    return res.send({
      status: true,
      data: image_tracker.id,
    });
  } else {
    return res.send({
      status: false,
    });
  }
};

const extensionCreateImage = async (req, res) => {
  const { activity_id } = req.body;
  const sent_activity = await ExtActivity.findOne({
    _id: activity_id,
  }).populate([{ path: 'emails', select: 'has_shared shared_email' }]);
  if (sent_activity) {
    const user_id = sent_activity.user;
    const image_id = sent_activity.images;

    const image_tracker = new ExtActivity({
      type: 'image_trackers',
      content: 'reviewed image',
      pair_activity: activity_id,
      user: user_id,
      images: [image_id],
    });

    image_tracker.save().catch((err) => {
      console.log('image tracker save err', err.message);
    });
    const user = await User.findOne({ _id: user_id });

    ExtActivity.updateOne(
      {
        _id: activity_id,
      },
      {
        $set: {
          pair_activity: image_tracker.id,
        },
      }
    ).catch((err) => {
      console.log('email update one', err.message);
    });

    let i = 1;
    const imageInterval = setInterval(function () {
      // eslint-disable-next-line no-undef
      io.of('/extension').to(user._id).emit('updated_activity', {
        last_time: image_tracker.updated_at,
      });
      i++;
      if (i > 5) {
        clearInterval(imageInterval);
      }
    }, 1000);

    return res.send({
      status: true,
      data: image_tracker.id,
    });
  } else {
    return res.send({
      status: false,
    });
  }
};

const setupTracking = (io) => {
  console.info('Setup Socket.io:');
  io.sockets.on('connection', (socket) => {
    socket.emit('connected');

    // socket.on('init_pdf', (data) => {
    //   createPDF(data).then((_pdf_tracker) => {
    //     socket.type = 'pdf';
    //     socket.pdf_tracker = _pdf_tracker;
    //   });
    // });

    // socket.on('update_pdf', (duration) => {
    //   const pdf_tracker = socket.pdf_tracker;
    //   if (typeof pdf_tracker !== 'undefined') {
    //     updatePDF(duration, pdf_tracker._id).catch((err) => {
    //       console.log('err', err);
    //     });
    //   }
    // });

    socket.on('init_video', (data) => {
      createVideo(data).then((_video_tracker) => {
        socket.type = 'video';
        socket.video_tracker = _video_tracker;
        socket.emit('inited_video', { _id: _video_tracker._id });
      });
    });

    socket.on('extension_init_video', (data) => {
      const video_tracker = new ExtActivity({
        type: 'video_trackers',
        content: 'watched video',
        user: data.user,
        pair_activity: data.activity,
        videos: [data.video],
        tracker: {
          duration: data.duration,
          material_last: data.material_last,
        },
      });
      video_tracker.save().then(() => {
        ExtActivity.updateOne(
          {
            _id: data.activity,
          },
          {
            $set: {
              pair_activity: video_tracker.id,
            },
          }
        ).catch((err) => {
          console.log('email update one', err.message);
        });
      });
      socket.type = 'extension_video';
      socket.video_tracker = video_tracker;
      socket.emit('inited_video', { _id: video_tracker._id });
    });

    socket.on('update_video', (data) => {
      const video_tracker = socket.video_tracker;
      if (video_tracker) {
        const { duration, material_last, start, end, gap } = data;
        updateVideo(video_tracker._id, duration, material_last, start, end, gap)
          .then(() => {})
          .catch((err) => {
            console.log('video update err', err.message);
          });
      } else {
        const { duration, material_last, tracker_id, start, end, gap } = data;
        if (tracker_id && tracker_id !== '') {
          updateVideo(tracker_id, duration, material_last, start, end, gap)
            .then(() => {
              VideoTracker.findOne({ _id: tracker_id }).then((tracker) => {
                if (tracker) {
                  socket.type = 'video';
                  socket.video_tracker = tracker;
                } else {
                  socket.attempt_count = (socket.attempt_count || 0) + 1;
                  // Inspect the data
                  if (socket.attempt_count >= 10) {
                    socket.disconnect();
                  }
                }
              });
            })
            .catch((err) => {
              console.log('update track err', err.message);
            });
        }
      }
    });

    socket.on('extension_update_video', (data) => {
      const video_tracker = socket.video_tracker;
      if (video_tracker) {
        const { duration, material_last, start, end, gap } = data;
        updateExtensionVideo(
          video_tracker._id,
          duration,
          material_last,
          start,
          end,
          gap
        )
          .then(() => {})
          .catch((err) => {
            console.log('video update err', err.message);
          });
      } else {
        const { duration, material_last, tracker_id, start, end, gap } = data;
        if (tracker_id && tracker_id !== '') {
          updateExtensionVideo(
            tracker_id,
            duration,
            material_last,
            start,
            end,
            gap
          )
            .then(() => {
              ExtActivity.findOne({ _id: tracker_id }).then((tracker) => {
                if (tracker) {
                  socket.type = 'extension_video';
                  socket.video_tracker = tracker;
                } else {
                  socket.attempt_count = (socket.attempt_count || 0) + 1;
                  // Inspect the data
                  if (socket.attempt_count >= 10) {
                    socket.disconnect();
                  }
                }
              });
            })
            .catch((err) => {
              console.log('update track err', err.message);
            });
        }
      }
    });

    /**
    socket.on('init_image', (data) => {
      createImage(data).then((_image_tracker) => {
        socket.type = 'image';
        socket.image_tracker = _image_tracker;
      });
    });

    socket.on('update_image', (duration) => {
      const image_tracker = socket.image_tracker;
      if (typeof image_tracker !== 'undefined') {
        updateImage(duration, image_tracker._id)
          .then(() => {})
          .catch((err) => {
            console.log('err', err);
          });
      }
    });
    */

    socket.on('disconnect', () => {
      if (socket.type === 'pdf') {
        console.log('PDF_disconnecting');
        const pdf_tracker = socket.pdf_tracker;
        if (!socket.pdf_tracker.viewed) {
          console.log('PDF disconnected');
          // disconnectPDF(pdf_tracker._id);
        }
      } else if (socket.type === 'video') {
        const video_tracker = socket.video_tracker;
        if (!socket.video_tracker.viewed) {
          console.log('disconnected');
          disconnectVideo(video_tracker._id);
        }
      } else if (socket.type === 'image') {
        console.log('image_disconnecting');
        const image_tracker = socket.image_tracker;
        if (!socket.image_tracker.viewed) {
          console.log('disconnected', image_tracker);
          // disconnectImage(image_tracker._id);
        }
      } else if (socket.type === 'extension_video') {
        const video_tracker = socket.video_tracker;
        if (!socket.video_tracker.viewed) {
          disconnectExtensionVideo(video_tracker._id);
        }
      }
    });

    socket.on('close', (data) => {
      if (socket.type === 'pdf') {
        const pdf_tracker = socket.pdf_tracker;
        socket.pdf_tracker.viewed = true;
        // disconnectPDF(pdf_tracker._id);
      } else if (socket.type === 'video') {
        console.log('close', JSON.stringify(data));
        const video_tracker = socket.video_tracker;
        if (data.mode === 'end_reached') {
          disconnectVideo(video_tracker._id, true);
        }
        if (data.mode === 'full_watched') {
          socket.video_tracker.viewed = true;
          disconnectVideo(video_tracker._id);
        }
      } else if (socket.type === 'image') {
        console.log('disconnectiong with full view');
        const image_tracker = socket.image_tracker;
        socket.image_tracker.viewed = true;
        // disconnectImage(image_tracker._id);
      }
    });

    socket.on('extension_close', (data) => {
      if (socket.type === 'extension_video') {
        const video_tracker = socket.video_tracker;
        if (data.mode === 'end_reached') {
          disconnectExtensionVideo(video_tracker._id, true);
          return;
        }
        if (data.mode === 'full_watched') {
          socket.video_tracker.viewed = true;
        }
        disconnectExtensionVideo(video_tracker._id);
      }
    });
    // auth(socket)
  });
};

module.exports = {
  setupTracking,
  createPDF,
  extensionCreatePDF,
  updatePDF,
  extensionUpdatePDF,
  createImage,
  extensionCreateImage,
};
