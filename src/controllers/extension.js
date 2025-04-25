const jwt = require('jsonwebtoken');
const User = require('../models/user');
const ExtActivity = require('../models/ext_activity');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const EmailTracker = require('../models/email_tracker');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const { sendExtensionSocketSignal } = require('../helpers/socket');

const api = require('../configs/api');
const _ = require('lodash');

const setupExtension = (io) => {
  io.on('connection', (socket) => {
    socket.emit('connnected');
    /**
     * Check Authentication by token
     */
    socket.on('join', async (data) => {
      const { token } = data;
      if (token) {
        await checkAuth(socket, token);
      } else {
        setTimeout(() => {
          if (!socket || !socket.decoded) {
            // not authenticated for 15 seconds
            try {
              socket.disconnect(true);
            } catch (e) {
              console.error(e);
            }
          }
        }, 15000);
      }

      // get activities
      // sendActivities(socket, { skip: 0, count: 50 });
    });
  });
};

const sendActivities = async (socket, data) => {
  const { currentUser } = socket;
  const { skip, count } = data;

  const extension_activities = await ExtActivity.find({
    user: currentUser._id,
    send_type: 2,
  })
    .skip(skip || 0)
    .limit(count || 50);

  const extension_activityIds = extension_activities.map((e) => e._id);

  const video_trackers = await VideoTracker.find({
    activity: { $in: extension_activityIds },
  }).catch((err) => {
    console.log('deal video tracker find err', err.message);
  });

  const pdf_trackers = await PDFTracker.find({
    activity: { $in: extension_activityIds },
  }).catch((err) => {
    console.log('deal pdf tracker find err', err.message);
  });

  const image_trackers = await ImageTracker.find({
    activity: { $in: extension_activityIds },
  }).catch((err) => {
    console.log('deal image tracker find err', err.message);
  });

  const email_trackers = await EmailTracker.find({
    activity: { $in: extension_activityIds },
  }).catch((err) => {
    console.log('deal video tracker find err', err.message);
  });

  socket.emit('inited_activity', {
    activities: extension_activities,
    video_trackers,
    pdf_trackers,
    image_trackers,
    email_trackers,
  });
};

/**
 *
 * @param {*} req
 * @param {*} res
 * @returns
 */

const getActivities = async (req, res) => {
  const { currentUser } = req;
  const { starting_after, ending_before } = req.body;
  const count = req.body.count || 10;
  let extension_activities;

  if (starting_after) {
    extension_activities = await ExtActivity.find({
      user: currentUser._id,
      send_type: 2,
      updated_at: { $gt: starting_after },
    })
      .sort({ updated_at: -1 })
      .populate([{ path: 'pair_activity', ref: 'ext_activity' }]);
  } else if (ending_before) {
    extension_activities = await ExtActivity.find({
      user: currentUser._id,
      send_type: 2,
      updated_at: { $lt: ending_before },
    })
      .sort({ updated_at: -1 })
      // eslint-disable-next-line prettier/prettier
      .populate([{ path: 'pair_activity', ref: 'ext_activity' }])
      .limit(count || 10);
  } else {
    extension_activities = await ExtActivity.find({
      user: currentUser._id,
      send_type: 2,
    })
      .sort({ updated_at: -1 })
      .populate([{ path: 'pair_activity', ref: 'ext_activity' }])
      .limit(count || 10);
  }

  return res.send({
    status: true,
    data: extension_activities,
  });
};

/**
 *
 * @param {*} req
 * @param {*} res
 */
const sendActivity = async (req, res) => {
  const { currentUser } = req;

  if (
    currentUser.material_track_info.is_enabled &&
    (!currentUser.material_track_info.is_limit ||
      (currentUser.material_track_info.is_limit &&
        currentUser.material_track_info.max_count > 0))
  ) {
    const activity = new ExtActivity({
      ...req.body,
      type: 'email',
      content: 'sent email',
      user: currentUser.id,
    });

    let i = 1;
    const emailInterval = setInterval(function () {
      sendExtensionSocketSignal(currentUser, 'updated_activity', {
        last_time: activity.updated_at,
      });
      i++;
      if (i > 5) {
        clearInterval(emailInterval);
      }
    }, 1000);

    activity.save().catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
    if (currentUser.material_track_info.max_count > 0) {
      currentUser.material_track_info.max_count--;
      currentUser.save();
    }
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).send({
      status: false,
      error: 'Material track limit is exceeded',
    });
  }
};

/**
 *
 * @param {*} req
 * @param {*} res
 */

const getActivityDetail = async (req, res) => {
  const trackers = await ExtActivity.find({
    pair_activity: req.params.id,
  })
    .populate([{ path: 'pair_activity', ref: 'ext_activity' }])
    .catch((err) => {
      console.log('deal email tracker find err', err.message);
    });

  return res.send({
    status: true,
    data: trackers,
  });
};

/**
 *
 * @param {*} socket
 * @param {*} token
 */

const checkAuth = async (socket, token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, api.APP_JWT_SECRET);
  } catch (e) {
    console.error('Socket Auth Failed:', e);
    socket.disconnect(true);
    return;
  }

  const currentUser = await User.findOne({ _id: decoded.id, del: false }).catch(
    (err) => {
      console.log('user find err', err.message);
    }
  );

  if (currentUser) {
    console.info('Auth Success:', currentUser.email);
    socket.currentUser = currentUser;
    socket.join(currentUser._id + '');
  } else {
    console.error('Not found user:');
    socket.disconnect(true);
  }
};

const extensionTemplate = async (req, res) => {
  const type = req.query.type;
  const userId = req.query.user;
  let data = [];
  if (type && userId) {
    const _video_list = await Video.find({ user: userId, del: false })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });

    const _video_detail_list = [];

    for (let i = 0; i < _video_list.length; i++) {
      const view = await VideoTracker.countDocuments({
        video: _video_list[i]._id,
        user: userId,
      });

      let video_detail;
      if (_video_list[i]._doc) {
        video_detail = {
          ..._video_list[i]._doc,
          views: view,
          material_type: 'video',
        };
      } else {
        video_detail = {
          ..._video_list[i],
          views: view,
          material_type: 'video',
        };
      }

      _video_detail_list.push(video_detail);
    }

    const _pdf_list = await PDF.find({ user: userId, del: false })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const _pdf_detail_list = [];

    for (let i = 0; i < _pdf_list.length; i++) {
      const view = await PDFTracker.countDocuments({
        pdf: _pdf_list[i]._id,
        user: userId,
      });

      let pdf_detail;
      if (_pdf_list[i]._doc) {
        pdf_detail = {
          ..._pdf_list[i]._doc,
          views: view,
          material_type: 'pdf',
        };
      } else {
        pdf_detail = {
          ..._pdf_list[i],
          views: view,
          material_type: 'pdf',
        };
      }

      _pdf_detail_list.push(pdf_detail);
    }

    const _image_list = await Image.find({
      user: userId,
      del: false,
      type: { $ne: 'folder' },
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const _image_detail_list = [];

    for (let i = 0; i < _image_list.length; i++) {
      const view = await ImageTracker.countDocuments({
        image: _image_list[i]._id,
        user: userId,
      });

      let image_detail;
      if (_image_list[i]._doc) {
        image_detail = {
          ..._image_list[i]._doc,
          views: view,
          material_type: 'image',
        };
      } else {
        image_detail = {
          ..._image_list[i],
          views: view,
          material_type: 'image',
        };
      }

      _image_detail_list.push(image_detail);
    }

    data = [..._video_detail_list, ..._pdf_detail_list, ..._image_detail_list];
  }

  res.render('extension_template', {
    type,
    userId,
    data,
  });
};

module.exports = {
  setupExtension,
  sendActivity,
  getActivities,
  getActivityDetail,
  extensionTemplate,
};
