const moment = require('moment-timezone');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../models/user');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Folder = require('../models/folder');
const Team = require('../models/team');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const Text = require('../models/text');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const Garbage = require('../models/garbage');
const Task = require('../models/task');
const Automation = require('../models/automation');
const EmailTemplate = require('../models/email_template');
const Notification = require('../models/notification');
const EmailHelper = require('../helpers/email');
const TextHelper = require('../helpers/text');
const garbageHelper = require('../helpers/garbage');
const { giveRateContacts } = require('../helpers/contact');
const system_settings = require('../configs/system_settings');
const { PACKAGE } = require('../constants/package');
const urls = require('../constants/urls');
const { SegmentedMessage } = require('sms-segments-calculator');
const { v1: uuidv1 } = require('uuid');
const _ = require('lodash');

const {
  getAllFolders,
  getPrevFolder,
  getParentFolder,
} = require('../helpers/folder');
const { removeFile } = require('../helpers/fileUpload');
const { emptyBucket } = require('../helpers/material');
const {
  getSendMaterialOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');
const { outbound_constants } = require('../constants/variable');
const { sendErrorToSentry } = require('../helpers/utility');
const { sendNotificationEmail } = require('../helpers/notification');
const { bulkAssign } = require('../helpers/task');
const { checkIdentityTokens } = require('../helpers/user');

const TrackerModels = {
  video: VideoTracker,
  pdf: PDFTracker,
  image: ImageTracker,
};

const MaterialModels = {
  video: Video,
  pdf: PDF,
  image: Image,
};

const bulkEmail = async (req, res) => {
  const { currentUser, mode } = req;
  const {
    contacts: inputContacts,
    video_ids,
    pdf_ids,
    image_ids,
    page_ids,
    content,
    subject,
    cc,
    bcc,
    attachments,
    sender,
    source,
    timeline_id,
    toEmails,
  } = req.body;
  const CHUNK_COUNT = 20;
  const MIN_CHUNK = 15;
  await checkIdentityTokens(currentUser);
  const max_email_count =
    currentUser['email_info']['max_count'] ||
    system_settings.EMAIL_DAILY_LIMIT.BASIC;

  if (!currentUser.primary_connected) {
    return res.status(406).json({
      status: false,
      error: 'no connected',
    });
  }

  if (inputContacts.length > max_email_count) {
    return res.status(400).json({
      status: false,
      error: 'Email max limited',
    });
  }
  let due_date;
  let contacts = [...inputContacts];
  let contactNumOnQueue;
  const taskProcessId =
    mode === 'automation' ? timeline_id : new Date().getTime() + uuidv1();
  // we do not the chunk operation if user connected stmp for a primary sender or send email to a single contacts from app page
  // for manual send from app ( bulk select contacts and send email, send email on a single contact dtail page), source field will be undefined.
  if (
    currentUser.connected_email_type !== 'smtp' &&
    (source || (!source && contacts.length > 1))
  ) {
    const action_content = {
      video_ids,
      pdf_ids,
      image_ids,
      page_ids,
      content,
      subject,
      cc,
      bcc,
      attachments,
      sender,
    };
    const payload = {
      currentUser,
      inputContacts,
      source,
      taskProcessId,
      CHUNK_COUNT,
      MIN_CHUNK,
      action_content,
    };
    const {
      contacts: _contacts,
      contactNumOnQueue: _contactNumOnQueue,
      due_date: _due_date,
    } = await bulkAssign(payload).catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
    contacts = _contacts;
    contactNumOnQueue = _contactNumOnQueue;
    due_date = _due_date;
  }

  // TODO: Update the Response if temp contacts exist.
  if (contacts.length) {
    const email_data = {
      user: currentUser._id,
      contacts,
      video_ids,
      pdf_ids,
      image_ids,
      page_ids,
      content,
      subject,
      cc,
      bcc,
      attachments,
      mode,
      // shared_email,
      // has_shared,
      is_guest: req.guest_loggin,
      guest: req.guest,
      sender,
      toEmails,
    };

    EmailHelper.sendEmail(email_data)
      .then(async (result) => {
        giveRateContacts({ user: [currentUser._id] }, contacts);
        const error = [];
        result.forEach((_res) => {
          if (!_res.status) {
            error.push({
              contact: _res.contact,
              error: _res.error,
              type: _res.type,
            });
          }
        });

        let notRunnedContactIds = [];
        if (result.length !== contacts.length) {
          const runnedContactIds = [];
          result.forEach((e) => {
            runnedContactIds.push(e.contact && e.contact._id);
          });
          notRunnedContactIds = _.differenceBy(
            contacts,
            runnedContactIds,
            (e) => e + ''
          );
        }

        // Create Notification and With Success and Failed
        if (contactNumOnQueue) {
          // Notification create with the exec result
          const failed = error.map((e) => e.contact && e.contact._id);
          const not_executed = [...notRunnedContactIds];
          const succeed = _.differenceBy(
            contacts,
            [...failed, ...notRunnedContactIds],
            (e) => e + ''
          );

          const task = new Task({
            user: currentUser._id,
            contacts,
            status: 'completed',
            process: taskProcessId,
            type: 'send_email',
            action: {
              subject,
              content,
              attachments,
            },
            due_date: new Date(),
            exec_result: {
              notExecuted: not_executed,
              succeed,
              failed: error,
            },
          });
          task.save().catch((err) => {
            console.log('Some email is sent immediately', err);
          });
        }

        EmailHelper.updateUserCount(
          currentUser._id,
          result.length - error.length
        ).catch((err) => {
          console.log('Update user email count failed.', err);
        });

        if (error.length > 0) {
          let tokenErrorStr;
          const connect_errors = error.filter((e) => {
            if (
              e.type === 'connection_failed' ||
              e.type === 'google_token_invalid' ||
              e.type === 'outlook_token_invalid'
            ) {
              switch (e.type) {
                case 'connection_failed': {
                  tokenErrorStr = 'Connection Failed';
                  break;
                }
                case 'google_token_invalid': {
                  tokenErrorStr = 'Google Token Invalid';
                  break;
                }
                case 'outlook_token_invalid': {
                  tokenErrorStr = 'Outlook Token Invalid';
                  break;
                }
              }
              return true;
            }
          });
          if (connect_errors.length) {
            const time_zone = currentUser.time_zone_info;
            if (mode === 'automation') {
              const data = {
                template_data: {
                  user_name: currentUser.user_name,
                  created_at: moment()
                    .tz(time_zone)
                    .format('h:mm MMMM Do, YYYY'),
                  tokenErrorStr,
                },
                template_name: 'EmailTokenExpired',
                required_reply: false,
                email: currentUser.email,
                source: currentUser.source,
              };
              sendNotificationEmail(data);
            }
            const notification = new Notification({
              type: 'personal',
              criteria: tokenErrorStr,
              content: `You have got above error on sending CRMGROW Automation Email. Please check and connect your email again.`,
              user: currentUser.id,
            });
            notification.save().catch((err) => {
              console.log('err', err.message);
            });
            return res.status(406).json({
              status: false,
              error,
              notExecuted: notRunnedContactIds,
              queue: contactNumOnQueue,
              sent: contacts.length - error.length - notRunnedContactIds.length,
            });
          } else {
            return res.status(405).json({
              status: false,
              error,
              notExecuted: notRunnedContactIds,
              queue: contactNumOnQueue,
              sent: contacts.length - error.length - notRunnedContactIds.length,
            });
          }
        } else {
          const outbound_params = {
            subject,
            contact_ids: inputContacts,
            video_ids,
            pdf_ids,
            image_ids,
            create_at: new Date(),
          };
          await outboundCallhookApi(
            currentUser.id,
            outbound_constants.SEND_MATERIAL,
            getSendMaterialOutboundData,
            outbound_params
          );
          return res.send({
            status: true,
            data:
              mode === 'automation'
                ? result
                : {
                    queue: contactNumOnQueue,
                  },
          });
        }
      })
      .catch((err) => {
        console.log('bulk email sending is failed', err);
        sendErrorToSentry(currentUser, err);
        return res.status(500).json({
          status: false,
          error: err,
        });
      });
  } else {
    return res.send({
      status: true,
      data: {
        message: 'queue',
        due_date,
      },
    });
  }
};

// TODO: AUTO FOLLOW UP
const bulkText = async (req, res) => {
  const { currentUser, mode } = req;
  const {
    video_ids,
    pdf_ids,
    image_ids,
    page_ids,
    content,
    contacts,
    toPhones,
  } = req.body;
  if (!contacts || !contacts.length) {
    return res.status(400).json({
      status: false,
      error: 'Contacts not found',
    });
  }

  if (contacts.length > system_settings.TEXT_ONE_TIME) {
    return res.status(400).json({
      status: false,
      error: `You can send max ${system_settings.TEXT_ONE_TIME} contacts at a time`,
    });
  }
  let primaryUser = currentUser;
  if (!currentUser.is_primary) {
    primaryUser = await User.findOne({
      organization: currentUser.organization,
      is_primary: true,
    }).catch((err) => {
      console.log('user find err', err.message);
    });
  }
  if (!primaryUser['twilio_number'] && !primaryUser['wavv_number']) {
    return res.status(408).json({
      status: false,
      error: 'No phone',
    });
  }

  const text_info = primaryUser.text_info;

  if (!text_info['is_enabled']) {
    return res.status(412).json({
      status: false,
      error: 'Disable send sms',
    });
  }

  if (!TextHelper.checkTextCount(text_info, content, contacts?.length || 0)) {
    return res.status(409).json({
      status: false,
      error: 'Exceed max sms credit',
    });
  }

  TextHelper.sendText({
    user: currentUser._id,
    video_ids,
    pdf_ids,
    image_ids,
    page_ids,
    content,
    contacts,
    mode,
    // max_text_count,
    // shared_text,
    // has_shared,
    is_guest: req.guest_loggin,
    guest: req.guest,
    toPhones,
  })
    .then(async (_res) => {
      let sentCount = 0;
      let sentTextId;
      const errors = [];
      const succeed = [];
      const failed = [];
      const sendStatus = {};
      const invalidContacts = [];
      const textResult = _res.splice(-1);
      let activityId;
      let resStatus;
      let material_activities;
      _res.forEach((e, index) => {
        if (index === 0) {
          if (!e.status) {
            resStatus = 'error';
          } else {
            resStatus = e.sendStatus.status === 3 ? 'executed' : 'completed';
            activityId = e.data;
            material_activities = e.material_activities;
          }
        }
        if (e.text) {
          sentTextId = e.text;
        }
        if (!e.status) {
          errors.push(e);
          if (e.contact && e.contact._id) {
            failed.push(e.contact._id);
          }
        }
        if ((e.isSent || e.status) && e.body) {
          const message = new SegmentedMessage(e.body || '', 'auto', true);
          sentCount += message.segmentsCount || 0;
        }
        if (e.delivered && e.contact && e.contact._id) {
          succeed.push(e.contact._id);
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
        if (invalidContacts.length === contacts.length) {
          Text.deleteOne({ _id: textResult[0]['text'] }).catch((err) => {
            console.log('remove texting is failed', err);
          });
        } else {
          Text.updateOne({ _id: textResult[0]['text'] }, query).catch((err) => {
            console.log('texting result saving is failed', err);
          });
        }
      }

      const outbound_params = {
        subject: '',
        contact_ids: contacts,
        video_ids,
        pdf_ids,
        image_ids,
        create_at: new Date(),
      };
      await outboundCallhookApi(
        currentUser.id,
        outbound_constants.SEND_MATERIAL,
        getSendMaterialOutboundData,
        outbound_params
      ).catch((error) => {
        console.log(error.message);
      });
      if (errors.length > 0) {
        return res.status(405).json({
          status: false,
          error: errors,
          textId: sentTextId,
        });
      }
      return res.send({
        status: true,
        data:
          mode === 'automation'
            ? {
                material_activities,
                activityId,
                resStatus,
              }
            : undefined,
        textId: sentTextId,
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

const registerSendToken = async (req, res) => {
  const { currentUser } = req;
  const { send_uuid, contacts, content } = req.body;
  const text = new Text({
    user: currentUser._id,
    contacts,
    service_type: 'local',
    message_id: send_uuid,
    type: 0,
    content: content || 'Unknown content',
    status: 2,
  });
  text.save().catch(() => {
    console.log('text record saving is failed');
  });
  const activity = new Activity({
    ...req.body,
    content: 'send text via mobile',
    user: currentUser.id,
    texts: text._id,
    type: 'texts',
  });
  activity.save().catch((err) => {
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });

  return res.send({
    status: true,
  });
};

const socialShare = async (req, res) => {
  const { activity_id, site } = req.body;
  const activity = await Activity.findOne({ _id: activity_id });
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

    if (user && contact) {
      const activity_type = activity.type;
      switch (activity_type) {
        case 'videos': {
          const video_tracker = new VideoTracker({
            user: user.id,
            contact: contact.id,
            video: activity.videos,
            type: 'share',
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
            content: `clicked ${site} share button`,
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
            type: 'share',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _pdf_tracker = await pdf_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('pdf track save error', err.message);
            });

          _activity = new Activity({
            content: `clicked ${site} share button`,
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
            type: 'share',
            activity: activity.id,
          });

          const _image_tracker = await image_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('image track save error', err.message);
            });

          _activity = new Activity({
            content: `clicked ${site} share button`,
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
      _activity.single_id = _activity._id;
      const last_activity = await _activity
        .save()
        .then()
        .catch((err) => {
          console.log('err', err);
        });
      Contact.updateOne(
        { _id: contact.id },
        {
          $set: { last_activity: last_activity.id },
        }
      ).catch((err) => {
        console.log('update contact err', err.message);
      });
    }
  }

  return res.json({
    status: true,
  });
};

const thumbsUp = async (req, res) => {
  const { activity_id } = req.body;
  const activity = await Activity.findOne({ _id: activity_id });
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

    if (user && contact) {
      const activity_type = activity.type;
      switch (activity_type) {
        case 'videos': {
          const video_tracker = new VideoTracker({
            user: user.id,
            contact: contact.id,
            video: activity.videos,
            type: 'thumbs up',
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
            content: `gave thumbs up`,
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
            type: 'thumbs up',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _pdf_tracker = await pdf_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('pdf track save error', err.message);
            });

          _activity = new Activity({
            content: `gave thumbs up`,
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
            type: 'thumbs up',
            activity: activity.id,
          });

          const _image_tracker = await image_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('image track save error', err.message);
            });

          _activity = new Activity({
            content: `gave thumbs up`,
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
      _activity.single_id = _activity._id;
      const last_activity = await _activity
        .save()
        .then()
        .catch((err) => {
          console.log('err', err);
        });
      Contact.updateOne(
        { _id: contact.id },
        {
          $set: { last_activity: last_activity.id },
        }
      ).catch((err) => {
        console.log('update contact err', err.message);
      });
    }
  }

  return res.json({
    status: true,
  });
};

/**
 * Returns the folder and materials and trackers | method: post | used in the mobile
 * @param {*} req : Request body maybe include the folder id
 * @param {*} res
 * @returns
 */
const listOwnMaterials = async (req, res) => {
  const { currentUser } = req;
  const { folder } = req.body;
  let videos = [];
  let images = [];
  let pdfs = [];
  let localFolders = [];
  if (folder) {
    const folderDoc = await Folder.findOne({
      _id: folder,
      user: currentUser._id,
    });
    if (folderDoc) {
      videos = await Video.find({
        _id: { $in: folderDoc['videos'] },
        del: false,
      });
      pdfs = await PDF.find({
        _id: { $in: folderDoc['pdfs'] },
        del: false,
      });
      images = await Image.find({
        _id: { $in: folderDoc['images'] },
        del: false,
      });
    } else {
      return res.status(400).send({
        status: false,
        error: 'not_found_folder',
      });
    }
  } else {
    // Local Material Folders
    localFolders = await Folder.find({
      user: currentUser._id,
      type: 'material',
    });

    // Company materials (not folders)
    videos = await Video.find({ user: currentUser.id, del: false })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    pdfs = await PDF.find({ user: currentUser.id, del: false })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    images = await Image.find({
      user: currentUser.id,
      del: false,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
  }

  const videoIds = videos?.map((e) => e._id);
  const pdfIds = pdfs?.map((e) => e._id);
  const imageIds = images?.map((e) => e._id);
  const videoTrackers = await VideoTracker.aggregate([
    {
      $match: {
        video: { $in: videoIds },
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: { video: '$video' },
        count: { $sum: 1 },
      },
    },
  ]);
  const pdfTrackers = await PDFTracker.aggregate([
    {
      $match: {
        pdf: { $in: pdfIds },
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: { pdf: '$pdf' },
        count: { $sum: 1 },
      },
    },
  ]);
  const imageTrackers = await ImageTracker.aggregate([
    {
      $match: {
        image: { $in: imageIds },
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: { image: '$image' },
        count: { $sum: 1 },
      },
    },
  ]);
  return res.send({
    status: true,
    data: {
      localFolders,
      videos,
      images,
      pdfs,
      videoTrackers,
      pdfTrackers,
      imageTrackers,
    },
  });
};

const listLibraryMaterials = async (req, res) => {
  const { currentUser } = req;
  const { folder, type } = req.body;
  const garbage = await garbageHelper.get(currentUser);
  const ninVideos = garbage && (garbage['edited_video'] || []);
  const ninPdfs = garbage && (garbage['edited_pdf'] || []);
  const ninImages = garbage && (garbage['edited_image'] || []);
  const company = currentUser.company || 'eXp Realty';
  let _video_list = [];
  let _image_list = [];
  let _pdf_list = [];
  let admin_folders = [];
  let public_folders = [];
  let team_folders = [];
  const local_folders = [];
  if (folder) {
    if (type === 'team') {
      const team = await Team.findById(folder);
      if (team) {
        const videosToFind = _.difference(team['videos'], ninVideos);
        const pdfsToFind = _.difference(team['pdfs'], ninPdfs);
        const imagesToFind = _.difference(team['images'], ninImages);
        _video_list = await Video.find({
          _id: { $in: videosToFind },
          del: false,
        });
        _pdf_list = await PDF.find({
          _id: { $in: pdfsToFind },
          del: false,
        });
        _image_list = await Image.find({
          _id: { $in: imagesToFind },
          del: false,
        });
        team_folders = await Folder.find({
          _id: { $in: team['folders'] },
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'not_found_folder',
        });
      }
    }
    if (type === 'admin') {
      const folderDoc = await Folder.findOne({
        type: 'material',
        _id: folder,
        role: 'admin',
        company,
      });
      if (folderDoc) {
        const videosToFind = _.difference(folderDoc['videos'], ninVideos);
        const pdfsToFind = _.difference(folderDoc['pdfs'], ninPdfs);
        const imagesToFind = _.difference(folderDoc['images'], ninImages);
        _video_list = await Video.find({
          _id: { $in: videosToFind },
          del: false,
        });
        _pdf_list = await PDF.find({
          _id: { $in: pdfsToFind },
          del: false,
        });
        _image_list = await Image.find({
          _id: { $in: imagesToFind },
          del: false,
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'not_found_folder',
        });
      }
    }
    if (type === 'local') {
      const folderDoc = await Folder.findOne({
        _id: folder,
        user: currentUser._id,
      });
      if (folderDoc) {
        const videosToFind = _.difference(folderDoc['videos'], ninVideos);
        const pdfsToFind = _.difference(folderDoc['pdfs'], ninPdfs);
        const imagesToFind = _.difference(folderDoc['images'], ninImages);
        _video_list = await Video.find({
          _id: { $in: videosToFind },
          del: false,
        });
        _pdf_list = await PDF.find({
          _id: { $in: pdfsToFind },
          del: false,
        });
        _image_list = await Image.find({
          _id: { $in: imagesToFind },
          del: false,
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'not_found_folder',
        });
      }
    }
    if (type === 'team-folder') {
      const folderDoc = await Folder.findOne({
        _id: folder,
      });
      if (folderDoc) {
        const videosToFind = _.difference(folderDoc['videos'], ninVideos);
        const pdfsToFind = _.difference(folderDoc['pdfs'], ninPdfs);
        const imagesToFind = _.difference(folderDoc['images'], ninImages);
        _video_list = await Video.find({
          _id: { $in: videosToFind },
          del: false,
        });
        _pdf_list = await PDF.find({
          _id: { $in: pdfsToFind },
          del: false,
        });
        _image_list = await Image.find({
          _id: { $in: imagesToFind },
          del: false,
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'not_found_folder',
        });
      }
    }
  } else {
    // Company Material Folders
    admin_folders = await Folder.find({
      type: 'material',
      role: 'admin',
      company,
      del: false,
    });

    public_folders = await Folder.find({
      role: 'public',
      del: false,
      company,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });

    // Team Folders
    const teams =
      (await Team.find({
        $or: [{ members: currentUser.id }, { owner: currentUser.id }],
      }).populate([
        { path: 'videos' },
        { path: 'pdfs' },
        { path: 'images' },
        { path: 'folders' },
      ])) || [];

    if (teams && teams.length > 0) {
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i];
        const _videos = [];
        const _pdfs = [];
        const _images = [];
        const _folders = [];
        team['videos'].forEach((e) => {
          _videos.push({
            ...e._doc,
            team: { _id: team._id, name: team['name'] },
          });
        });
        team['pdfs'].forEach((e) => {
          _pdfs.push({
            ...e._doc,
            team: { _id: team._id, name: team['name'] },
          });
        });
        team['images'].forEach((e) => {
          _images.push({
            ...e._doc,
            team: { _id: team._id, name: team['name'] },
          });
        });
        team['folders'].forEach((e) => {
          _folders.push({
            ...e._doc,
            team: { _id: team._id, name: team['name'] },
          });
        });
        Array.prototype.push.apply(_video_list, _videos);
        Array.prototype.push.apply(_pdf_list, _pdfs);
        Array.prototype.push.apply(_image_list, _images);
        Array.prototype.push.apply(team_folders, _folders);
      }
    }

    // Company materials (not folders)
    const _video_admin = await Video.find({
      role: 'admin',
      del: false,
      _id: { $nin: ninVideos },
      company,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const _video_public = await Video.find({
      role: 'public',
      del: false,
      company,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    Array.prototype.push.apply(_video_list, _video_admin);
    Array.prototype.push.apply(_video_list, _video_public);

    const _pdf_admin = await PDF.find({
      role: 'admin',
      del: false,
      _id: { $nin: ninPdfs },
      company,
    });
    const _pdf_public = await PDF.find({
      role: 'public',
      del: false,
      company,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    Array.prototype.push.apply(_pdf_list, _pdf_admin);
    Array.prototype.push.apply(_pdf_list, _pdf_public);

    const _image_admin = await Image.find({
      role: 'admin',
      del: false,
      _id: { $nin: ninImages },
      company,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const _image_public = await Image.find({
      role: 'public',
      del: false,
      company,
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    Array.prototype.push.apply(_image_list, _image_admin);
    Array.prototype.push.apply(_image_list, _image_public);
  }

  const videoIds = _video_list.map((e) => e._id);
  const pdfIds = _pdf_list.map((e) => e._id);
  const imageIds = _image_list.map((e) => e._id);
  const videoTrackers = await VideoTracker.aggregate([
    {
      $match: {
        video: { $in: videoIds },
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: { video: '$video' },
        count: { $sum: 1 },
      },
    },
  ]);
  const pdfTrackers = await PDFTracker.aggregate([
    {
      $match: {
        pdf: { $in: pdfIds },
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: { pdf: '$pdf' },
        count: { $sum: 1 },
      },
    },
  ]);
  const imageTrackers = await ImageTracker.aggregate([
    {
      $match: {
        image: { $in: imageIds },
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: { image: '$image' },
        count: { $sum: 1 },
      },
    },
  ]);
  return res.send({
    status: true,
    data: {
      localFolders: local_folders,
      adminFolders: [...admin_folders, ...public_folders],
      teams: [],
      teamFolders: team_folders,
      videos: _video_list,
      images: _image_list,
      pdfs: _pdf_list,
      videoTrackers,
      pdfTrackers,
      imageTrackers,
    },
  });
};

const easyLoadMaterials = async (req, res) => {
  const { currentUser } = req;
  let videosToFind = [];
  let imagesToFind = [];
  let pdfsToFind = [];
  const localFolders = await Folder.find({
    user: currentUser._id,
    type: 'material',
  });
  [...localFolders].forEach((e) => {
    videosToFind = [...videosToFind, ...e.videos];
    imagesToFind = [...pdfsToFind, ...e.pdfs];
    pdfsToFind = [...imagesToFind, ...e.images];
  });
  const videos = await Video.find({
    $or: [
      { user: currentUser._id, del: false },
      { _id: { $in: videosToFind }, del: false },
    ],
  }).select({
    type: true,
    title: true,
    preview: true,
    thumbnail: true,
    _id: true,
  });
  const pdfs = await PDF.find({
    $or: [
      { user: currentUser._id, del: false },
      { _id: { $in: pdfsToFind }, del: false },
    ],
  }).select({ type: true, title: true, preview: true, _id: true });
  const images = await Image.find({
    $or: [
      { user: currentUser._id, del: false },
      { _id: { $in: imagesToFind }, del: false },
    ],
  }).select({ type: true, title: true, preview: true, _id: true });
  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
    },
  });
};

/**
 * Returns the folder and materials | method: get | used in the convrrt
 * @param {*} req : Request body maybe include the folder id
 * @param {*} res
 * @returns
 */
const loadFolderVideos = async (req, res) => {
  const { currentUser } = req;
  const folder = req.query.folder;
  let videos = [];
  let folders = [];
  if (folder) {
    const folderDoc = await Folder.findOne({
      _id: folder,
      user: currentUser._id,
    });
    if (folderDoc) {
      videos = await Video.find({
        _id: { $in: folderDoc['videos'] },
        del: false,
      }).select({
        _id: 1,
        preview: 1,
        thumbnail: 1,
        site_image: 1,
        title: 1,
        description: true,
        priority: 1,
      });
    } else {
      return res.status(400).send({
        status: false,
        error: 'not_found_folder',
      });
    }
  } else {
    // Local Material Folders
    const folderDocs = await Folder.find({
      user: currentUser._id,
      type: 'material',
    });

    folders = [];
    let folderVideos = [];
    folderDocs.forEach((_folder) => {
      folderVideos = [...folderVideos, ..._folder['videos']];
      folders.push({
        title: _folder.title,
        _id: _folder._id,
      });
    });

    // Company materials (not folders)
    videos = await Video.find({
      user: currentUser.id,
      del: false,
      _id: { $nin: folderVideos },
    })
      .select({
        _id: 1,
        preview: 1,
        thumbnail: 1,
        site_image: 1,
        title: 1,
        description: 1,
        priority: 1,
      })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
  }
  return res.send({
    status: true,
    data: {
      folders,
      videos,
    },
  });
};

/**
 * Returns all materials and folders | used in web/extension
 * @param {*} req
 * @param {*} res
 * @returns: data : [...folder_list, ...material_list]
 */
const load = async (req, res) => {
  const { currentUser } = req;
  const fields = {
    _id: true,
    title: true,
    type: true,
    preview: true,
    thumbnail: true,
  };

  const _video_list = await Video.find({ user: currentUser.id, del: false })
    .select(fields)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _pdf_list = await PDF.find({ user: currentUser.id, del: false })
    .select(fields)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _image_list = await Image.find({
    user: currentUser.id,
    del: false,
    type: { $ne: 'folder' },
  })
    .select(fields)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _folder_list = await Folder.find({
    user: currentUser.id,
    type: 'material',
    rootFolder: { $ne: true },
  });

  const _folder_detail_list = _folder_list.map((e) => ({
    ...e._doc,
    material_type: 'folder',
    item_type: 'folder',
  }));
  const _video_detail_list = _video_list.map((e) => ({
    ...e._doc,
    material_type: 'video',
    item_type: 'video',
  }));
  const _pdf_detail_list = _pdf_list.map((e) => ({
    ...e._doc,
    material_type: 'pdf',
    item_type: 'pdf',
  }));
  const _image_detail_list = _image_list.map((e) => ({
    ...e._doc,
    material_type: 'image',
    item_type: 'image',
  }));

  return res.send({
    status: true,
    data: [
      ..._folder_detail_list,
      ..._video_detail_list,
      ..._pdf_detail_list,
      ..._image_detail_list,
    ],
  });
};

const getParentFolderId = async (req, res) => {
  const { currentUser } = req;
  const { itemId, itemType } = req.body;

  const searchType = itemType + 's';

  const folder_info = await getParentFolder(currentUser.id, itemId, searchType);
  if (folder_info) {
    return res.json({
      status: true,
      data: {
        folderId: folder_info._id,
        rootFolder: folder_info.rootFolder,
      },
    });
  }
  return res.json({
    status: false,
    data: {},
  });
};

const loadOwn = async (req, res) => {
  const { currentUser } = req;
  const { folder } = req.body;
  let { search, teamOptions, loadType } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  if (!loadType) {
    loadType = '';
  }
  if (!teamOptions) {
    teamOptions = [];
  }
  let team_videos = [];
  let team_pdfs = [];
  let team_images = [];
  let team_folders = [];
  if (teamOptions.length) {
    const teams = await Team.find({
      _id: { $in: teamOptions },
    });
    teams.forEach((e) => {
      team_videos = [...team_videos, ...e.videos];
      team_pdfs = [...team_pdfs, ...e.pdfs];
      team_images = [...team_images, ...e.images];
      team_folders = [...team_folders, ...e.folders];
    });
  }
  let root_folder;
  let prevId = '';
  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      user: currentUser.id,
      rootFolder: true,
      del: false,
    });
  } else {
    root_folder = await Folder.findOne({
      _id: folder,
      user: currentUser.id,
    });
    if (root_folder) {
      const prev_folder = await Folder.findOne({
        folders: { $in: root_folder.id },
        role: { $ne: 'team' },
      });
      if (prev_folder && !prev_folder.rootFolder) {
        prevId = prev_folder.id;
      }
    }
  }

  if (!root_folder) {
    return res.send({
      status: true,
      data: {
        results: [],
        prevFolder: prevId,
      },
    });
  }

  const video_query = {
    _id: { $in: root_folder.videos },
    del: false,
  };
  const pdf_query = {
    _id: { $in: root_folder.pdfs },
    del: false,
  };
  const image_query = {
    _id: { $in: root_folder.images },
    del: false,
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'material',
    del: false,
  };
  let _video_list = [];
  let _pdf_list = [];
  let _image_list = [];
  let _folder_list = [];
  if (search || teamOptions.length) {
    _folder_list = await getAllFolders(
      'material',
      root_folder.folders,
      root_folder.folders
    );
    let videoIds = root_folder.videos;
    let pdfIds = root_folder.pdfs;
    let imageIds = root_folder.images;
    let folderIds = root_folder.folders;
    for (let i = 0; i < _folder_list.length; i++) {
      videoIds = [...videoIds, ..._folder_list[i].videos];
      pdfIds = [...pdfIds, ..._folder_list[i].pdfs];
      imageIds = [...imageIds, ..._folder_list[i].images];
      folderIds = [...folderIds, ..._folder_list[i].folders];
    }
    if (search) {
      video_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      pdf_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      image_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    }
    if (teamOptions.length) {
      video_query['$or'] = [
        { _id: { $in: team_videos } },
        { team_id: { $in: teamOptions } },
      ];
      pdf_query['$or'] = [
        { _id: { $in: team_pdfs } },
        { team_id: { $in: teamOptions } },
      ];
      image_query['$or'] = [
        { _id: { $in: team_images } },
        { team_id: { $in: teamOptions } },
      ];
      folder_query['$or'] = [
        { _id: { $in: team_folders } },
        { team_id: { $in: teamOptions } },
      ];
    }

    video_query['_id'] = { $in: videoIds };
    pdf_query['_id'] = { $in: pdfIds };
    image_query['_id'] = { $in: imageIds };
    folder_query['_id'] = { $in: folderIds };
  }
  _video_list = await Video.find(video_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  _pdf_list = await PDF.find(pdf_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  _image_list = await Image.find(image_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  _folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  const _folder_detail_list = [];
  const _video_detail_list = [];
  const _pdf_detail_list = [];
  const _image_detail_list = [];

  if (!loadType) {
    const videoIds = _video_list.map((_video) => _video._id);
    const pdfIds = _pdf_list.map((_pdf) => _pdf._id);
    const imageIds = _image_list.map((_image) => _image._id);
    const folderIds = _folder_list.map((e) => e._id);

    const teams = await Team.find({
      $or: [
        { videos: { $elemMatch: { $in: videoIds } } },
        { pdfs: { $elemMatch: { $in: pdfIds } } },
        { images: { $elemMatch: { $in: imageIds } } },
        { folders: { $elemMatch: { $in: folderIds } } },
      ],
    });
    const teamDics = [];
    const _videoIds = videoIds.map((e) => e + '');
    const _pdfIds = pdfIds.map((e) => e + '');
    const _imageIds = imageIds.map((e) => e + '');
    const _folderIds = folderIds.map((e) => e + '');

    teams.forEach((_team) => {
      const teamInfo = { _id: _team._id, name: _team.name };
      _team.videos.forEach((e) => {
        if (_videoIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
      _team.pdfs.forEach((e) => {
        if (_pdfIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
      _team.images.forEach((e) => {
        if (_imageIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
      _team.folders.forEach((e) => {
        if (_folderIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
    });
    const sharedWithDic = _.groupBy(teamDics, (e) => Object.keys(e)[0]);

    for (let i = 0; i < _folder_list.length; i++) {
      const myJSON = JSON.stringify(_folder_list[i]);
      const _folder = JSON.parse(myJSON);
      const folder = await Object.assign(_folder, {
        material_type: 'folder',
        item_type: 'folder',
        shared_with: sharedWithDic[_folder._id],
      });
      _folder_detail_list.push(folder);
    }

    for (let i = 0; i < _video_list.length; i++) {
      let video_detail = _video_list[i]._doc || _video_list[i];
      video_detail = {
        ...video_detail,
        material_type: 'video',
        item_type: 'video',
        shared_with: sharedWithDic[video_detail._id],
      };

      _video_detail_list.push(video_detail);
    }

    for (let i = 0; i < _pdf_list.length; i++) {
      let pdf_detail = _pdf_list[i]._doc || _pdf_list[i];
      pdf_detail = {
        ...pdf_detail,
        material_type: 'pdf',
        item_type: 'pdf',
        shared_with: sharedWithDic[pdf_detail._id],
      };

      _pdf_detail_list.push(pdf_detail);
    }

    for (let i = 0; i < _image_list.length; i++) {
      let image_detail = _image_list[i]._doc || _image_list[i];
      image_detail = {
        ...image_detail,
        material_type: 'image',
        item_type: 'image',
        shared_with: sharedWithDic[image_detail._id],
      };

      _image_detail_list.push(image_detail);
    }
  } else {
    for (let i = 0; i < _folder_list.length; i++) {
      const myJSON = JSON.stringify(_folder_list[i]);
      const _folder = JSON.parse(myJSON);
      const folder = await Object.assign(_folder, {
        material_type: 'folder',
        item_type: 'folder',
      });
      _folder_detail_list.push(folder);
    }

    for (let i = 0; i < _video_list.length; i++) {
      let video_detail = _video_list[i]._doc || _video_list[i];
      video_detail = {
        ...video_detail,
        material_type: 'video',
        item_type: 'video',
      };

      _video_detail_list.push(video_detail);
    }

    for (let i = 0; i < _pdf_list.length; i++) {
      let pdf_detail = _pdf_list[i]._doc || _pdf_list[i];
      pdf_detail = {
        ...pdf_detail,
        material_type: 'pdf',
        item_type: 'pdf',
      };

      _pdf_detail_list.push(pdf_detail);
    }

    for (let i = 0; i < _image_list.length; i++) {
      let image_detail = _image_list[i]._doc || _image_list[i];
      image_detail = {
        ...image_detail,
        material_type: 'image',
        item_type: 'image',
      };

      _image_detail_list.push(image_detail);
    }
  }

  return res.send({
    status: true,
    data: {
      results: [
        ..._folder_detail_list,
        ..._video_detail_list,
        ..._pdf_detail_list,
        ..._image_detail_list,
      ],
      prevFolder: prevId,
      currentFolder: root_folder,
    },
  });
};

const toggleEnableNotification = async (req, res) => {
  const { id, type, changedStatus } = req.body;
  const result = await MaterialModels[type].findOneAndUpdate(
    { _id: mongoose.Types.ObjectId(id) },
    [
      {
        $set: {
          enabled_notification: changedStatus,
        },
      },
    ],
    {
      returnDocument: 'after',
      projection: { enabled_notification: 1 },
    }
  );
  return res.send({
    status: true,
    data: !!result?.enabled_notification,
  });
};

const loadTrackCount = async (req, res) => {
  const { currentUser } = req;
  const { id, type } = req.body;

  Promise.all([
    Activity.countDocuments({
      [type + 's']: mongoose.Types.ObjectId(id),
      user: currentUser._id,
      type: type + 's',
      $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
    }),
    TrackerModels[type].countDocuments({ [type]: mongoose.Types.ObjectId(id) }),
    TrackerModels[type].aggregate([
      {
        $match: {
          [type]: mongoose.Types.ObjectId(id),
          user: mongoose.Types.ObjectId(currentUser.id),
        },
      },
      {
        $group: {
          _id: { contact: '$contact' },
        },
      },
      {
        $match: { '_id.contact.0': { $exists: true } },
      },
      { $count: 'count' },
    ]),
  ]).then(([sent, tracked, contact]) => {
    return res.send({
      status: true,
      data: {
        sent: sent ?? 0,
        tracked: tracked ?? 0,
        contact: contact?.[0]?.['count'] ?? 0,
      },
    });
  });
};

const loadViews = async (req, res) => {
  const { currentUser } = req;
  let { _ids } = req.body;
  _ids = _ids.map((id) => new mongoose.Types.ObjectId(id));

  const videoTrackerInfo = await VideoTracker.aggregate([
    { $match: { video: { $in: _ids }, user: currentUser._id } },
    { $unwind: '$video' },
    { $group: { _id: '$video', views: { $sum: 1 } } },
  ]);

  const pdfTrackerInfo = await PDFTracker.aggregate([
    { $match: { pdf: { $in: _ids }, user: currentUser._id } },
    { $unwind: '$pdf' },
    { $group: { _id: '$pdf', views: { $sum: 1 } } },
  ]);

  const imageTrackerInfo = await ImageTracker.aggregate([
    { $match: { image: { $in: _ids }, user: currentUser._id } },
    { $unwind: '$image' },
    { $group: { _id: '$image', views: { $sum: 1 } } },
  ]);

  // Get sent info
  const videoSentInfo = await Activity.aggregate([
    {
      $match: {
        videos: { $in: _ids },
        user: currentUser._id,
        type: 'videos',
        $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
      },
    },
    { $unwind: '$videos' },
    { $group: { _id: '$videos', sent: { $sum: 1 } } },
  ]);

  const pdfSentInfo = await Activity.aggregate([
    {
      $match: {
        pdfs: { $in: _ids },
        user: currentUser._id,
        type: 'pdfs',
        $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
      },
    },
    { $unwind: '$pdfs' },
    { $group: { _id: '$pdfs', sent: { $sum: 1 } } },
  ]);

  const imageSentInfo = await Activity.aggregate([
    {
      $match: {
        images: { $in: _ids },
        user: currentUser._id,
        type: 'images',
        $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
      },
    },
    { $unwind: '$images' },
    { $group: { _id: '$images', sent: { $sum: 1 } } },
  ]);

  // Get watch contact info
  const videoInfo = videoTrackerInfo.map((t1) => ({
    ...t1,
    ...videoSentInfo.find((t2) => t2._id + '' === t1._id + ''),
  }));

  const pdfInfo = pdfTrackerInfo.map((t1) => ({
    ...t1,
    ...pdfSentInfo.find((t2) => t2._id + '' === t1._id + ''),
  }));

  const imageInfo = imageTrackerInfo.map((t1) => ({
    ...t1,
    ...imageSentInfo.find((t2) => t2._id + '' === t1._id + ''),
  }));

  return res.send({
    status: true,
    data: {
      results: [...videoInfo, ...pdfInfo, ...imageInfo],
    },
  });
};

/**
 * Returns all folders and materials in admin/public/team | used in web/extension
 * @param {*} req : Request
 * @param {*} res : Response
 */
const loadLibrary = async (req, res) => {
  const { currentUser } = req;
  const { folder, team_id } = req.body;
  let { search, teamOptions, userOptions } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  if (!teamOptions) {
    teamOptions = [];
  }
  if (!userOptions) {
    userOptions = [];
  }

  let root_folder;
  let team_folders;
  let prevId = '';
  let team;
  let _folder_list = [];
  let _video_list = [];
  let _pdf_list = [];
  let _image_list = [];

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  });
  if (!folder || folder === 'root') {
    const teamIds = [];
    teams.forEach((e) => {
      teamIds.push(e._id);
    });
    team_folders = await Folder.find({
      role: 'team',
      del: false,
      team: { $in: teamIds },
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const admin_folder = await Folder.findOne({
      rootFolder: true,
      role: 'admin',
      del: false,
    });
    root_folder = {
      ...admin_folder._doc,
    };
    const companyFolders = await Folder.find(
      {
        _id: { $in: root_folder.folders },
        company: currentUser.company,
      },
      { _id: 1 }
    ).catch((err) => {});
    const companyFolderIds = (companyFolders || []).map((e) => e._id);
    root_folder.folders = companyFolderIds;
    team_folders.forEach((e) => {
      root_folder.folders.push(e._id);
    });
  } else {
    root_folder = await Folder.findById(folder);
    if (root_folder.team || team_id) {
      team = await Team.findById(team_id).select({
        _id: 1,
        name: 1,
        folders: 1,
      });
    }
    prevId = await getPrevFolder(team, root_folder);
  }

  const video_query = {
    _id: { $in: root_folder.videos },
    del: false,
  };
  const pdf_query = {
    _id: { $in: root_folder.pdfs },
    del: false,
  };
  const image_query = {
    _id: { $in: root_folder.images },
    del: false,
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    $or: [{ type: 'material' }, { team: { $exists: true }, role: 'team' }],
    del: false,
  };

  if (search || teamOptions.length || userOptions.length) {
    if (!folder || folder === 'root') {
      if (teamOptions.length) {
        teams.forEach((e) => {
          if (!teamOptions.includes(e._id)) {
            const index = team_folders.findIndex(
              (_folder) => _folder.team === e._id
            );
            if (index !== -1) {
              const _index = root_folder.folders.findIndex(
                (_folder) => _folder === team_folders[index]._id
              );
              if (_index !== -1) {
                root_folder.folders.splice(_index, 1);
              }
            }
          }
        });
      }
    }
    _folder_list = await getAllFolders(
      'material',
      root_folder.folders,
      root_folder.folders
    );
    let videoIds = root_folder.videos;
    let pdfIds = root_folder.pdfs;
    let imageIds = root_folder.images;
    let folderIds = root_folder.folders;
    for (let i = 0; i < _folder_list.length; i++) {
      videoIds = [...videoIds, ..._folder_list[i].videos];
      pdfIds = [...pdfIds, ..._folder_list[i].pdfs];
      imageIds = [...imageIds, ..._folder_list[i].images];
      folderIds = [...folderIds, ..._folder_list[i].folders];
    }

    if (search) {
      video_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      pdf_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      image_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    }
    if (userOptions.length) {
      video_query['user'] = { $in: userOptions };
      pdf_query['user'] = { $in: userOptions };
      image_query['user'] = { $in: userOptions };
      folder_query['user'] = { $in: userOptions };
    }
    video_query['_id'] = { $in: videoIds };
    pdf_query['_id'] = { $in: pdfIds };
    image_query['_id'] = { $in: imageIds };
    folder_query['_id'] = { $in: folderIds };
  }

  _video_list = await Video.find(video_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  _pdf_list = await PDF.find(pdf_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  _image_list = await Image.find(image_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  _folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 })
    .populate({ path: 'team', select: '_id name' });

  const materialOwnerIds = [];
  _video_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  _pdf_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  _image_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  _folder_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });

  const _material_owners = await User.find({
    _id: { $in: materialOwnerIds },
  }).select('_id user_name');
  const _material_owner_objects = {};
  _material_owners.forEach((e) => {
    _material_owner_objects[e._id] = e;
  });

  const videoIds = _video_list.map((_video) => _video._id);
  const videosInfo = await Video.aggregate([
    { $match: { original_id: { $in: videoIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const videoDownloadCount = {};
  videosInfo.forEach((e) => {
    videoDownloadCount[e._id] = e.count;
  });

  const pdfIds = _pdf_list.map((_pdf) => _pdf._id);
  const pdfsInfo = await PDF.aggregate([
    { $match: { original_id: { $in: pdfIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const pdfDownloadCount = {};
  pdfsInfo.forEach((e) => {
    pdfDownloadCount[e._id] = e.count;
  });

  const imageIds = _image_list.map((_image) => _image._id);
  const imagesInfo = await Image.aggregate([
    { $match: { original_id: { $in: imageIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const imageDownloadCount = {};
  imagesInfo.forEach((e) => {
    imageDownloadCount[e._id] = e.count;
  });

  const _video_detail_list = [];
  for (let i = 0; i < _video_list.length; i++) {
    let video_detail = _video_list[i]._doc || _video_list[i];
    video_detail = {
      ...video_detail,
      material_type: 'video',
      item_type: 'video',
      downloads: videoDownloadCount[video_detail._id] || 0,
      owner: _material_owner_objects[video_detail.user],
    };
    _video_detail_list.push(video_detail);
  }

  const _pdf_detail_list = [];
  for (let i = 0; i < _pdf_list.length; i++) {
    let pdf_detail = _pdf_list[i]._doc || _pdf_list[i];
    pdf_detail = {
      ...pdf_detail,
      material_type: 'pdf',
      item_type: 'pdf',
      downloads: pdfDownloadCount[pdf_detail._id] || 0,
      owner: _material_owner_objects[pdf_detail.user],
    };
    _pdf_detail_list.push(pdf_detail);
  }

  const _image_detail_list = [];
  for (let i = 0; i < _image_list.length; i++) {
    let image_detail = _image_list[i]._doc || _image_list[i];
    image_detail = {
      ...image_detail,
      material_type: 'image',
      item_type: 'image',
      downloads: imageDownloadCount[image_detail._id] || 0,
      owner: _material_owner_objects[image_detail.user],
    };
    _image_detail_list.push(image_detail);
  }

  const _folder_detail_list = [];
  for (let i = 0; i < _folder_list.length; i++) {
    const myJSON = JSON.stringify(_folder_list[i]);
    const _folder = JSON.parse(myJSON);
    const folder = await Object.assign(_folder, {
      material_type: 'folder',
      item_type: 'folder',
      owner: _material_owner_objects[_folder.user],
    });
    _folder_detail_list.push(folder);
  }

  res.send({
    status: true,
    data: {
      results: [
        ..._folder_detail_list,
        ..._video_detail_list,
        ..._pdf_detail_list,
        ..._image_detail_list,
      ],
      prevFolder: prevId,
      currentFolder: root_folder,
      team,
    },
  });
};

const loadLibraryFolderList = async (req, res) => {
  const { currentUser } = req;
  const { folder } = req.body;

  let root_folder;
  let team_folders;
  let prevId = '';
  let team;
  let _folder_list = [];
  const optionFilter = {
    _id: 1,
    rootFolder: 1,
    title: 1,
    folders: 1,
    role: 1,
  };

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  });
  if (!folder || folder === 'root') {
    const teamIds = [];
    teams.forEach((e) => {
      teamIds.push(e._id);
    });
    team_folders = await Folder.find(
      {
        role: 'team',
        del: false,
        team: { $in: teamIds },
      },
      optionFilter
    )
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const admin_folder = await Folder.findOne(
      {
        rootFolder: true,
        role: 'admin',
        del: false,
      },
      optionFilter
    );
    root_folder = {
      ...admin_folder._doc,
    };
    const companyFolders = await Folder.find(
      {
        _id: { $in: root_folder.folders },
        company: currentUser.company,
      },
      { _id: 1, ...optionFilter }
    ).catch((err) => {});
    const companyFolderIds = (companyFolders || []).map((e) => e._id);
    root_folder.folders = companyFolderIds;
    team_folders.forEach((e) => {
      root_folder.folders.push(e._id);
    });
  } else {
    root_folder = await Folder.findById(folder, optionFilter);

    prevId = await getPrevFolder(team, root_folder);
  }

  const folder_query = {
    _id: { $in: root_folder.folders },
    $or: [{ type: 'material' }, { team: { $exists: true }, role: 'team' }],
    del: false,
  };

  _folder_list = await Folder.find(folder_query, optionFilter)
    .sort({ priority: 1 })
    .sort({ created_at: 1 })
    .populate({ path: 'team', select: '_id name' });

  res.send({
    status: true,
    data: {
      prevFolder: prevId,
      results: _folder_list,
      currentFolder: root_folder,
    },
  });
};

const loadFolders = async (req, res) => {
  const { currentUser } = req;
  const { folder, type } = req.query;
  let root_folder;
  let prev_folder;
  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      user: currentUser._id,
      rootFolder: true,
      del: false,
    });
  } else {
    root_folder = await Folder.findById(folder);
    prev_folder = await Folder.findOne({
      folders: { $in: root_folder.id },
      rootFolder: { $ne: true },
    });
  }

  const folder_ids = root_folder ? root_folder.folders || [] : [];
  const folders = await Folder.find({
    _id: { $in: folder_ids },
    type,
    del: false,
  }).select({
    _id: 1,
    title: 1,
    folders: 1,
    rootFolder: 1,
  });
  const results = folders.map((e) => ({ ...e._doc, item_type: 'folder' }));

  return res.send({
    status: true,
    data: {
      results,
      prevFolder: prev_folder,
      currentFolder: root_folder,
    },
  });
};

const moveFiles = async (req, res) => {
  const { currentUser } = req;
  const { files, target, source } = req.body;
  if (!files) {
    return res.status(400).send({
      status: false,
      error: 'there are no files.',
    });
  }
  const { videos, images, pdfs, automations, templates, folders } = files;
  let sourceFolderQuery = {};
  let targetFolderQuery = {};
  if (source) {
    sourceFolderQuery = { _id: source, user: currentUser._id };
  } else {
    sourceFolderQuery = { rootFolder: true, user: currentUser._id };
  }
  if (target) {
    targetFolderQuery = { _id: target, user: currentUser._id };
  } else {
    targetFolderQuery = { rootFolder: true, user: currentUser._id };
  }
  await Folder.updateOne(sourceFolderQuery, {
    $pull: {
      videos: { $in: videos },
      pdfs: { $in: pdfs },
      images: { $in: images },
      automations: { $in: automations },
      templates: { $in: templates },
      folders: { $in: folders },
    },
  });
  await Folder.updateOne(targetFolderQuery, {
    $addToSet: {
      videos: { $each: videos },
      images: { $each: images },
      pdfs: { $each: pdfs },
      automations: { $each: automations },
      templates: { $each: templates },
      folders: { $each: folders },
    },
  });
  return res.send({
    status: true,
  });
};

const createFolder = async (req, res) => {
  const { currentUser } = req;
  const { folderId } = req.body;

  const folder = new Folder({
    ...req.body,
    user: currentUser._id,
  });

  await folder
    .save()
    .then(async (_folder) => {
      if (folderId) {
        await Folder.updateOne(
          { _id: folderId },
          {
            $push: { folders: _folder.id },
          }
        );
      } else {
        await Folder.updateOne(
          { user: currentUser.id, rootFolder: true },
          {
            $push: { folders: _folder.id },
          }
        );
      }
      return res.send({
        status: true,
        data: _folder,
      });
    })
    .catch((e) => {
      sendErrorToSentry(currentUser, e);
      return res.status(500).send({
        status: false,
        error: e.message,
      });
    });
};

const editFolder = async (req, res) => {
  const { currentUser } = req;
  const _id = req.params.id;
  const { title } = req.body;
  const folder = await Folder.findOne({ _id, user: currentUser._id }).catch(
    (err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  );

  if (!folder) {
    return res.status(400).send({
      status: false,
      error: 'Not found folder',
    });
  }

  folder['title'] = title;
  folder
    .save()
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};
const removeFolder = async (req, res) => {
  const { currentUser } = req;
  const { _id, mode, target } = req.body;

  const folder = await Folder.findOne({ _id, user: currentUser._id }).catch(
    (err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  );

  if (!folder) {
    return res.status(400).send({
      status: false,
      error: 'Not found folder',
    });
  }

  if (mode === 'remove-all') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        const { videos, images, pdfs } = oldFolderData;
        bulkRemove({ currentUser, body: { videos, images, pdfs } }, res);
      })
      .catch((err) => {
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else if (mode === 'move-other') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                videos: { $each: oldFolderData.videos },
                images: { $each: oldFolderData.images },
                pdfs: { $each: oldFolderData.pdfs },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }

  if (mode === 'only-folder') {
    // Skip
  }
  Folder.deleteOne({ _id })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const moveMaterials = async (req, res) => {
  const { currentUser } = req;
  const { materials, target, source } = req.body;
  const { videos, pdfs, images } = materials;
  if (source) {
    await Folder.updateOne(
      { _id: source, user: currentUser._id },
      {
        $pull: {
          videos: { $in: videos },
          pdfs: { $in: pdfs },
          images: { $in: images },
        },
      }
    );
  }
  if (target) {
    await Folder.updateOne(
      { _id: target, user: currentUser._id },
      {
        $addToSet: {
          videos: { $each: videos },
          images: { $each: images },
          pdfs: { $each: pdfs },
        },
      }
    );
  }
  return res.send({
    status: true,
  });
};

// const bulkRemove = async (req, res) => {
//   const { videos, pdfs, images } = req.body;
//   const { currentUser } = req;
//   const error = [];
//   const promise_array = [];

//   if (videos) {
//     for (let i = 0; i < videos.length; i++) {
//       const promise = new Promise(async (resolve) => {
//         const video = await Video.findOne({
//           _id: videos[i],
//           user: currentUser.id,
//         });

//         if (video) {
//           // Duplicated Admin Video: Garbage Update
//           if (video['default_video'] || video['default_edited']) {
//             Garbage.updateOne(
//               { user: currentUser.id },
//               {
//                 $pull: { edited_video: { $in: [video['default_video']] } },
//               }
//             ).catch((err) => {
//               console.log('default video remove err', err.message);
//             });
//           }
//           // Duplicated Normal Video
//           if (video['shared_video']) {
//             Video.updateOne(
//               {
//                 _id: video['shared_video'],
//                 user: currentUser.id,
//               },
//               {
//                 $unset: { shared_video: true },
//                 has_shared: false,
//               }
//             ).catch((err) => {
//               console.log('default video remove err', err.message);
//             });
//           }
//           // Team Video Remove
//           if (video['role'] === 'team') {
//             Team.updateOne(
//               { videos: videos[i] },
//               {
//                 $pull: { videos: { $in: [videos[i]] } },
//               }
//             ).catch((err) => {
//               console.log('err', err.message);
//             });
//           }
//           // Implement the Video Logic && File Remove
//           Video.updateOne({ _id: videos[i] }, { $set: { del: true } })
//             .then(async () => {
//               let hasSameVideo = false;
//               if (video['bucket']) {
//                 const sameVideos = await Video.find({
//                   del: false,
//                   key: video['key'],
//                 }).catch((err) => {
//                   console.log('same video getting error');
//                 });
//                 if (sameVideos && sameVideos.length) {
//                   hasSameVideo = true;
//                 }
//               } else {
//                 const sameVideos = await Video.find({
//                   del: false,
//                   url: video['url'],
//                 }).catch((err) => {
//                   console.log('same video getting error');
//                 });
//                 if (sameVideos && sameVideos.length) {
//                   hasSameVideo = true;
//                 }
//               }
//               if (!hasSameVideo) {
//                 if (video['bucket']) {
//                   s3.deleteObject(
//                     {
//                       Bucket: video['bucket'],
//                       Key: 'transcoded/' + video['key'] + '.mp4',
//                     },
//                     function (err, data) {
//                       console.log('transcoded video removing error', err);
//                     }
//                   );
//                   emptyBucket(
//                     video['bucket'],
//                     'streamd/' + video['key'] + '/',
//                     (err) => {
//                       if (err) {
//                         console.log('Removing files error in bucket');
//                       }
//                     }
//                   );
//                 } else {
//                   const url = video['url'];
//                   if (url.indexOf('teamgrow.s3') > 0) {
//                     s3.deleteObject(
//                       {
//                         Bucket: api.AWS.AWS_S3_BUCKET_NAME,
//                         Key: url.slice(44),
//                       },
//                       function (err, data) {
//                         console.log('err', err);
//                       }
//                     );
//                   } else {
//                     try {
//                       const file_path = video.path;
//                       if (file_path) {
//                         fs.unlinkSync(file_path);
//                       }
//                     } catch (err) {
//                       console.log('err', err);
//                     }
//                   }
//                 }
//               }
//               resolve();
//             })
//             .catch((err) => {
//               console.log('err', err.message);
//             });
//         } else {
//           const video = await Video.findOne({
//             _id: videos[i],
//           });

//           error.push({
//             video: {
//               _id: videos[i],
//               title: video['title'],
//             },
//             error: 'Invalid Permission',
//           });
//           resolve();
//         }
//       });
//       promise_array.push(promise);
//     }
//   }

//   if (pdfs) {
//     for (let i = 0; i < pdfs.length; i++) {
//       const promise = new Promise(async (resolve) => {
//         const pdf = await PDF.findOne({
//           _id: pdfs[i],
//           user: currentUser.id,
//         });

//         if (pdf) {
//           // Duplicated Admin PDF: Garbage Update
//           if (pdf['default_pdf'] || pdf['default_edited']) {
//             Garbage.updateOne(
//               { user: currentUser.id },
//               {
//                 $pull: { edited_pdf: { $in: [pdf['default_pdf']] } },
//               }
//             ).catch((err) => {
//               console.log('default pdf remove err', err.message);
//             });
//           }
//           // Duplicated Normal PDF
//           if (pdf['shared_pdf']) {
//             PDF.updateOne(
//               {
//                 _id: pdf['shared_pdf'],
//                 user: currentUser.id,
//               },
//               {
//                 $unset: { shared_pdf: true },
//                 has_shared: false,
//               }
//             ).catch((err) => {
//               console.log('default pdf remove err', err.message);
//             });
//           }
//           // Team PDF Remove
//           if (pdf['role'] === 'team') {
//             Team.updateOne(
//               { pdfs: pdfs[i] },
//               {
//                 $pull: { pdfs: { $in: [pdfs[i]] } },
//               }
//             ).catch((err) => {
//               console.log('err', err.message);
//             });
//           }
//           // Implement the PDF Logic && File Remove
//           PDF.updateOne({ _id: pdfs[i] }, { $set: { del: true } })
//             .then(async () => {
//               let hasSamePDF = false;
//               const samePdfs = await PDF.find({
//                 del: false,
//                 url: pdf['url'],
//               }).catch((err) => {
//                 console.log('same pdf getting error');
//               });
//               if (samePdfs && samePdfs.length) {
//                 hasSamePDF = true;
//               }
//               if (!hasSamePDF) {
//                 const url = pdf['url'];
//                 if (url.indexOf('teamgrow.s3') > 0) {
//                   s3.deleteObject(
//                     {
//                       Bucket: api.AWS.AWS_S3_BUCKET_NAME,
//                       Key: pdf['key'],
//                     },
//                     function (err, data) {
//                       console.log('err', err);
//                     }
//                   );
//                 }
//               }
//               resolve();
//             })
//             .catch((err) => {
//               console.log('err', err.message);
//             });
//         } else {
//           const pdf = await PDF.findOne({
//             _id: pdfs[i],
//           });

//           error.push({
//             pdf: {
//               _id: pdfs[i],
//               title: pdf['title'],
//             },
//             error: 'Invalid Permission',
//           });
//           resolve();
//         }
//       });
//       promise_array.push(promise);
//     }
//   }

//   if (images) {
//     for (let i = 0; i < images.length; i++) {
//       const promise = new Promise(async (resolve) => {
//         const image = await Image.findOne({
//           _id: images[i],
//           user: currentUser.id,
//         });

//         if (image) {
//           if (image['default_edited']) {
//             Garbage.updateOne(
//               { user: currentUser.id },
//               {
//                 $pull: { edited_image: { $in: [image.default_image] } },
//               }
//             ).catch((err) => {
//               console.log('default image remove err', err.message);
//             });
//           }
//           if (image['shared_image']) {
//             Image.updateOne(
//               {
//                 _id: image.shared_image,
//                 user: currentUser.id,
//               },
//               {
//                 $unset: { shared_image: true },
//                 has_shared: false,
//               }
//             ).catch((err) => {
//               console.log('default image remove err', err.message);
//             });
//           }
//           if (image.role === 'team') {
//             Team.updateOne(
//               { images: images[i] },
//               {
//                 $pull: { images: { $in: [images[i]] } },
//               }
//             ).catch((err) => {
//               console.log('err', err.message);
//             });
//           }

//           Image.updateOne({ _id: images[i] }, { $set: { del: true } }).catch(
//             (err) => {
//               console.log('err', err.message);
//             }
//           );
//           resolve();
//         } else {
//           const image = await Image.findOne({
//             _id: images[i],
//           });

//           error.push({
//             image: {
//               _id: images[i],
//               title: image.title,
//             },
//             error: 'Invalid Permission',
//           });

//           resolve();
//         }
//       });
//       promise_array.push(promise);
//     }
//   }

//   Promise.all(promise_array)
//     .then(() => {
//       return res.json({
//         status: true,
//         failed: error,
//       });
//     })
//     .catch((err) => {
//       console.log('material bulk remove err', err.message);
//       res.status(500).json({
//         status: false,
//         error: err.message,
//       });
//     });
// };

const bulkRemove = async (req, res) => {
  const { videos, pdfs, images, folder, folders } = req.body;
  const { currentUser } = req;
  const errors = [];
  const promise_array = [];

  let allFolders = [];
  let allVideos = videos || [];
  let allPdfs = pdfs || [];
  let allImages = images || [];
  if ((folders || []).length) {
    allFolders = await getAllFolders('material', folders, folders);
  }
  allFolders.forEach((e) => {
    allVideos = [...allVideos, ...e.videos];
    allPdfs = [...allPdfs, ...e.pdfs];
    allImages = [...allImages, ...e.images];
  });

  if (allVideos.length) {
    for (let i = 0; i < allVideos.length; i++) {
      const promise = new Promise(async (resolve) => {
        const video = await Video.findOne({
          _id: allVideos[i],
          user: currentUser.id,
          del: false,
        });

        if (video) {
          const error_message = [];
          const automations = await Automation.find({
            user: currentUser.id,
            'meta.videos': video.id,
            clone_assign: { $ne: true },
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (automations.length > 0) {
            error_message.push({
              reason: 'automations',
              automations,
            });
          }

          const templates = await EmailTemplate.find({
            user: currentUser.id,
            $or: [
              { video_ids: video.id },
              {
                content: {
                  $regex: urls.MAIN_DOMAIN + '/video/' + video.id,
                  $options: 'i',
                },
              },
            ],
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (templates.length > 0) {
            error_message.push({
              reason: 'templates',
              templates,
            });
          }

          const shared_teams = await Team.find({
            videos: video.id,
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (shared_teams.length > 0) {
            error_message.push({
              reason: 'teams',
              shared_teams,
            });
          }

          const garbage = await Garbage.findOne(
            {
              user: currentUser.id,
            },
            { smart_codes: 1, _id: 0 }
          ).catch((err) => {
            console.log('err', err.message);
          });

          if (garbage) {
            const smartCodes = garbage.smart_codes;
            const errSmartCodes = [];
            for (const key in smartCodes) {
              if (
                smartCodes[key].video_ids &&
                smartCodes[key].video_ids.includes(video.id)
              ) {
                errSmartCodes.push(key);
              }
            }

            if (errSmartCodes.length > 0) {
              error_message.push({
                reason: 'smartcodes',
                smartcodes: errSmartCodes,
              });
            }
          }

          if (error_message.length > 0) {
            errors.push({
              material: {
                id: video.id,
                title: video.title,
                type: 'video',
                thumbnail: video.thumbnail,
                preview: video.preview,
              },
              error_message,
            });

            resolve();
          }
          // Team Video Remove
          if (error_message.length === 0) {
            if (video['role'] === 'team') {
              await Team.updateOne(
                { videos: allVideos[i] },
                {
                  $pull: { videos: { $in: [allVideos[i]] } },
                }
              ).catch((err) => {
                console.log('err', err.message);
              });
            }
            // Implement the Video Logic && File Remove
            await Video.updateOne(
              { _id: allVideos[i] },
              { $set: { del: true } }
            )
              .then(async () => {
                let hasSameVideo = false;
                if (video['bucket']) {
                  const sameVideos = await Video.find({
                    del: false,
                    key: video['key'],
                  }).catch((err) => {
                    console.log('same video getting error');
                  });
                  if (sameVideos && sameVideos.length) {
                    hasSameVideo = true;
                  }
                } else {
                  const sameVideos = await Video.find({
                    del: false,
                    url: video['url'],
                  }).catch((err) => {
                    console.log('same video getting error');
                  });
                  if (sameVideos && sameVideos.length) {
                    hasSameVideo = true;
                  }
                }
                if (!hasSameVideo) {
                  if (video['bucket']) {
                    removeFile(
                      'transcoded/' + video['key'] + '.mp4',
                      function (err, data) {
                        errors.push({
                          material: {
                            id: video.id,
                            title: video.title,
                            type: 'video',
                            thumbnail: video.thumbnail,
                            preview: video.preview,
                          },
                          error_message: [{ reason: err }],
                        });
                        resolve();
                        console.log('transcoded video removing error', err);
                      },
                      video['bucket']
                    );

                    emptyBucket(
                      video['bucket'],
                      'streamd/' + video['key'] + '/',
                      (err) => {
                        if (err) {
                          errors.push({
                            material: {
                              id: video.id,
                              title: video.title,
                              type: 'video',
                              thumbnail: video.thumbnail,
                              preview: video.preview,
                            },
                            error_message: [{ reason: err }],
                          });
                          resolve();
                          console.log('Removing files error in bucket');
                        }
                      }
                    );
                  } else {
                    const url = video['url'];
                    if (url.indexOf('teamgrow.s3') > 0) {
                      removeFile(url.slice(44), function (err, data) {
                        errors.push({
                          material: {
                            id: video.id,
                            title: video.title,
                            type: 'video',
                            thumbnail: video.thumbnail,
                            preview: video.preview,
                          },
                          error_message: [{ reason: err }],
                        });
                        resolve();
                        console.log('err', err);
                      });
                    } else {
                      try {
                        const file_path = video.path;
                        if (file_path) {
                          fs.unlinkSync(file_path);
                        }
                      } catch (err) {
                        errors.push({
                          material: {
                            id: video.id,
                            title: video.title,
                            type: 'video',
                            thumbnail: video.thumbnail,
                            preview: video.preview,
                          },
                          error_message: [{ reason: err }],
                        });
                        resolve();
                        console.log('err', err);
                      }
                    }
                  }
                }
                resolve();
              })
              .catch((err) => {
                console.log('err', err.message);
              });
          }
        } else {
          // const video = await Video.findOne({
          //   _id: allVideos[i],
          // });

          // errors.push({
          //   material: {
          //     id: video.id,
          //     title: video.title,
          //     type: 'video',
          //     thumbnail: video.thumbnail,
          //     preview: video.preview,
          //   },
          //   error_message: [{ reason: 'invalid permission' }],
          // });
          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  // work on here
  if (allPdfs.length) {
    for (let i = 0; i < allPdfs.length; i++) {
      const promise = new Promise(async (resolve) => {
        const pdf = await PDF.findOne({
          _id: allPdfs[i],
          user: currentUser.id,
        });

        if (pdf) {
          const error_message = [];
          const automations = await Automation.find({
            user: currentUser.id,
            'meta.pdfs': pdf.id,
            // automations: {
            //   $elemMatch: {
            //     'action.pdfs': { $elemMatch: { $in: [pdf.id] } },
            //   },
            // },
            clone_assign: { $ne: true },
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (automations.length > 0) {
            error_message.push({
              reason: 'automations',
              automations,
            });
          }

          const templates = await EmailTemplate.find({
            user: currentUser.id,
            $or: [
              { pdf_ids: pdf.id },
              {
                content: {
                  $regex: urls.MAIN_DOMAIN + '/pdf/' + pdf.id,
                  $options: 'i',
                },
              },
            ],
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (templates.length > 0) {
            error_message.push({
              reason: 'templates',
              templates,
            });
          }

          const shared_teams = await Team.find({
            pdfs: pdf.id,
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (shared_teams.length > 0) {
            error_message.push({
              reason: 'teams',
              shared_teams,
            });
          }

          const garbage = await Garbage.findOne(
            {
              user: currentUser.id,
            },
            { smart_codes: 1, _id: 0 }
          ).catch((err) => {
            console.log('err', err.message);
          });

          const smartCodes = garbage.smart_codes;
          const errSmartCodes = [];
          for (const key in smartCodes) {
            if (
              smartCodes[key].pdf_ids &&
              smartCodes[key].pdf_ids.includes(pdf.id)
            ) {
              errSmartCodes.push(key);
            }
          }

          if (errSmartCodes.length > 0) {
            error_message.push({
              reason: 'smartcodes',
              smartcodes: errSmartCodes,
            });
          }

          if (error_message.length > 0) {
            errors.push({
              material: {
                id: pdf.id,
                title: pdf.title,
                type: 'pdf',
                thumbnail: pdf.thumbnail,
                preview: pdf.preview,
              },
              error_message,
            });

            resolve();
          }
          // Duplicated Normal PDF
          if (error_message.length === 0) {
            if (pdf['role'] === 'team') {
              await Team.updateOne(
                { pdfs: allPdfs[i] },
                {
                  $pull: { pdfs: { $in: [allPdfs[i]] } },
                }
              ).catch((err) => {
                console.log('err', err.message);
              });
            }
            // Implement the PDF Logic && File Remove
            await PDF.updateOne({ _id: allPdfs[i] }, { $set: { del: true } })
              .then(async () => {
                let hasSamePDF = false;
                const samePdfs = await PDF.find({
                  del: false,
                  url: pdf['url'],
                }).catch((err) => {
                  console.log('same pdf getting error');
                });
                if (samePdfs && samePdfs.length) {
                  hasSamePDF = true;
                }
                if (!hasSamePDF) {
                  const url = pdf['url'];
                  if (url.indexOf('teamgrow.s3') > 0) {
                    removeFile(pdf['key'], function (err, data) {
                      errors.push({
                        material: {
                          id: pdf.id,
                          title: pdf.title,
                          type: 'pdf',
                          thumbnail: pdf.thumbnail,
                          preview: pdf.preview,
                        },
                        error_message: [{ reason: err }],
                      });
                      resolve();
                      console.log('err', err);
                    });
                  }
                }
                resolve();
              })
              .catch((err) => {
                console.log('err', err.message);
              });
          }
        } else {
          // const pdf = await PDF.findOne({
          //   _id: allPdfs[i],
          // });

          // errors.push({
          //   material: {
          //     id: allPdfs[i],
          //     title: pdf['title'],
          //     type: 'pdf',
          //     thumbnail: pdf.thumbnail,
          //     preview: pdf.preview,
          //   },
          //   error: 'Invalid Permission',
          // });
          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  if (allImages.length) {
    for (let i = 0; i < allImages.length; i++) {
      const promise = new Promise(async (resolve) => {
        const image = await Image.findOne({
          _id: allImages[i],
          user: currentUser.id,
        });

        if (image) {
          const error_message = [];
          const automations = await Automation.find({
            user: currentUser.id,
            'meta.images': image.id,
            // automations: {
            //   $elemMatch: {
            //     'action.images': { $elemMatch: { $in: [image.id] } },
            //   },
            // },
            clone_assign: { $ne: true },
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (automations.length > 0) {
            error_message.push({
              reason: 'automations',
              automations,
            });
          }

          const templates = await EmailTemplate.find({
            user: currentUser.id,
            $or: [
              { image_ids: image.id },
              {
                content: {
                  $regex: urls.MAIN_DOMAIN + '/image/' + image.id,
                  $options: 'i',
                },
              },
            ],
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (templates.length > 0) {
            error_message.push({
              reason: 'templates',
              templates,
            });
          }

          const shared_teams = await Team.find({
            images: image.id,
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (shared_teams.length > 0) {
            error_message.push({
              reason: 'teams',
              shared_teams,
            });
          }

          const garbage = await Garbage.findOne(
            {
              user: currentUser.id,
            },
            { smart_codes: 1, _id: 0 }
          ).catch((err) => {
            console.log('err', err.message);
          });

          const smartCodes = garbage.smart_codes;
          const errSmartCodes = [];
          for (const key in smartCodes) {
            if (
              smartCodes[key].image_ids &&
              smartCodes[key].image_ids.includes(image.id)
            ) {
              errSmartCodes.push(key);
            }
          }

          if (errSmartCodes.length > 0) {
            error_message.push({
              reason: 'smartcodes',
              smartcodes: errSmartCodes,
            });
          }

          if (error_message.length > 0) {
            errors.push({
              material: {
                id: image.id,
                title: image.title,
                type: 'image',
                thumbnail: image.thumbnail,
                preview: image.preview,
              },
              error_message,
            });

            resolve();
          }
          if (error_message.length === 0) {
            if (image.role === 'team') {
              await Team.updateOne(
                { images: allImages[i] },
                {
                  $pull: { images: { $in: [allImages[i]] } },
                }
              ).catch((err) => {
                console.log('err', err.message);
              });
            }
            await Image.updateOne({ _id: image.id }, { $set: { del: true } })
              .then(async () => {
                /* Remove Image from s3 if it is not duplicated. */
                if (0 && image.key) {
                  const keys = image.key;
                  for (
                    let key_index = 0;
                    key_index < keys.length;
                    key_index++
                  ) {
                    const key = keys[key_index];
                    let hasSameImage = false;
                    const sameImages = await Image.find({
                      del: false,
                      key: { $in: [key] },
                    }).catch((err) => {
                      console.log('same image getting error');
                    });
                    if (sameImages && sameImages.length) {
                      hasSameImage = true;
                    }
                    if (!hasSameImage) {
                      removeFile(image['key'], function (err, data) {
                        errors.push({
                          material: {
                            id: image.id,
                            title: image.title,
                            type: 'image',
                            thumbnail: image.thumbnail,
                            preview: image.preview,
                          },
                          error_message: [{ reason: err }],
                        });
                        resolve();
                        console.log('err', err);
                      });
                    }
                  }
                }
              })
              .catch((err) => {
                console.log('err', err.message);
              });

            resolve();
          }
        } else {
          // const image = await Image.findOne({
          //   _id: allImages[i],
          // });

          // errors.push({
          //   material: {
          //     id: allImages[i],
          //     title: image.title,
          //     type: 'image',
          //     thumbnail: image.thumbnail,
          //     preview: image.preview,
          //   },
          //   error: 'Invalid Permission',
          // });

          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  Promise.all(promise_array)
    .then(async () => {
      if (!errors.length) {
        if (allFolders.length) {
          await Folder.updateMany(
            { _id: { $in: allFolders } },
            { $set: { del: true } }
          );
        }
        if (folder) {
          await Folder.updateOne(
            { _id: folder },
            {
              $pull: {
                videos: { $in: allVideos },
                pdfs: { $in: allPdfs },
                images: { $in: allImages },
                folders: { $in: allFolders },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $pull: {
                videos: { $in: allVideos },
                pdfs: { $in: allPdfs },
                images: { $in: allImages },
                folders: { $in: allFolders },
              },
            }
          );
        }
      }

      return res.json({
        status: true,
        failed: errors,
      });
    })
    .catch((err) => {
      console.log('material bulk remove err', err.message);
      sendErrorToSentry(currentUser, err);
      res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const updateFolders = async (req, res) => {
  const { currentUser } = req;
  const { ids, data } = req.body;
  const { title } = data;
  const folders = await Folder.find({
    _id: { $in: ids },
    user: currentUser._id,
  }).catch((err) => {
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });
  for (let i = 0; i < folders.length; i++) {
    let _title = title;
    if (i) {
      _title = title + ` (${i})`;
    }
    folders[i]['title'] = _title;
    await folders[i].save();
  }

  return res.send({
    status: true,
  });
};
const removeFolders = async (req, res) => {
  const { currentUser } = req;
  const { folder, ids, mode, target } = req.body;

  const folder_list = await Folder.find({
    _id: { $in: ids },
    user: currentUser._id,
  }).catch((err) => {
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });

  let videos = [];
  let pdfs = [];
  let images = [];
  let folders = [];
  for (let i = 0; i < folder_list.length; i++) {
    const e = folder_list[i];
    videos = [...videos, ...e.videos];
    pdfs = [...pdfs, ...e.pdfs];
    images = [...images, ...e.images];
    folders = [...folders, ...e.folders];
  }

  if (mode === 'remove-all') {
    bulkRemove(
      {
        currentUser,
        body: { folder, folders: ids },
      },
      res
    );
  } else if (mode === 'move-other') {
    await Folder.updateMany(
      {
        _id: { $in: ids },
        user: currentUser._id,
      },
      {
        $set: { del: true },
      }
    )
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                videos: { $each: videos },
                images: { $each: images },
                pdfs: { $each: pdfs },
                folders: { $each: folders },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $addToSet: {
                videos: { $each: videos },
                images: { $each: images },
                pdfs: { $each: pdfs },
                folders: { $each: folders },
              },
            }
          );
        }
        if (folder) {
          await Folder.updateOne(
            { _id: folder },
            {
              $pull: {
                folders: { $in: ids },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $pull: {
                folders: { $in: ids },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const leadCapture = async (req, res) => {
  const { currentUser } = req;
  const { ids, capture_form, enabled_capture } = req.body;
  await Video.updateMany(
    { _id: { $in: ids } },
    { $set: { capture_form, enabled_capture } }
  ).catch((err) => {
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });
  await PDF.updateMany(
    { _id: { $in: ids } },
    { $set: { capture_form, enabled_capture } }
  ).catch((err) => {
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });
  await Image.updateMany(
    { _id: { $in: ids } },
    { $set: { capture_form, enabled_capture } }
  ).catch((err) => {
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });
  return res.send({
    status: true,
  });
};

const bulkDownload = async (req, res) => {
  const { currentUser } = req;
  const { materials } = req.body;
  const ownVideosCount = await Video.countDocuments({
    user: currentUser._id,
    del: false,
  });
  const ownPdfsCount = await PDF.countDocuments({
    user: currentUser._id,
    del: false,
  });
  const ownImagesCount = await Image.countDocuments({
    user: currentUser._id,
    del: false,
  });

  if (!currentUser.material_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable materials',
    });
  }

  const count = ownVideosCount + ownPdfsCount + ownImagesCount;
  if (
    currentUser.material_info['is_limit'] &&
    currentUser.material_info.upload_max_count <= count
  ) {
    return res.status(412).send({
      status: false,
      error: 'Exceed upload max materials',
    });
  }

  const videos = [];
  const pdfs = [];
  const images = [];
  materials.forEach((material) => {
    delete material['_id'];
    material['user'] = currentUser._id;
    material['created_at'] = new Date();
    if (material.material_type === 'video') {
      videos.push(material);
    } else if (material.material_type === 'pdf') {
      pdfs.push(material);
    } else if (material.material_type === 'image') {
      images.push(material);
    }
  });
  const videoIds = [];
  const pdfIds = [];
  const imageIds = [];
  await Video.insertMany(videos).then((data) => {
    data.forEach((e) => {
      videoIds.push(e._id);
    });
  });
  await PDF.insertMany(pdfs).then((data) => {
    data.forEach((e) => {
      pdfIds.push(e._id);
    });
  });
  await Image.insertMany(images).then((data) => {
    data.forEach((e) => {
      imageIds.push(e._id);
    });
  });
  await Folder.updateOne(
    {
      user: currentUser.id,
      rootFolder: true,
    },
    {
      $addToSet: {
        videos: { $each: videoIds },
        images: { $each: imageIds },
        pdfs: { $each: pdfIds },
      },
    }
  );
  return res.send({
    status: true,
  });
};

const downloadFolder = async (req, res) => {
  const { currentUser } = req;
  const { folders } = req.body;

  const folderDocs = await Folder.find({
    _id: { $in: folders },
    user: { $ne: currentUser._id },
  }).catch((err) => {
    console.log('folder load', err);
  });

  const promises = [];
  let curFolders = folderDocs;
  while (curFolders.length) {
    let nextFolders = [];
    (curFolders || []).forEach((_folder) => {
      const createPromise = new Promise((resolve, reject) => {
        const newFolder = { ..._folder._doc };
        newFolder.original_id = _folder._id;
        delete newFolder.role;
        delete newFolder._id;
        delete newFolder.videos;
        delete newFolder.pdfs;
        delete newFolder.images;
        delete newFolder.folders;
        newFolder.user = currentUser._id;
        new Folder(newFolder)
          .save()
          .then(async (_newFolder) => {
            const materialPromises = [];

            const _folderDocs = await Folder.find({
              _id: { $in: _folder.folders },
              type: 'material',
              user: { $ne: currentUser._id },
            }).catch((err) => {
              console.log('video load', err);
            });
            nextFolders = [...nextFolders, ..._folderDocs];
            (_folderDocs || []).forEach((infolder) => {
              const folderPromise = new Promise((resolve, reject) => {
                const newInfolder = { ...infolder._doc };
                newInfolder.original_id = infolder._id;
                delete newInfolder.role;
                delete newInfolder._id;
                newInfolder.user = currentUser._id;
                new Folder(newInfolder)
                  .save()
                  .then((_newInfolder) => {
                    resolve({ id: _newInfolder._id, type: 'folder' });
                  })
                  .catch(() => {
                    reject();
                  });
              });
              materialPromises.push(folderPromise);
            });

            const videoDocs = await Video.find({
              _id: { $in: _folder.videos },
              user: { $ne: currentUser._id },
            }).catch((err) => {
              console.log('video load', err);
            });
            (videoDocs || []).forEach((video) => {
              const videoPromise = new Promise((resolve, reject) => {
                const newVideo = { ...video._doc };
                newVideo.original_id = video._id;
                delete newVideo.role;
                delete newVideo._id;
                newVideo.user = currentUser._id;
                if (video.capture_form) {
                  if (typeof video.capture_form === 'string') {
                    newVideo.capture_form = {};
                    newVideo.capture_form[video.capture_form] = 0;
                  } else if (Array.isArray(video.capture_form)) {
                    newVideo.capture_form = {};
                    video.capture_form.forEach((e) => {
                      newVideo.capture_form[e] = 0;
                    });
                  }
                }
                new Video(newVideo)
                  .save()
                  .then((_newVideo) => {
                    resolve({ id: _newVideo._id, type: 'video' });
                  })
                  .catch(() => {
                    reject();
                  });
              });
              materialPromises.push(videoPromise);
            });

            const pdfDocs = await PDF.find({
              _id: { $in: _folder.pdfs },
              user: { $ne: currentUser._id },
            }).catch((err) => {
              console.log('pdf load', err);
            });
            (pdfDocs || []).forEach((pdf) => {
              const pdfPromise = new Promise((resolve, reject) => {
                const newPdf = { ...pdf._doc };
                newPdf.original_id = pdf._id;
                delete newPdf.role;
                delete newPdf._id;
                newPdf.user = currentUser._id;
                if (newPdf.capture_form) {
                  if (typeof newPdf.capture_form === 'string') {
                    const capture_form = {};
                    capture_form[newPdf['capture_form']] = 0;
                    newPdf['capture_form'] = capture_form;
                  } else if (Array.isArray(newPdf.capture_form)) {
                    const capture_form = {};
                    newPdf.capture_form.forEach((e) => {
                      capture_form[e] = 0;
                    });
                    newPdf.capture_form = capture_form;
                  }
                }
                new PDF(newPdf)
                  .save()
                  .then((_newPdf) => {
                    resolve({ id: _newPdf._id, type: 'pdf' });
                  })
                  .catch(() => {
                    reject();
                  });
              });
              materialPromises.push(pdfPromise);
            });

            const imageDocs = await Image.find({
              _id: { $in: _folder.images },
              user: { $ne: currentUser._id },
            }).catch((err) => {
              console.log('image load', err);
            });
            (imageDocs || []).forEach((image) => {
              const imagePromise = new Promise((resolve, reject) => {
                const newImage = { ...image._doc };
                newImage.original_id = image._id;
                delete newImage.role;
                delete newImage._id;
                newImage.user = currentUser._id;
                if (newImage.capture_form) {
                  if (typeof newImage.capture_form === 'string') {
                    const capture_form = {};
                    capture_form[newImage['capture_form']] = 0;
                    newImage['capture_form'] = capture_form;
                  } else if (Array.isArray(newImage.capture_form)) {
                    const capture_form = {};
                    newImage.capture_form.forEach((e) => {
                      capture_form[e] = 0;
                    });
                    newImage.capture_form = capture_form;
                  }
                }
                new Image(newImage)
                  .save()
                  .then((_newImage) => {
                    resolve({ id: _newImage._id, type: 'image' });
                  })
                  .catch(() => {
                    reject();
                  });
              });
              materialPromises.push(imagePromise);
            });

            Promise.all(materialPromises).then(async (materials) => {
              const videos = materials.filter((item) => item.type === 'video');
              const videoIds = videos.map((item) => item.id);
              const pdfs = materials.filter((item) => item.type === 'pdf');
              const pdfIds = pdfs.map((item) => item.id);
              const images = materials.filter((item) => item.type === 'image');
              const imageIds = images.map((item) => item.id);
              const _folders = materials.filter(
                (item) => item.type === 'folder'
              );
              const folderIds = _folders.map((item) => item.id);

              _newFolder.videos = videoIds;
              _newFolder.pdfs = pdfIds;
              _newFolder.images = imageIds;
              _newFolder.folders = folderIds;
              await _newFolder.save().catch(() => {
                console.log('material register failed');
              });
              if (folders.includes(_newFolder.original_id?.toString())) {
                resolve({ id: _newFolder._id });
              } else {
                resolve();
              }
            });
          })
          .catch(() => {
            reject();
          });
      });
      promises.push(createPromise);
    });
    curFolders = nextFolders;
  }

  Promise.all(promises).then(async (data) => {
    const ids = [];
    data.forEach((e) => {
      if (e && e.id) {
        ids.push(e.id);
      }
    });
    await Folder.updateOne(
      { user: currentUser.id, rootFolder: true },
      {
        $addToSet: { folders: { $each: ids } },
      }
    );
    return res.send({
      status: true,
    });
  });
};

const updateMaterialTheme = async (req, res) => {
  const { materials, theme, view_mode } = req.body;
  const video_materials = [];
  const pdf_materials = [];
  const img_materials = [];

  materials.forEach((material) => {
    if (material.material_type === 'video') {
      video_materials.push(material._id);
    } else if (material.material_type === 'pdf') {
      pdf_materials.push(material._id);
    } else if (material.material_type === 'image') {
      img_materials.push(material._id);
    }
  });

  try {
    if (video_materials.length > 0) {
      const query = { _id: { $in: video_materials } };
      await Video.updateMany(query, { $set: { material_theme: theme } });
    }
    if (pdf_materials.length > 0) {
      const query = { _id: { $in: pdf_materials } };
      if (view_mode)
        await PDF.updateMany(query, {
          $set: { material_theme: theme, view_mode },
        });
      else await PDF.updateMany(query, { $set: { material_theme: theme } });
    }
    if (img_materials.length > 0) {
      const query = { _id: { $in: img_materials } };
      await Image.updateMany(query, { $set: { material_theme: theme } });
    }
    return res.status(200).json({
      status: true,
    });
  } catch (e) {
    return res.status(400).json({
      status: false,
      error: e,
    });
  }
};

const getLibraryFolderMaterial = async (data) => {
  const video_query = {
    $and: [{ _id: { $in: data.folder.videos } }, { del: false }],
  };
  const pdf_query = {
    $and: [{ _id: { $in: data.folder.pdfs } }, { del: false }],
  };
  const image_query = {
    $and: [{ _id: { $in: data.folder.images } }, { del: false }],
  };
  const folder_query = {
    $and: [
      { _id: { $in: data.folder.folders } },
      { type: 'material' },
      { del: false },
    ],
  };
  const team_video_query = {
    $and: [{ del: false }],
  };
  const team_pdf_query = {
    $and: [{ del: false }],
  };
  const team_image_query = {
    $and: [{ del: false }],
  };
  const team_folder_query = {
    $and: [{ del: false }],
  };

  let team_videos = [];
  let team_pdfs = [];
  let team_images = [];
  let team_folders = [];
  if (data.root) {
    if (data.teamOptions.length) {
      data.team.forEach((e) => {
        if (data.teamOptions.includes(e._id)) {
          team_videos = [...team_videos, ...e.videos];
          team_pdfs = [...team_pdfs, ...e.pdfs];
          team_images = [...team_images, ...e.images];
          team_folders = [...team_folders, ...e.folders];
        }
      });
    } else {
      data.team.forEach((e) => {
        team_videos = [...team_videos, ...e.videos];
        team_pdfs = [...team_pdfs, ...e.pdfs];
        team_images = [...team_images, ...e.images];
        team_folders = [...team_folders, ...e.folders];
      });
    }
    const _video_query = { _id: { $in: team_videos } };
    team_video_query['$and'].push(_video_query);

    const _pdf_query = { _id: { $in: team_pdfs } };
    team_pdf_query['$and'].push(_pdf_query);

    const _image_query = { _id: { $in: team_images } };
    team_image_query['$and'].push(_image_query);

    const _folder_query = { _id: { $in: team_folders } };
    team_folder_query['$and'].push(_folder_query);
  }

  if (data.search) {
    const _query = {
      title: { $regex: `.*${data.search}.*`, $options: 'i' },
    };
    video_query['$and'].push(_query);
    pdf_query['$and'].push(_query);
    image_query['$and'].push(_query);
    folder_query['$and'].push(_query);
    team_video_query['$and'].push(_query);
    team_pdf_query['$and'].push(_query);
    team_image_query['$and'].push(_query);
    team_folder_query['$and'].push(_query);
  }

  if (data.userOptions.length) {
    const _query = {
      user: { $in: data.userOptions },
    };
    video_query['$and'].push(_query);
    pdf_query['$and'].push(_query);
    image_query['$and'].push(_query);
    folder_query['$and'].push(_query);
    team_video_query['$and'].push(_query);
    team_pdf_query['$and'].push(_query);
    team_image_query['$and'].push(_query);
    team_folder_query['$and'].push(_query);
  }

  const admin_videos = await Video.find(video_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const admin_pdfs = await PDF.find(pdf_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const admin_images = await Image.find(image_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const admin_folders = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _team_videos = await Video.find(team_video_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _team_pdfs = await PDF.find(team_pdf_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _team_images = await Image.find(team_image_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const _team_folders = await Folder.find(team_folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const videos = [...admin_videos, ..._team_videos];
  const pdfs = [...admin_pdfs, ..._team_pdfs];
  const images = [...admin_images, ..._team_images];
  const folders = [...admin_folders, ..._team_folders];
  const result = {
    videos,
    pdfs,
    images,
    folders,
  };
  return result;
};

const getActivities = async (req, res) => {
  const { currentUser } = req;
  const { duration } = req.body;
  const date = moment().subtract(duration, 'days').toDate();

  const videoIds = [];
  const pdfIds = [];
  const imageIds = [];
  const video_activities = await Activity.aggregate([
    {
      $match: {
        type: 'videos',
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$videos',
        count: { $sum: 1 },
      },
    },
  ]).catch((err) => {
    console.log('get video sent activities failed', err);
  });
  const pdf_activities = await Activity.aggregate([
    {
      $match: {
        type: 'pdfs',
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$pdfs',
        count: { $sum: 1 },
      },
    },
  ]).catch((err) => {
    console.log('get pdf sent activities failed', err);
  });
  const image_activities = await Activity.aggregate([
    {
      $match: {
        type: 'images',
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$images',
        count: { $sum: 1 },
      },
    },
  ]).catch((err) => {
    console.log('get image sent activities failed', err);
  });
  video_activities.forEach((e) => {
    if (e._id[0] && !videoIds.includes(e._id[0]?.toString())) {
      videoIds.push(e._id[0].toString());
    }
  });
  pdf_activities.forEach((e) => {
    if (e._id[0] && !pdfIds.includes(e._id[0]?.toString())) {
      pdfIds.push(e._id[0].toString());
    }
  });
  image_activities.forEach((e) => {
    if (e._id[0] && !imageIds.includes(e._id[0]?.toString())) {
      imageIds.push(e._id[0].toString());
    }
  });

  const video_trackers = await VideoTracker.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$video',
        count: { $sum: 1 },
      },
    },
  ]).catch((err) => {
    console.log('get video tracker count failed', err);
  });
  const pdf_trackers = await PDFTracker.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$pdf',
        count: { $sum: 1 },
      },
    },
  ]).catch((err) => {
    console.log('get pdf tracker count failed', err);
  });
  const image_trackers = await ImageTracker.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        created_at: { $gte: date },
      },
    },
    {
      $group: {
        _id: '$image',
        count: { $sum: 1 },
      },
    },
  ]).catch((err) => {
    console.log('get image tracker count failed', err);
  });
  video_trackers.forEach((e) => {
    if (!videoIds.includes(e._id.toString())) {
      videoIds.push(e._id.toString());
    }
  });
  pdf_trackers.forEach((e) => {
    if (!pdfIds.includes(e._id.toString())) {
      pdfIds.push(e._id.toString());
    }
  });
  image_trackers.forEach((e) => {
    if (!imageIds.includes(e._id.toString())) {
      imageIds.push(e._id.toString());
    }
  });
  const videos = await Video.find({ _id: { $in: videoIds } })
    .select('title thumbnail')
    .catch((err) => {
      console.log('videos not found', err);
    });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } })
    .select('title thumbnail')
    .catch((err) => {
      console.log('pdfs not found', err);
    });
  const images = await Image.find({ _id: { $in: imageIds } })
    .select('title thumbnail')
    .catch((err) => {
      console.log('images not found', err);
    });

  const data = [];
  (videos || []).forEach((e) => {
    const detail = { ...e._doc, type: 'video', sent: 0, trackers: 0 };
    const activity_index = video_activities.findIndex(
      (activity) =>
        activity._id[0] && activity._id[0]?.toString() === e._id.toString()
    );
    if (activity_index !== -1) {
      detail['sent'] = video_activities[activity_index].count;
    }
    const tracker_index = video_trackers.findIndex(
      (tracker) => tracker._id.toString() === e._id.toString()
    );
    if (tracker_index !== -1) {
      detail['trackers'] = video_trackers[tracker_index].count;
    }
    data.push(detail);
  });
  (pdfs || []).forEach((e) => {
    const detail = { ...e._doc, type: 'pdf', sent: 0, trackers: 0 };
    const activity_index = pdf_activities.findIndex(
      (activity) =>
        activity._id[0] && activity._id[0]?.toString() === e._id.toString()
    );
    if (activity_index !== -1) {
      detail['sent'] = pdf_activities[activity_index].count;
    }
    const tracker_index = pdf_trackers.findIndex(
      (tracker) => tracker._id.toString() === e._id.toString()
    );
    if (tracker_index !== -1) {
      detail['trackers'] = pdf_trackers[tracker_index].count;
    }
    data.push(detail);
  });
  (images || []).forEach((e) => {
    const detail = { ...e._doc, type: 'image', sent: 0, trackers: 0 };
    const activity_index = image_activities.findIndex(
      (activity) =>
        activity._id[0] && activity._id[0]?.toString() === e._id.toString()
    );
    if (activity_index !== -1) {
      detail['sent'] = image_activities[activity_index].count;
    }
    const tracker_index = image_trackers.findIndex(
      (tracker) => tracker._id.toString() === e._id.toString()
    );
    if (tracker_index !== -1) {
      detail['trackers'] = image_trackers[tracker_index].count;
    }
    data.push(detail);
  });

  return res.send({
    status: true,
    data,
  });
};

const getAnalyticsOnType = async (req, res) => {
  const { currentUser } = req;
  const { id, materialType } = req.params;
  const { skip, pageSize, type, includeAnonymous } = req.body;
  const Model = TrackerModels[materialType];
  const typeFiled = `${materialType}s`;
  let result = [];
  let watched_contacts = [];
  const query = {
    [materialType]: id,
    user: currentUser.id,
  };
  switch (type) {
    case 'sent':
      result = await Activity.find({
        [typeFiled]: id,
        user: currentUser.id,
        type: typeFiled,
        $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
      })
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate({
          path: 'contacts',
          select: '_id first_name last_name label email',
        });

      break;
    case 'contact':
      watched_contacts = await Model.aggregate([
        {
          $match: {
            [materialType]: mongoose.Types.ObjectId(id),
            user: mongoose.Types.ObjectId(currentUser.id),
          },
        },
        {
          $group: {
            _id: { contact: '$contact' },
            duration: { $last: '$duration' },
            last_watch_at: { $last: '$last_watch_at' },
            updated_at: { $last: '$updated_at' },
          },
        },
        {
          $match: { '_id.contact.0': { $exists: true } },
        },
      ])
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(pageSize);
      result = await Contact.populate(watched_contacts, {
        path: '_id.contact',
        select: '_id first_name last_name',
      });

      break;
    case 'watch':
      if (!includeAnonymous) {
        query.contact = { $ne: [] };
      }
      result = await Model.find(query)
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate({
          path: 'contact',
          model: Contact,
          select: '_id first_name last_name label email',
        });
      break;

    default:
      break;
  }

  return res.send({
    status: true,
    data: result,
  });
};

module.exports = {
  bulkEmail,
  bulkText,
  registerSendToken,
  socialShare,
  thumbsUp,
  load,
  loadLibrary,
  createFolder,
  editFolder,
  removeFolder,
  moveMaterials,
  bulkRemove,
  updateFolders,
  removeFolders,
  listOwnMaterials,
  listLibraryMaterials,
  easyLoadMaterials,
  loadFolderVideos,
  leadCapture,
  downloadFolder,
  updateMaterialTheme,
  bulkDownload,
  loadOwn,
  loadViews,
  loadFolders,
  moveFiles,
  getParentFolderId,
  getActivities,
  loadLibraryFolderList,
  loadTrackCount,
  getAnalyticsOnType,
  toggleEnableNotification,
};
