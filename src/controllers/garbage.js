const Garbage = require('../models/garbage');
const Template = require('../models/email_template');
const Task = require('../models/task');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Automation = require('../models/automation');
const Image = require('../models/image');
const Timeline = require('../models/time_line');
const MaterialTheme = require('../models/material_theme');
const FollowUp = require('../models/follow_up');
const Campaign = require('../models/campaign');
const PhoneLog = require('../models/phone_log');
const { removeFile } = require('../helpers/fileUpload');
const urls = require('../constants/urls');
const { getTextMaterials } = require('../helpers/utility');
const { templateTokensHandler } = require('../helpers/garbage');

const get = async (req, res) => {
  const data = await Garbage.findOne({ _id: req.params.id });
  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Garbage doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const garbage = new Garbage({
    ...req.body,
    user: currentUser.id,
    updated_at: new Date(),
    created_at: new Date(),
  });
  garbage
    .save()
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      return res.status(400).json({
        status: false,
        error: err.message || 'Internal server error',
      });
    });
};

const edit = async (req, res) => {
  const user = req.currentUser;

  const editData = req.body;
  delete editData['_id'];
  let email_template_promise_array = [];
  const garbage = await Garbage.findOne({ user: user._id });
  if (!garbage) {
    const newGarbage = new Garbage({
      ...editData,
      user: user._id,
    });

    newGarbage
      .save()
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.log('err', err.message);
        return res.status(500).json({
          status: false,
          error: err.message || 'Internal server error',
        });
      });
  } else {
    for (const key in editData) {
      if (key === 'template_tokens') {
        email_template_promise_array = await templateTokensHandler(
          user,
          garbage,
          editData
        );
      }
      garbage[key] = editData[key];
    }

    garbage
      .save()
      .then(() => {
        if (
          email_template_promise_array &&
          email_template_promise_array.length > 0
        ) {
          Promise.all(email_template_promise_array).then(() => {
            return res.send({ status: true });
          });
        } else {
          return res.send({ status: true });
        }
      })
      .catch((err) => {
        console.log('err', err);
        return res.status(500).json({
          status: false,
          error: err.message || 'Internal server error',
        });
      });
  }
};

const bulkRemoveToken = (req, res) => {
  const { currentUser } = req;

  const { tokens, template_tokens } = req.body;

  const promise_array = [];
  const failed_tokens = [];
  const failed_data = [];
  // template, task, automation, timeline, campaign, material theme
  tokens.forEach((token) => {
    const search = `\{${token.name}\}`;
    const template_query = [
      { subject: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
    ];
    const task_query = [
      { 'action.subject': { $regex: search, $options: 'i' } },
      { 'action.content': { $regex: search, $options: 'i' } },
    ];
    const automation_query = [
      { 'automations.action.subject': { $regex: search, $options: 'i' } },
      { 'automations.acdtion.content': { $regex: search, $options: 'i' } },
    ];
    const timeline_query = [
      { subject: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
    ];
    const campaign_query = [
      { subject: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
    ];
    const material_theme_query = [
      { subject: { $regex: search, $options: 'i' } },
    ];
    const promise = new Promise(async (resolve) => {
      try {
        const templates = await Template.find({
          user: currentUser._id,
          $or: template_query,
        }).catch((e) => {
          console.log(`[${search}] => search token in template error`, e);
        });
        const tasks = await Task.find({
          user: currentUser._id,
          type: { $in: ['send_email', 'send_text'] },
          $or: task_query,
        }).catch((e) => {
          console.log(`[${search}] => search token in task error`, e);
        });
        const automations = await Automation.find({
          user: currentUser._id,
          $or: automation_query,
        }).catch((e) => {
          console.log(`[${search}] => search token in automation error`, e);
        });
        const timelines = await Timeline.find({
          user: currentUser._id,
          status: { $in: ['pending', 'active'] },
          type: { $in: ['texts', 'emails'] },
          $or: timeline_query,
        }).catch((e) => {
          console.log(`[${search}] => search token in timeline error`, e);
        });
        const campaigns = await Campaign.find({
          user: currentUser._id,
          $or: campaign_query,
        }).catch((e) => {
          console.log(`[${search}] => search token in campaign error`, e);
        });
        const material_themes = await MaterialTheme.find({
          user: currentUser._id,
          $or: material_theme_query,
        }).catch((e) => {
          console.log(`[${search}] => search token in material theme error`, e);
        });
        let removable = true;
        let failed = {};
        if (templates && templates.length) {
          failed = { ...failed, templates };
          removable = false;
        }
        if (tasks && tasks.length) {
          failed = { ...failed, tasks };
          removable = false;
        }
        if (automations && automations.length) {
          failed = { ...failed, automations };
          removable = false;
        }
        if (timelines && timelines.length) {
          failed = { ...failed, timelines };
          removable = false;
        }
        if (campaigns && campaigns.length) {
          failed = { ...failed, campaigns };
          removable = false;
        }
        if (material_themes && material_themes.length) {
          failed = { ...failed, material_themes };
          removable = false;
        }
        if (!removable) {
          failed = { ...failed, token };
          failed_data.push({ token, data: failed });
          failed_tokens.push(token);
          template_tokens.push(token);
        }
        resolve();
      } catch (e) {
        console.log(`[${search}] => search token error`, e);
        resolve();
      }
    });
    promise_array.push(promise);
  });

  Promise.all(promise_array)
    .then(() => {
      Garbage.updateOne(
        { user: currentUser._id },
        { $set: { template_tokens } }
      )
        .then(() => {
          if (!failed_tokens.length) {
            return res.json({ status: true });
          }
          return res.json({
            status: true,
            data: {
              failed_tokens,
              template_tokens,
              failed_data,
            },
          });
        })
        .catch((e) => {
          return res.status(500).json({
            status: false,
            error: e.message || 'Internal Server Error',
          });
        });
    })
    .catch((e) => {
      return res.status(500).json({
        status: false,
        error: e.message || 'Internal Server Error',
      });
    });
};

const uploadIntroVideo = async (req, res) => {
  const { currentUser } = req;
  const introVideoObject = req.file;
  const introVideo = introVideoObject.location;
  try {
    const currentGarbage = await Garbage.findOne({ user: currentUser._id });
    if (currentGarbage) {
      if (currentGarbage.intro_video) {
        const key = currentGarbage.intro_video.slice(
          urls.STORAGE_BASE.length + 1
        );
        await removeFile(key, (err, data) => {
          console.log('Remove the Intro Video: ', err);
        });
      }
      currentGarbage.intro_video = introVideo;
      Garbage.updateOne(
        { user: currentUser._id },
        { $set: { intro_video: introVideo } }
      )
        .then(() => {
          return res.send({
            status: true,
            data: { intro_video: introVideo },
          });
        })
        .catch((err) => {
          return res.status(500).send({
            status: false,
            data: err.message,
          });
        });
    } else {
      const newGarbage = new Garbage({
        intro_video: introVideo,
        user: currentUser._id,
      });
      newGarbage.save().then((_garbage) => {
        return res.send({
          status: true,
          data: _garbage,
        });
      });
    }
  } catch (err) {
    return res
      .status(500)
      .json({ status: false, error: err.message || 'Internal server error' });
  }
};

const loadDefaults = async (req, res) => {
  const { currentUser } = req;
  const currentGarbage = await Garbage.findOne({ user: currentUser._id });
  if (!currentGarbage) {
    return res.send({
      status: true,
      data: {
        email: null,
        sms: null,
      },
    });
  }
  let defaultEmail;
  let defaultSms;
  if (
    currentGarbage &&
    currentGarbage['canned_message'] &&
    currentGarbage['canned_message']['email']
  ) {
    defaultEmail = await Template.findOne({
      _id: currentGarbage['canned_message']['email'],
    });
  }
  if (
    currentGarbage &&
    currentGarbage['canned_message'] &&
    currentGarbage['canned_message']['sms']
  ) {
    defaultSms = await Template.findOne({
      _id: currentGarbage['canned_message']['sms'],
    });
  }
  return res.send({
    status: true,
    data: {
      email: defaultEmail,
      sms: defaultSms,
    },
  });
};

const terminateAutoSetting = async (req, res) => {
  const { currentUser } = req;
  const { auto_setting } = req.body;
  switch (auto_setting) {
    case 'auto_follow_up2': {
      Task.deleteMany({
        user: currentUser.id,
        type: 'auto_follow_up2',
      }).catch((err) => {
        console.log('task delete err', err.message);
      });
      break;
    }
    case 'auto_resend1': {
      Task.deleteMany({
        user: currentUser.id,
        type: { $in: ['resend_email_video1', 'resend_text_video1'] },
      }).catch((err) => {
        console.log('task delete err', err.message);
      });
      break;
    }
    case 'auto_resend2': {
      Task.deleteMany({
        user: currentUser.id,
        type: { $in: ['resend_email_video2', 'resend_text_video2'] },
      }).catch((err) => {
        console.log('task delete err', err.message);
      });
      break;
    }
  }
};

const loadSmartCodes = async (req, res) => {
  const { currentUser } = req;
  const smart_codes = [];
  const automationIds = [];
  const _garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('err', err);
    }
  );
  if (_garbage.smart_codes) {
    for (const key in _garbage.smart_codes) {
      let smart_code = _garbage.smart_codes[key];
      if (smart_code.automation) {
        automationIds.push(smart_code.automation);
      }
      if (smart_code && smart_code.message) {
        const { videoIds, pdfIds, imageIds, materials } = getTextMaterials(
          smart_code.message
        );

        if (videoIds.length > 0) {
          const video = await Video.findOne({ _id: videoIds[0] });
          smart_code = {
            ...smart_code,
            thumbnail: video.thumbnail,
            preview: video.preview,
            type: 'video',
            material_count: materials.length,
          };
        } else if (pdfIds.length > 0) {
          const pdf = await PDF.findOne({ _id: pdfIds[0] });
          smart_code = {
            ...smart_code,
            preview: pdf.preview,
            type: 'pdf',
            material_count: materials.length,
          };
        } else if (imageIds.length > 0) {
          const image = await Image.findOne({ _id: imageIds[0] });
          smart_code = {
            ...smart_code,
            preview: image.preview,
            type: 'image',
            material_count: materials.length,
          };
        }
      }
      smart_codes.push({
        ...smart_code,
        code: key,
      });
    }
  }
  const automationUniqIds = [...new Set([...automationIds])];
  const automations = await Automation.find(
    { _id: { $in: automationUniqIds } },
    { _id: 1, title: 1 }
  );
  const automationDic = {};
  automations.forEach((e) => {
    automationDic[e._id] = e;
  });
  smart_codes.forEach((e) => {
    if (e.automation && automationDic[e.automation]) {
      e.automation_detail = automationDic[e.automation];
    }
  });
  return res.send({
    status: true,
    data: smart_codes,
  });
};

const getTeamSettings = async (req, res) => {
  const { currentUser } = req;
  const _garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      return res.status(400).json({
        status: false,
        error: 'Garbage doesn`t exist',
      });
    }
  );
  res.send({
    status: true,
    data: _garbage.team_settings,
  });
};

const updateTeamSettings = async (req, res) => {
  const { currentUser } = req;
  const { team_settings } = req.body;
  const _garbage = await Garbage.updateOne(
    { user: currentUser.id },
    { $set: { team_settings } }
  ).catch((err) => {
    return res.status(400).json({
      status: false,
      error: 'Update failed',
    });
  });
  return res.send({
    status: true,
  });
};

module.exports = {
  get,
  create,
  edit,
  uploadIntroVideo,
  loadDefaults,
  terminateAutoSetting,
  loadSmartCodes,
  bulkRemoveToken,
  getTeamSettings,
  updateTeamSettings,
};
