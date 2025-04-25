const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v1: uuidv1 } = require('uuid');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const Base64 = require('js-base64').Base64;
const request = require('request-promise');
const Activity = require('../models/activity');
const Video = require('../models/video');
const Folder = require('../models/folder');
const VideoTracker = require('../models/video_tracker');
const Garbage = require('../models/garbage');
const Contact = require('../models/contact');
const Team = require('../models/team');
const User = require('../models/user');
const EmailTemplate = require('../models/email_template');
const Automation = require('../models/automation');
const { TEMP_PATH, PLAY_BUTTON_PATH } = require('../configs/path');
const urls = require('../constants/urls');
const api = require('../configs/api');
const system_settings = require('../configs/system_settings');
const { emptyBucket } = require('./material');
const garbageHelper = require('../helpers/garbage');
const videoHelper = require('../helpers/video');
const { uploadBase64Image, removeFile } = require('../helpers/fileUpload');
const { checkMaterialCount } = require('../helpers/material');
const { userProfileOutputGuard } = require('../helpers/user');
const { replaceToken } = require('../helpers/utility');
const { createCanvas, loadImage } =
  process.env.CANVAS !== 'virtual'
    ? require('canvas')
    : { createCanvas: () => {}, loadImage: () => {} };

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const create = async (req, res) => {
  const { currentUser } = req;

  await checkMaterialCount(currentUser, res);

  if (req.file) {
    const file_name = req.file.filename;

    const video = new Video({
      user: req.currentUser.id,
      url: urls.VIDEO_URL + file_name,
      type: req.file.mimetype,
      path: req.file.path,
      key: req.file.key,
      created_at: new Date(),
    });

    const _video = await video
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });
    await Folder.updateOne(
      {
        user: currentUser._id,
        rootFolder: true,
      },
      { $addToSet: { videos: { $each: [_video._id] } } }
    );
    res.send({
      status: true,
      data: _video,
    });
  }
};

/**
 * Create the video document: Social Video creation, Duplicate the video, Download the Video
 * @param {*} req
 * @param {*} res
 */
const createVideo = async (req, res) => {
  let preview;
  const imageData = {};
  const { currentUser } = req;

  await checkMaterialCount(currentUser, res);

  if (req.body.thumbnail) {
    if (req.body.thumbnail.startsWith('data:image')) {
      try {
        const today = new Date();
        const year = today.getYear();
        const month = today.getMonth();
        const thumbnail_image = await uploadBase64Image(
          req.body.thumbnail,
          'thumbnail' + year + '/' + month
        );
        imageData['thumbnail'] = thumbnail_image;
      } catch (error) {
        console.error('Upload Video Thumbnail Image', error);
      }
    } else if (req.body.thumbnail.startsWith('http')) {
      imageData['thumbnail'] = req.body.thumbnail;
    }
    const resImage = await generateRelatedImages(req.body.thumbnail).catch(
      () => {
        console.log('image generation is failed');
      }
    );
    if (resImage) {
      imageData['site_image'] = resImage;
    }
    imageData['preview'] = imageData['site_image'] || imageData['thumbnail'];
  }

  const video = new Video({
    ...req.body,
    ...imageData,
    converted: 'completed',
    user: currentUser.id,
    created_at: new Date(),
  });

  const _video = await video
    .save()
    .then()
    .catch((err) => {
      console.log('err', err);
    });
  const response = { ..._video._doc };

  if (req.body.folder) {
    const updateResult = await Folder.updateOne(
      { _id: req.body['folder'], user: currentUser._id },
      { $addToSet: { videos: { $each: [video._id] } } }
    );
    if (updateResult && updateResult.nModified) {
      response['folder'] = req.body.folder;
    }
  } else {
    await Folder.updateOne(
      {
        user: currentUser._id,
        rootFolder: true,
      },
      { $addToSet: { videos: { $each: [video._id] } } }
    );
  }

  return res.send({
    status: true,
    data: response,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const editData = { ...req.body };
  delete editData.site_image;
  delete editData.thumbnail;

  const video = await Video.findOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('err', err.message);
  });
  if (!video) {
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }
  if (req.body.thumbnail && req.body.thumbnail.startsWith('data:image')) {
    const resImage = await generateRelatedImages(req.body.thumbnail).catch(
      () => {
        console.log('image generation is failed');
      }
    );
    if (resImage) {
      editData['site_image'] = resImage;
    }
    try {
      const today = new Date();
      const year = today.getYear();
      const month = today.getMonth();
      const thumbnail_image = await uploadBase64Image(
        req.body.thumbnail,
        'thumbnail' + year + '/' + month
      );
      editData['thumbnail'] = thumbnail_image;
    } catch (error) {
      console.error('Upload Video Thumbnail Image', error);
    }
    if (!video['preview']) {
      editData['preview'] = editData['site_image'] || editData['thumbnail'];
    }
  }
  for (const key in editData) {
    video[key] = editData[key];
  }

  video
    .save()
    .then((_video) => {
      return res.send({
        status: true,
        data: _video,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
    });
};

const updateDetail = async (req, res) => {
  const editData = { ...req.body };
  delete editData.site_image;
  delete editData.thumbnail;
  const { currentUser } = req;
  const video = await Video.findOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('video found err', err.message);
  });

  if (!video) {
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }

  if (req.body.thumbnail) {
    if (req.body.thumbnail.startsWith('data:image')) {
      try {
        const today = new Date();
        const year = today.getYear();
        const month = today.getMonth();
        const thumbnail_image = await uploadBase64Image(
          req.body.thumbnail,
          'thumbnail' + year + '/' + month
        );
        editData['thumbnail'] = thumbnail_image;
      } catch (error) {
        console.error('Upload Video Thumbnail Image', error);
      }
    } else if (req.body.thumbnail.startsWith('http')) {
      editData['thumbnail'] = req.body.thumbnail;
    }
    if (video['thumbnail'] !== req.body.thumbnail) {
      const resImage = await generateRelatedImages(req.body.thumbnail).catch(
        () => {
          console.log('image generation is failed');
        }
      );
      if (resImage) {
        editData['site_image'] = resImage;
        editData['preview'] = editData['site_image'] || editData['thumbnail'];
      }
      video['version'] += 1;
    }
  }

  for (const key in editData) {
    video[key] = editData[key];
  }
  if (!editData['converted']) {
    video['converted'] = 'progress';
  }

  if (editData['folder']) {
    await Folder.updateOne(
      { _id: editData['folder'], user: currentUser._id },
      { $addToSet: { videos: { $each: [video._id] } } }
    );
  }

  video['updated_at'] = new Date();
  video
    .save()
    .then(async (_video) => {
      await Folder.updateOne(
        {
          user: currentUser._id,
          rootFolder: true,
        },
        { $addToSet: { videos: { $each: [_video._id] } } }
      );
      return res.send({
        status: true,
        data: _video,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      return res.status(400).json({
        status: false,
        error: err.message,
      });
    });
};

const updateConvertStatus = async (req, res) => {
  const { currentUser } = req;
  const status = { ...req.body };
  const video = await Video.findOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('err', err.message);
  });

  if (!video) {
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }

  if (status) {
    if (status['preview']) {
      video['preview'] =
        'https://teamgrow.s3.us-east-2.amazonaws.com/preview/' +
        video['key'] +
        '.gif';
    }
    if (status['converted'] === 100) {
      video['url'] =
        api.AWS.CLOUDFRONT + '/transcoded/' + video['key'] + '.mp4';
      video['converted'] = 'completed';
    }
    if (status['streamd'] === 100) {
      video['url'] =
        api.AWS.CLOUDFRONT +
        '/streamd/' +
        video['key'] +
        '/' +
        video['key'] +
        '.m3u8';
      video['converted'] = 'completed';
    }

    video.save().then(() => {
      return res.send({
        status: true,
        data: video._doc,
      });
    });
  }
};

const get = async (req, res) => {
  const withPublicUrl = req.query.with;
  const video = await Video.findOne({ _id: req.params.id, del: false });
  const user = await User.findOne({ _id: video.user });
  if (!video) {
    return res.status(400).json({
      status: false,
      error: 'Video doesn`t exist',
    });
  }
  const myJSON = JSON.stringify(video);
  let data = JSON.parse(myJSON);
  if (withPublicUrl) {
    data = await videoHelper.getVideoPublicUrl(data);
  }
  Object.assign(data, { user });

  res.send({
    status: true,
    data,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const garbage = await garbageHelper.get(currentUser);
  let editedVideos = [];
  if (garbage && garbage['edited_video']) {
    editedVideos = garbage['edited_video'];
  }

  const company = currentUser.company || 'eXp Realty';
  const _video_list = await Video.find({ user: currentUser.id, del: false })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  const _video_admin = await Video.find({
    role: 'admin',
    del: false,
    _id: { $nin: editedVideos },
    company,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  Array.prototype.push.apply(_video_list, _video_admin);

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  }).populate('videos');

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      Array.prototype.push.apply(_video_list, team.videos);
    }
  }

  if (!_video_list) {
    return res.status(400).json({
      status: false,
      error: 'Video doesn`t exist',
    });
  }
  const _video_detail_list = [];

  for (let i = 0; i < _video_list.length; i++) {
    const count = await VideoTracker.countDocuments({
      video: _video_list[i]._id,
      user: currentUser._id,
    });

    const video_detail = { ..._video_list[i]._doc, views: count };
    _video_detail_list.push(video_detail);
  }

  return res.send({
    status: true,
    data: _video_detail_list,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  try {
    const video = await Video.findOne({
      _id: req.params.id,
      user: currentUser.id,
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
              $options: 'gi',
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
        return res.json({
          status: true,
          failed: [
            {
              material: {
                id: video.id,
                title: video.title,
                type: 'video',
                thumbnail: video.thumbnail,
                preview: video.preview,
              },
              error_message,
            },
          ],
        });
      }
      if (video.role === 'team') {
        Team.updateOne(
          { videos: req.params.id },
          {
            $pull: { videos: { $in: [req.params.id] } },
          }
        ).catch((err) => {
          console.log('err', err.message);
        });
      }

      Video.updateOne({ _id: req.params.id }, { $set: { del: true } })
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
                  console.log('transcoded video removing error', err);
                },
                video['bucket']
              );
              emptyBucket(
                video['bucket'],
                'streamd/' + video['key'] + '/',
                (err) => {
                  if (err) {
                    console.log('Removing files error in bucket');
                  }
                }
              );
            } else {
              const url = video['url'];
              if (url.indexOf('teamgrow.s3') > 0) {
                removeFile(url.slice(44), function (err, data) {
                  console.log('err', err);
                });
              } else {
                try {
                  const file_path = video.path;
                  if (file_path) {
                    fs.unlinkSync(file_path);
                  }
                } catch (err) {
                  console.log('err', err);
                }
              }
            }
          }
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.log('err', err.message);
          return res.status(500).send({
            status: true,
            error: err.message,
          });
        });
    } else {
      res.status(400).send({
        status: false,
        error: 'Invalid permission.',
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).send({
      status: false,
      error: 'internal_server_error',
    });
  }
};

const getAnalytics = async (req, res) => {
  const { currentUser } = req;

  const video = await Video.findOne({ _id: req.params.id });
  const sent_activity = await Activity.find({
    videos: req.params.id,
    user: currentUser.id,
    type: 'videos',
    $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
  }).populate('contacts');

  const watched_activity = await VideoTracker.find({
    video: req.params.id,
    user: currentUser.id,
  }).populate({ path: 'contact', model: Contact });

  const watched_contacts = await VideoTracker.aggregate([
    {
      $match: {
        video: mongoose.Types.ObjectId(req.params.id),
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
  ]);

  const contacts_detail = await Contact.populate(watched_contacts, {
    path: '_id.contact',
  });

  const track_activity = await Activity.find({
    videos: req.params.id,
    user: currentUser.id,
    type: 'videos',
    content: 'generated link',
  })
    .populate('contacts')
    .populate({ path: 'video_trackers', model: VideoTracker });
  return res.send({
    status: true,
    data: {
      video,
      sent_activity,
      watched_activity,
      watched_contacts: contacts_detail,
      track_activity,
    },
  });
};

const createSmsContent = async (req, res) => {
  const { currentUser } = req;
  const { content, subject, videos, contacts } = req.body;

  const _contact = await Contact.findOne({ _id: contacts[0] }).catch((err) => {
    console.log('err', err);
  });

  let video_titles = '';
  let video_descriptions = '';
  let video_objects = '';
  const video_subject = '';
  let video_content = content;
  let activity;
  let assignee;
  if (_contact.owner) {
    assignee = await User.findOne({
      _id: _contact.owner,
    });
  }
  for (let j = 0; j < videos.length; j++) {
    const video = videos[j];

    if (typeof video_content === 'undefined') {
      video_content = '';
    }

    const tokenData = {
      currentUser,
      contact: _contact,
      assignee,
    };
    video_content = replaceToken(video_content, tokenData);

    const _activity = new Activity({
      content: 'sent video using sms',
      contacts: contacts[0],
      user: currentUser.id,
      type: 'videos',
      videos: video._id,
      created_at: new Date(),
      updated_at: new Date(),
      description: video_content,
    });

    activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err.message);
      });
    const material_view_video_link =
      currentUser.source === 'vortex'
        ? urls.VORTEX_MATERIAL_VIEW_VIDEO_URL
        : urls.MATERIAL_VIEW_VIDEO_URL;
    const video_link = material_view_video_link + activity.id;

    if (j < videos.length - 1) {
      video_titles = video_titles + video.title + ', ';
      video_descriptions += `${video.description}, `;
    } else {
      video_titles += video.title;
      video_descriptions += video.description;
    }
    const video_object = `\n${video.title}:\n${video_link}\n`;
    video_objects += video_object;
  }

  if (video_content.search(/{video_object}/gi) !== -1) {
    video_content = video_content.replace(/{video_object}/gi, video_objects);
  } else {
    video_content += video_objects;
  }

  if (video_content.search(/{video_title}/gi) !== -1) {
    video_content = video_content.replace(/{video_title}/gi, video_titles);
  }

  if (video_content.search(/{video_description}/gi) !== -1) {
    video_content = video_content.replace(
      /{video_description}/gi,
      video_descriptions
    );
  }

  return res.send({
    status: true,
    data: video_content,
  });
};

const makeBody = (to, from, subject, message) => {
  var str = [
    'Content-Type: text/html; charset="UTF-8"\n',
    'MIME-Version:1.0\n',
    'Content-Transfer-Encoding: 7bit\n',
    'to: ',
    to,
    '\n',
    'from: ',
    from,
    '\n',
    'subject: ',
    subject,
    '\n\n',
    message,
  ].join('');
  var encodedMail = Base64.encodeURI(str);
  return encodedMail;
};

const getConvertStatus = async (req, res) => {
  const { videos } = req.body;
  const result_array = {};
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const result = await videoHelper.getConvertStatus(video);
    result_array[video] = result;
  }
  return res.send(result_array);
};

const getContactsByLatestSent = async (req, res) => {
  const { currentUser } = req;

  const activities = await Activity.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser._id),
        videos: mongoose.Types.ObjectId(req.params.id),
        type: 'videos',
      },
    },
    {
      $group: {
        _id: '$contacts',
      },
    },
    {
      $project: { _id: 1 },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: '_id',
        foreignField: '_id',
        as: 'contacts',
      },
    },
  ]).limit(8);
  return res.send({
    status: true,
    activities,
  });
};

const setupRecording = (io) => {
  const fileStreams = {};
  const fileStreamSizeStatus = {};
  let limitTime = 0;
  const timeBounce = 10 * 60 * 1000;
  let counterDirection = 1;
  let recordDuration = 0;
  let max_duration = 0;

  io.sockets.on('connection', (socket) => {
    socket.on('initVideo', async (userId) => {
      const videoId = uuidv1();
      if (!fs.existsSync(TEMP_PATH)) {
        fs.mkdirSync(TEMP_PATH);
      }

      const user = await User.findOne({ _id: userId }).catch((err) => {
        console.log('user find err', err.message);
      });

      max_duration = user.material_info.record_max_duration || 0;
      const recordVideos = await Video.find({
        user: user._id,
        recording: true,
        del: false,
      });
      recordDuration = 0;

      if (recordVideos && recordVideos.length > 0) {
        for (const recordVideo of recordVideos) {
          if (recordVideo.duration > 0) {
            recordDuration += recordVideo.duration;
          }
        }
      }

      if (recordDuration >= max_duration) {
        socket.emit('timeout', { maxOverflow: true });
      } else {
        limitTime = max_duration - recordDuration;
        if (limitTime > timeBounce) {
          // more than 10min counter is up else down
          counterDirection = 1;
          const data = {
            counterDirection: 1,
            limitTime,
          };
          socket.emit('counterDirection', data);
        } else {
          counterDirection = -1;
          const data = {
            counterDirection: -1,
            limitTime,
          };
          socket.emit('counterDirection', data);
        }
        const ws = fs.createWriteStream(TEMP_PATH + videoId + `.webm`);
        fileStreams[videoId] = ws;
        fileStreamSizeStatus[videoId] = 0;
        socket.emit('createdVideo', { video: videoId });
      }
    });
    socket.on('pushVideoData', (data) => {
      const videoId = data.videoId;
      const blob = data.data;
      const recordTime = data.recordTime || 0;

      if (counterDirection === -1 && recordTime <= 500) {
        socket.emit('timeout', { timeOverflow: true });
      } else {
        if (!fileStreams[videoId]) {
          fileStreams[videoId] = fs.createWriteStream(
            TEMP_PATH + videoId + `.webm`,
            { flags: 'a' }
          );
          const stats = fs.statSync(TEMP_PATH + videoId + `.webm`);
          fileStreamSizeStatus[videoId] = stats.size;
        }
        if (data.sentSize === fileStreamSizeStatus[videoId]) {
          socket.emit('receivedVideoData', {
            receivedSize: fileStreamSizeStatus[videoId],
          });
        } else {
          let bufferSize = 0;
          blob.forEach((e) => {
            fileStreams[videoId].write(e);
            bufferSize += e.length;
          });
          fileStreamSizeStatus[videoId] += bufferSize;

          const estimateTime = max_duration - recordDuration - recordTime;
          if (estimateTime <= timeBounce && counterDirection === 1) {
            counterDirection = -1;
            const data = {
              counterDirection: -1,
              limitTime: estimateTime,
            };
            socket.emit('counterDirection', data);
          }
          socket.emit('receivedVideoData', {
            receivedSize: fileStreamSizeStatus[videoId],
          });
        }
      }
    });
    socket.on('saveVideo', async (data) => {
      const videoId = data.videoId;
      const duration = data.duration;
      fileStreams[videoId].close();

      const token = data.token;
      let decoded;
      try {
        decoded = jwt.verify(token, api.APP_JWT_SECRET);
      } catch (err) {
        socket.emit('failedSaveVideo');
      }
      if (token) {
        const user = await User.findOne({ _id: decoded.id }).catch((err) => {
          console.log('user find err', err.message);
        });

        // check record max duration for save video.
        max_duration = user.material_info.record_max_duration || 0;
        const recordVideos = await Video.find({
          user: user._id,
          recording: true,
          del: false,
        });

        recordDuration = 0;

        if (recordVideos && recordVideos.length > 0) {
          for (const recordVideo of recordVideos) {
            if (recordVideo.duration > 0) {
              recordDuration += recordVideo.duration;
            }
          }
        }
        recordDuration += duration;

        if (recordDuration > max_duration) {
          console.log('Maximum record time is exceeded.');
        } else {
          const video = new Video({
            url: urls.VIDEO_URL + videoId + `.webm`,
            path: TEMP_PATH + videoId + `.webm`,
            title: `${moment().format('MMMM Do YYYY')} - ${
              user.user_name
            } Recording`,
            duration,
            user: decoded.id,
            recording: true,
            bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
            converted: 'progress',
          });
          video
            .save()
            .then(async (_video) => {
              Folder.updateOne(
                {
                  user: user._id,
                  rootFolder: true,
                },
                {
                  $addToSet: { videos: { $each: [_video._id] } },
                }
              );
              socket.emit('savedVideo', { video: _video.id });

              let area;
              let params;
              videoHelper.getDuration(_video.id);

              if (data.mode === 'crop') {
                // Crop area
                const screen = data.screen;
                const videoWidth = 1440;
                const videoHeight = Math.floor(
                  (videoWidth * screen.height) / screen.width
                );
                const areaX = (data.area.startX * videoWidth) / screen.width;
                const areaY = (data.area.startY * videoHeight) / screen.height;
                const areaW = (data.area.w * videoWidth) / screen.width;
                const areaH = (data.area.h * videoHeight) / screen.height;
                area = {
                  areaX,
                  areaY,
                  areaW,
                  areaH,
                };
                // CROP AREA USING FFMPEG
                videoHelper.getDuration(_video.id);
                params = {
                  id: _video.id,
                  mode: 'crop',
                  area,
                };
              } else if (data.mode === 'mirror') {
                params = {
                  id: _video.id,
                  mode: 'mirror',
                };
              } else {
                videoHelper.getDuration(_video.id);
                params = {
                  id: _video.id,
                };
                // CONVERT FFMPEG
              }
              // Upload the Meta Data and Video to the S3
              var videoKey = _video.id;
              if (params.mode) {
                s3.putObject({
                  Bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
                  Key: 'meta/' + videoKey + '.txt',
                  Body: JSON.stringify(params),
                  ContentType: 'text/plain',
                }).promise();
              }
              if (fs.existsSync(TEMP_PATH + videoId + `.webm`)) {
                try {
                  const fileStream = fs.createReadStream(
                    TEMP_PATH + videoId + `.webm`
                  );
                  const key = 'sources/' + videoKey + '.webm';
                  const uploadParams = {
                    Bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
                    Key: key,
                    Body: fileStream,
                    ContentType: 'video/webm',
                  };
                  await s3.send(new PutObjectCommand(uploadParams));
                  _video['key'] = _video._id;
                  _video.save();

                  if (fs.existsSync(TEMP_PATH + videoId + `.webm`)) {
                    fs.unlinkSync(TEMP_PATH + videoId + `.webm`);
                  }

                  const video_data = {
                    file_name: _video.id,
                    file_path: _video.path,
                    area,
                    mode: data.mode,
                  };
                  videoHelper.generateThumbnail(video_data);
                } catch (err) {
                  console.log('file uploading is failed.', err);
                }
              }
            })
            .catch((err) => {
              console.log('Faield SAVE VIDEO', err);
              socket.emit('failedSaveVideo');
            });
        }
      }
    });
    socket.on('cancelRecord', (data) => {
      // console.log("on cancel record ===========>", data.videoId);
      const videoId = data.videoId;
      if (fs.existsSync(TEMP_PATH + videoId + `.webm`)) {
        try {
          if (fileStreams[videoId]) {
            fileStreams[videoId].close();
          }
        } catch (e) {
          console.log('close file stream', e);
        }
        fs.unlinkSync(TEMP_PATH + videoId + `.webm`);
      }
      socket.emit('removedVideo');
    });
  });
};

const getEasyLoad = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const videos = await Video.find({
    $or: [
      {
        user: mongoose.Types.ObjectId(currentUser.id),
        del: false,
      },
      {
        role: 'admin',
        company,
        del: false,
      },
      {
        shared_members: currentUser.id,
      },
    ],
  });

  return res.send({
    status: true,
    data: videos,
  });
};

const uploadVideo = async (req, res) => {
  const { currentUser } = req;

  await checkMaterialCount(currentUser, res);

  if (req.file) {
    const key = req.file.key;
    let fileName = path.basename(key);
    const extName = path.extname(key);
    fileName = fileName.replace(extName, '');
    const video = new Video({
      key: fileName,
      bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
      type: req.file.mimetype,
      user: currentUser._id,
      converted: 'progress',
    });

    const _video = await video
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });
    await Folder.updateOne(
      {
        user: currentUser._id,
        rootFolder: true,
      },
      {
        $addToSet: { videos: { $each: [_video._id] } },
      }
    );
    res.send({
      status: true,
      data: _video,
    });
  }
};

const downloadVideo = async (req, res) => {
  const { currentUser } = req;
  const video = await Video.findOne({
    _id: req.params.id,
    user: currentUser._id,
  });

  console.log(video._doc.is_converted);
  if (video) {
    const material = await videoHelper.getVideoPublicUrl(video._doc);
    if (
      material &&
      (material['is_converted'] ||
        (material['status'] &&
          material['status']['converted'] &&
          material['status']['converted']['status']))
    ) {
      return res.send({
        status: true,
        data: material['converted_url'],
      });
    }
  }
  return res.send({
    status: false,
  });
};

const initRecord = async (req, res) => {
  const { currentUser } = req;

  await checkMaterialCount(currentUser, res);

  Video.find({
    user: currentUser._id,
    recording: true,
    del: false,
  })
    .then((_videos) => {
      var duration = 0;
      _videos.forEach((e) => {
        if (!e.is_draft && e.duration) {
          duration += e.duration;
        }
      });

      const max_duration =
        (currentUser.material_info &&
          currentUser.material_info.record_max_duration) ||
        0;
      if (currentUser.material_info.is_limit && duration >= max_duration) {
        return res.status(400).send({
          status: false,
          error: 'Exceed upload max materials',
        });
      } else {
        const source = req.query.source;
        if (source === 'popup' || source === 'web') {
          return res.send({
            status: true,
            data: {
              max_duration: duration + 15 * 60 * 1000,
              duration,
              user_name: currentUser.user_name,
            },
          });
        } else {
          const newVideo = new Video({
            user: currentUser._id,
            is_draft: true,
            ...req.body,
            title:
              req.body.title ||
              `${moment().format('MMMM Do YYYY')} - ${
                currentUser.user_name
              } Recording`,
          });
          newVideo
            .save()
            .then(async (_v) => {
              await Folder.updateOne(
                {
                  user: currentUser._id,
                  rootFolder: true,
                },
                {
                  $addToSet: { videos: { $each: [newVideo._id] } },
                }
              );
              return res.send({
                status: true,
                data: {
                  max_duration: duration + 15 * 60 * 1000,
                  duration,
                  id: newVideo._id,
                },
              });
            })
            .catch((err) => {
              console.log('video creation is failed.', err);
              return res.status(400).send({
                status: false,
                error: 'video creation is failed.',
              });
            });
        }
      }
    })
    .catch((err) => {
      console.log('videos loading is failed.', err);
      return res.status(400).send({
        status: false,
      });
    });
};
const publish = (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const { chunk_count } = req.body;

  Video.updateOne(
    { user: currentUser._id, _id: id },
    { $set: { chunk_count, is_draft: false } }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message || 'video publishing is failed.',
      });
    });
};

const trash = (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  Video.deleteOne({ user: currentUser._id, _id: id })
    .then(async () => {
      await Folder.updateOne(
        {
          user: currentUser._id,
          rootFolder: true,
        },
        {
          $pull: { videos: { $in: [id] } },
        }
      );
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message || 'video trashing is failed.',
      });
    });
};

const uploadChunk = (req, res) => {
  const { currentUser } = req;
  const files = [];
  if (req.files && req.files.length) {
    req.files.forEach((e) => {
      files.push(e.originalname);
    });
    res.send({
      status: true,
      data: files,
    });
  } else if (req.file) {
    res.send({
      status: true,
      data: req.file,
    });
  }
};

const completeRecord = (req, res) => {
  const { currentUser } = req;
  const { video, count, meta, action, duration, _id, ext, rotate, title } =
    req.body;
  const payload = {
    video,
    count,
    meta,
    action,
  };
  if (ext) {
    payload['ext'] = ext;
  }
  if (rotate) {
    payload['rotate'] = rotate;
  }

  // Merge all files
  request({
    method: 'POST',
    uri:
      'https://f8nhu9b8o4.execute-api.us-east-2.amazonaws.com/default/complete-record?env=' +
      process.env.NODE_ENV,
    body: JSON.stringify(payload),
  })
    .then(async (_res) => {
      if (action === 'delete') {
        if (_id) {
          await Video.deleteOne({ _id }).catch((err) => {
            console.log('video recording cancel is failed.', err);
          });
          await Folder.updateOne(
            {
              user: currentUser._id,
              rootFolder: true,
            },
            {
              $pull: { videos: { $in: [_id] } },
            }
          );
        }
        return res.send({
          status: true,
        });
      } else {
        const videoData = {
          title:
            title ||
            `${moment().format('MMMM Do YYYY')} - ${
              currentUser.user_name
            } Recording`,
          key: video,
          duration,
          user: currentUser.id,
          recording: true,
          bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
          thumbnail:
            'https://teamgrow.s3.us-east-2.amazonaws.com/thumbnails/' +
            video +
            '.jpg',
          site_image:
            'https://teamgrow.s3.us-east-2.amazonaws.com/site_images/' +
            video +
            '.jpg',
          converted: 'progress',
        };
        // Check the video exist and update
        let _video;
        if (_id) {
          _video = await Video.findOne({ _id }).catch((err) => {
            console.log('not found existing video.', err);
          });
        }
        if (_video) {
          if (_video.title) {
            delete videoData['title'];
          }
          if (_video.key) {
            delete videoData['key'];
          }
          Video.updateOne({ _id }, { $set: videoData })
            .then(async () => {
              await Folder.updateOne(
                {
                  user: currentUser._id,
                  rootFolder: true,
                },
                { $addToSet: { videos: { $each: [_id] } } }
              );
              return res.send({
                status: true,
                video: {
                  id: _video._id,
                },
              });
            })
            .catch((err) => {
              return res.status(400).send({
                status: false,
                error: 'video record is not completed.',
              });
            });
        } else {
          const newVideo = new Video(videoData);
          newVideo
            .save()
            .then(async () => {
              await Folder.updateOne(
                {
                  user: currentUser._id,
                  rootFolder: true,
                },
                { $addToSet: { videos: { $each: [newVideo._id] } } }
              );
              return res.send({
                status: true,
                video: {
                  id: newVideo._id,
                },
              });
            })
            .catch((err) => {
              console.log('video record is not created', err);
              return res.status(400).send({
                status: false,
                error: 'video record is not created.',
              });
            });
        }
      }
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.error || err.message,
      });
    });
};

/**
 * Call merge file api and update the document.
 * @param {*} req body: {id: video key, count: chunk count, action: 'complete' | 'remove', ext: '', video_id: document id to update}
 * @param {*} res
 */
const mergeFiles = async (req, res) => {
  const { currentUser } = req;
  const { id, count, ext, video, action, video_id } = req.body;

  await checkMaterialCount(currentUser, res);
  // Merge all files
  await request({
    method: 'POST',
    uri:
      'https://f8nhu9b8o4.execute-api.us-east-2.amazonaws.com/default/merge-files?env=' +
      process.env.NODE_ENV,
    body: JSON.stringify({
      id,
      count,
      action,
      ext,
    }),
  })
    .then(async (_res) => {
      if (action === 'delete') {
        return res.send({
          status: true,
        });
      } else {
        if (video_id) {
          updateVideoData(video, id, currentUser._id, video_id)
            .then((_video) => {
              return res.send({
                status: true,
                data: {
                  ..._video,
                  id: _video['_id'],
                },
              });
            })
            .catch(() => {
              return res.status(400).send({
                status: false,
                error: 'Video changing is failed.',
              });
            });
        } else {
          // Video Record Creation
          createVideoData(video, id, currentUser._id)
            .then(async (_video) => {
              if (video['folder']) {
                await Folder.updateOne(
                  { _id: video['folder'], user: currentUser },
                  { $addToSet: { videos: { $each: [_video._id] } } }
                ).catch((err) => {
                  console.log('foler update is failed.', err.message);
                });
              } else {
                await Folder.updateOne(
                  {
                    user: currentUser,
                    rootFolder: true,
                  },
                  {
                    $addToSet: { videos: { $each: [_video._id] } },
                  }
                );
              }
              return res.send({
                status: true,
                data: {
                  ..._video,
                  id: _video._id,
                },
              });
            })
            .catch(() => {
              return res.status(400).send({
                status: false,
                error: 'Video creation is failed.',
              });
            });
        }
      }
    })
    .catch((err) => {
      console.log('error is occured in api call', err.error || err.message);
      try {
        const error = JSON.parse(err.error);
        if (error.message === 'Endpoint request timed out') {
          if (video_id) {
            updateVideoData(video, id, currentUser._id, video_id)
              .then((_video) => {
                return res.send({
                  status: true,
                  data: {
                    ..._video,
                    id: _video['_id'],
                  },
                });
              })
              .catch(() => {
                return res.status(400).send({
                  status: false,
                  error: 'Video changing is failed.',
                });
              });
          } else {
            // Close Message
            createVideoData(video, id, currentUser._id)
              .then(async (_video) => {
                if (video['folder']) {
                  await Folder.updateOne(
                    { _id: video['folder'], user: currentUser },
                    { $addToSet: { videos: { $each: [_video._id] } } }
                  ).catch((err) => {
                    console.log('foler update is failed.', err.message);
                  });
                } else {
                  await Folder.updateOne(
                    {
                      user: currentUser,
                      rootFolder: true,
                    },
                    {
                      $addToSet: { videos: { $each: [_video._id] } },
                    }
                  );
                }
                return res.send({
                  status: true,
                  data: {
                    ..._video,
                    id: _video._id,
                  },
                });
              })
              .catch(() => {
                return res.status(400).send({
                  status: false,
                  error: 'Video creation is failed.',
                });
              });
          }
        } else {
          return res.status(400).send({
            status: false,
            error: err.error || err.message,
          });
        }
      } catch (_err) {
        return res.status(400).send({
          status: false,
          error: err.error || err.message,
        });
      }
    });
};

const createVideoData = (video, id, user) => {
  return new Promise(async (resolve, reject) => {
    const imageData = {};
    if (video.thumbnail && video.thumbnail.startsWith('data:image')) {
      try {
        const today = new Date();
        const year = today.getYear();
        const month = today.getMonth();
        const thumbnail_image = await uploadBase64Image(
          video.thumbnail,
          'thumbnail' + year + '/' + month
        );
        imageData['thumbnail'] = thumbnail_image;
      } catch (error) {
        console.error('Upload Video Thumbnail Image', error);
      }
    } else if (video.thumbnail?.startsWith('http')) {
      imageData['thumbnail'] = video['thumbnail'];
    }
    const resImage = await generateRelatedImages(video.thumbnail).catch(() => {
      console.log('image generation is failed');
    });
    if (resImage) {
      imageData['site_image'] = resImage;
      imageData['preview'] = imageData['site_image'] || imageData['thumbnail'];
    }
    const { title, duration, description } = video;
    const _video = new Video({
      title,
      description,
      ...imageData,
      key: id,
      duration,
      user,
      bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
      converted: 'progress',
    });

    _video
      .save()
      .then(() => {
        resolve(_video._doc);
      })
      .catch(() => {
        reject();
      });
  });
};

const updateVideoData = (video, id, user, video_id) => {
  return new Promise(async (resolve, reject) => {
    const editData = { ...video };
    delete editData['thumbnail'];
    delete editData['site_image'];

    if (video.thumbnail && video.thumbnail.startsWith('data:image')) {
      try {
        const today = new Date();
        const year = today.getYear();
        const month = today.getMonth();
        const thumbnail_image = await uploadBase64Image(
          video.thumbnail,
          'thumbnail' + year + '/' + month
        );
        editData['thumbnail'] = thumbnail_image;
      } catch (error) {
        console.error('Upload Video Thumbnail Image', error);
      }
    } else if (video.thumbnail?.startsWith('http')) {
      editData['thumbnail'] = video['thumbnail'];
    }
    const resImage = await generateRelatedImages(video.thumbnail).catch(() => {
      console.log('image generation is failed');
    });
    if (resImage) {
      editData['site_image'] = resImage;
      editData['preview'] = editData['site_image'] || editData['thumbnail'];
    }
    editData['version'] += 1;

    await Video.updateOne(
      {
        _id: video_id,
        user,
      },
      {
        $set: {
          ...editData,
          key: id,
          user,
          bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
          converted: 'progress',
        },
      }
    );

    const _video = await Video.findOne({
      _id: video_id,
      user,
    }).catch(() => {
      reject();
    });
    resolve(_video._doc);
  });
};
const getConvertStatus2 = (req, res) => {
  const { currentUser } = req;
  const { id } = req.body;

  // Merge all files
  request({
    method: 'GET',
    uri:
      'https://f8nhu9b8o4.execute-api.us-east-2.amazonaws.com/default/convert-status?video_id=' +
      id +
      '&env=' +
      process.env.NODE_ENV,
  })
    .then((_res) => {
      const result = JSON.parse(_res);
      return res.send({
        status: true,
        ...result,
      });
    })
    .catch((err) => {
      console.log('error is occured in api call', err);
      return res.status(400).send({
        status: false,
        error: err.error || err.message,
      });
    });
};

const uploadSingle = async (req, res) => {
  const { currentUser } = req;

  if (!currentUser.material_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable create video',
    });
  }

  const imageData = {};
  if (req.body.thumbnail) {
    if (req.body.thumbnail.startsWith('data:image')) {
      try {
        const today = new Date();
        const year = today.getYear();
        const month = today.getMonth();
        const thumbnail_image = await uploadBase64Image(
          req.body.thumbnail,
          'thumbnail' + year + '/' + month
        );
        imageData['thumbnail'] = thumbnail_image;
      } catch (error) {
        console.error('Upload Video Thumbnail Image', error);
      }
    } else if (req.body.thumbnail?.startsWith('http')) {
      imageData['thumbnail'] = req.body.thumbnail;
    }
    const resImage = await generateRelatedImages(req.body.thumbnail).catch(
      () => {
        console.log('image generation is failed');
      }
    );
    if (resImage) {
      imageData['site_image'] = resImage;
    }
    imageData['preview'] = imageData['site_image'] || imageData['thumbnail'];
  }

  if (req.body.id) {
    // Update the Video
    const video = await Video.findOne({
      _id: req.body.id,
      user: currentUser.id,
    }).catch((err) => {
      console.log('pdf found err', err.message);
    });
    if (!video) {
      deleteS3Object(req.file.key);
      return res.status(400).json({
        status: false,
        error: 'Invalid_permission',
      });
    }
    const originalUrl = video['key'];
    video['type'] = req.file.mimetype;
    video['key'] = req.params.id;
    video['url'] = req.file.location;
    video['bucket'] = api.AWS.AWS_PRIVATE_S3_BUCKET;
    video['is_draft'] = false;
    video['converted'] = 'progress';
    video['version'] += 1;
    for (const key in imageData) {
      video[key] = imageData[key];
    }
    video
      .save()
      .then(() => {
        deleteSourceFile(originalUrl, true);
        return res.send({
          status: true,
          data: video,
        });
      })
      .catch(() => {});
  } else {
    await checkMaterialCount(currentUser, res);

    const video = new Video({
      user: req.currentUser.id,
      key: req.params.id,
      bucket: api.AWS.AWS_PRIVATE_S3_BUCKET,
      converted: 'progress',
      ...imageData,
    });

    video
      .save()
      .then(async (_v) => {
        await Folder.updateOne(
          {
            user: req.currentUser.id,
            rootFolder: true,
          },
          {
            $addToSet: { videos: { $each: [_v._id] } },
          }
        );
        res.send({
          status: true,
          data: _v,
        });
      })
      .catch((err) => {
        console.log('err', err);
        return res.status(400).json({
          status: false,
          error: err,
        });
      });
  }
};

const deleteSourceFile = (url, shouldCheck = false) => {
  Video.findOne({ key: url }).then((_video) => {
    if (!_video) {
      // delete _video file
    }
  });
};

const deleteThumbnail = (data) => {};

/**
 * Delete bucket file
 * @param {*} key: string
 */
const deleteS3Object = (key) => {
  removeFile(key, function (err, data) {
    console.log('err', err);
  });
};

const updateStatus = (req, res) => {
  const { input, output } = req.body;
  const operation = req.query.operation;

  if (!input || !input.video) {
    return res.status(400).send({
      status: false,
      error: 'invalid_request',
    });
  }

  Video.findOne({ key: input['video'] })
    .then(async (_video) => {
      if (!_video) {
        return res.status(400).send({
          status: false,
          error: 'not_found_video',
        });
      }

      const data = {};
      if (operation === 'merged') {
        if (output['merged'] && output['merged']['status']) {
          data['status.merged'] = { status: true };
        } else if (output['merged']) {
          data['status.merged'] = output['merged'];
        }
        if (output['thumbnail'] && output['thumbnail']['status']) {
          data['thumbnail'] =
            urls.STORAGE_BASE + '/' + output['thumbnail']['url'];
        }
        if (output['siteImage'] && output['siteImage']['status']) {
          data['site_image'] =
            urls.STORAGE_BASE + '/' + output['siteImage']['url'];
        }
      } else if (operation === 'converted') {
        if (output['converted'] && output['converted']['status']) {
          data['converted'] = 'completed';
          data['status.converted'] = { status: true };
        } else if (output['converted']) {
          data['status.converted'] = output['converted'];
        }
        // Check the Preview Gif image generation
        try {
          const convertedMeta = await s3.send(
            new HeadObjectCommand({
              Bucket: api.AWS.AWS_S3_BUCKET_NAME,
              Key: 'preview/' + input['video'] + '.gif',
            })
          );
          if (convertedMeta) {
            data['preview'] =
              'https://teamgrow.s3.us-east-2.amazonaws.com/preview/' +
              input['video'] +
              '.gif';
          }
        } catch (_) {
          //
        }
      } else if (operation === 'stream') {
        if (output['stream'] && output['stream']['status']) {
          data['status.stream'] = { status: true };
        } else if (output['stream']) {
          data['status.stream'] = output['stream'];
        }
      }

      Video.updateOne({ key: input['video'] }, { $set: data }).then(() => {
        return res.send({
          status: true,
        });
      });
    })
    .catch(() => {
      return res.status(500).send({
        status: false,
        error: 'db_error',
      });
    });
};

const generateRelatedImages = async (source) => {
  const play = await loadImage(PLAY_BUTTON_PATH);
  const image = await loadImage(source);
  const canvas = createCanvas(
    system_settings.THUMBNAIL.WIDTH,
    system_settings.THUMBNAIL.HEIGHT
  );
  const ctx = canvas.getContext('2d');
  let height = image.height;
  let width = image.width;
  if (height > width) {
    ctx.rect(
      0,
      0,
      system_settings.THUMBNAIL.WIDTH,
      system_settings.THUMBNAIL.HEIGHT
    );
    ctx.fillStyle = '#000000';
    ctx.fill();
    width = (system_settings.THUMBNAIL.HEIGHT * width) / height;
    height = system_settings.THUMBNAIL.HEIGHT;
    ctx.drawImage(image, (250 - width) / 2, 0, width, height);
  } else {
    height = system_settings.THUMBNAIL.HEIGHT;
    width = system_settings.THUMBNAIL.WIDTH;
    ctx.drawImage(image, 0, 0, width, height);
  }
  ctx.drawImage(play, 10, 150);

  const buf = canvas.toBuffer();
  const file_name = uuidv1();
  const today = new Date();
  const year = today.getYear();
  const month = today.getMonth();
  const key = 'preview' + year + '/' + month + '/' + file_name;
  const params = {
    Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
    Key: key,
    Body: buf,
    ACL: 'public-read',
  };

  await s3.send(new PutObjectCommand(params));
  const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
  return location;
};

const getEmbedInfo = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.body;
  if (!id) {
    return res.status(400).send({
      error: 'video_required',
      status: false,
    });
  }
  const video = await Video.findById(id).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });
  if (!video) {
    return res.status(400).send({
      error: 'not_found_video',
      status: false,
    });
  }
  const userKey = btoa(currentUser._id + '');
  const videoKey = btoa(id);

  return res.send({
    status: true,
    data: {
      videoKey,
      userKey,
    },
  });
};

module.exports = {
  create,
  update,
  updateDetail,
  get,
  getEasyLoad,
  getAll,
  getConvertStatus,
  remove,
  getAnalytics,
  getContactsByLatestSent,
  createVideo,
  createSmsContent,
  setupRecording,
  downloadVideo,
  publish,
  trash,
  uploadVideo,
  updateConvertStatus,
  initRecord,
  uploadChunk,
  completeRecord,
  mergeFiles,
  uploadSingle,
  getConvertStatus2,
  updateStatus,
  getEmbedInfo,
};
