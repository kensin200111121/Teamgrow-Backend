const crypto = require('crypto');
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');
const { phone } = require('phone');
const mongoose = require('mongoose');
const User = require('../models/user');
const Garbage = require('../models/garbage');
const system_settings = require('../configs/system_settings');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const Tag = require('../models/tag');
const FollowUp = require('../models/follow_up');
const TimeLine = require('../models/time_line');
const Appointment = require('../models/appointment');
const Text = require('../models/text');
const Notification = require('../models/notification');
const Deal = require('../models/deal');
const PaidDemo = require('../models/paid_demo');
const Task = require('../models/task');
const Note = require('../models/note');
const Team = require('../models/team');
const EventType = require('../models/event_type');
const Email = require('../models/email');
const EmailTracker = require('../models/email_tracker');
const VideoTracker = require('../models/video_tracker');
const PdfTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const Followup = require('../models/follow_up');
const Campaign = require('../models/campaign');
const CampaignJob = require('../models/campaign_job');
const DealStage = require('../models/deal_stage');
const EmailTemplate = require('../models/email_template');
const Draft = require('../models/draft');
const Filter = require('../models/filter');
const Folder = require('../models/folder');
const Guest = require('../models/guest');
const Label = require('../models/label');
const Payment = require('../models/payment');
const Phonelog = require('../models/phone_log');
const Pipeline = require('../models/pipe_line');
const Timeline = require('../models/time_line');
const Automation = require('../models/automation');
const AutomationLine = require('../models/automation_line');
const Image = require('../models/image');
const PDF = require('../models/pdf');
const Video = require('../models/video');
const ExtActivity = require('../models/ext_activity');
const { sendNotificationEmail } = require('./notification');
const urls = require('../constants/urls');
const api = require('../configs/api');
const request = require('request-promise');

const { releaseTwilioNumber } = require('./text');
const { removeMaterials } = require('./material');

const { assignTimeline } = require('./automation');
const { REPLY: REPLY_EMAIl } = require('../constants/mail_contents');
const Labels = require('../constants/label');
const { SESClient, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const short = require('short-uuid');
const { PACKAGE } = require('../constants/package');

const { cancelSubscription, deleteCustomer } = require('./payment');
const { sendErrorToSentry, getUserTimezone } = require('./utility');
const { OAuth2Client } = require('google-auth-library');
const { initContactBuckets } = require('./sphere_bucket');
const { addMemberToCommnunity } = require('./team');
const { removeTimeline } = require('../services/time_line');
const { getAllTokens, deleteTokenById } = require('../services/identity');
const { AuthorizationCode } = require('simple-oauth2');
const Organization = require('../models/organization');

const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const setPackage = async (data) => {
  const { user, level } = data;
  const PACKAGE_DATA = JSON.parse(JSON.stringify(PACKAGE));
  const currentUser = await User.findOne({
    _id: user,
  });

  if (level.includes('GROWTH_PLUS_TEXT')) {
    PACKAGE_DATA[level] = { ...PACKAGE_DATA['GROWTH'], ...PACKAGE_DATA[level] };
  }

  if (!level.includes('LITE')) {
    if (data.video_record_limit) {
      PACKAGE_DATA[level].material_info.record_max_duration =
        data.video_record_limit;
    }
    if (data.automation_assign_limit) {
      PACKAGE_DATA[level].automation_info.max_count =
        data.automation_assign_limit;
    }
    if (data.calendar_limit) {
      PACKAGE_DATA[level].calendar_info.max_count = data.calendar_limit;
    }
    if (data.text_monthly_limit) {
      PACKAGE_DATA[level].text_info.max_count = data.text_monthly_limit;
    }
    if (data.assistant_limit) {
      PACKAGE_DATA[level].assist_info.max_count = data.assistant_limit;
    }
    if (data.landing_page_limit) {
      PACKAGE_DATA[level].landing_page_info.max_count = data.landing_page_limit;
    }
    if (data.team_own_limit) {
      PACKAGE_DATA[level].team_info.max_count = data.team_own_limit;
    }
    if (data.pipe_limit) {
      PACKAGE_DATA[level].pipe_info.max_count = data.pipe_limit;
    }
    if (data.organization_info) {
      PACKAGE_DATA[level].organization_info = data.organization_info;
    }
  } else if (level.includes('LITE') || level.includes('EXT')) {
    if (currentUser.twilio_number_id) {
      releaseTwilioNumber(currentUser.twilio_number_id, currentUser._id);
    }
  }
  // if (level.includes('ELITE') || level.includes('GROWTH')) {
  //   if (currentUser.organization_info?.is_owner) {
  //     const demo_mode = 1;
  //     paidEliteOnboardSetup(user, demo_mode);
  //   }
  // }

  PACKAGE_DATA[level] = { ...PACKAGE_DATA['BASIC'], ...PACKAGE_DATA[level] };
  const update_data = { ...PACKAGE_DATA[level] };
  update_data.package_level = level;
  update_data['subscription.is_suspended'] = level === 'SLEEP'; // in case of updating Sleep to Normal package
  if (
    (level === 'GROWTH' || level === 'GROWTH_PLUS_TEXT') &&
    currentUser.user_version < 2.3
  ) {
    update_data['user_version'] = 2.3;
  }
  return User.updateOne(
    {
      _id: user,
    },
    {
      $set: update_data,
    }
  );
};

const paidEliteOnboardSetup = async (user, demo_mode) => {
  const new_demo = new PaidDemo({
    user,
    demo_mode,
  });

  const currentUser = await User.findOne({
    _id: user,
  });

  const schedule_link = system_settings.SCHEDULE_LINK_1_HOUR;

  new_demo.save().then(async () => {
    const templatedData = {
      user_name: currentUser.user_name,
      schedule_link,
    };

    const params = {
      Destination: {
        ToAddresses: [currentUser.email],
      },
      Source: REPLY_EMAIl,
      Template: 'EliteJoinWelcome',
      TemplateData: JSON.stringify(templatedData),
    };

    // Create the promise and SES service object
    const command = new SendTemplatedEmailCommand(params);
    await ses.send(command).catch((err) => {
      console.log('ses command err', err.message);
    });
  });
};

const addOnboard = async (user_id) => {
  try {
    // const { user_id } = data;
    const onboard_account = await User.findOne({
      email: system_settings.ONBOARD_ACCOUNT,
      del: false,
    });
    const user = await User.findOne({
      _id: user_id,
    });

    const label = Labels[1].id;
    const tags = [user.package_level];

    if (user.payment) {
      tags.push('active');
    } else {
      tags.push['free'];
    }

    if (!user.is_primary) {
      tags.push['sub_account'];
    }
    Contact.create({
      first_name: user.user_name.split(' ')[0],
      last_name: user.user_name.split(' ')[1],
      email: user.email,
      cell_phone: user.cell_phone,
      company: user.company,
      label,
      tags,
      source: user.id,
      user: onboard_account.id,
    }).then((new_contact) => {
      Activity.create({
        contacts: new_contact.id,
        user: onboard_account.id,
        type: 'contacts',
        content: 'added contact',
      }).then((new_activity) => {
        Activity.updateOne(
          { _id: new_activity._id },
          {
            $set: {
              signle_id: new_activity._id,
            },
          }
        );
        Contact.updateOne(
          {
            _id: new_contact.id,
          },
          {
            $set: { last_activity: new_activity.id },
          }
        )
          .then(() => {
            // trigger onboard automation
            const data = {
              automation_id: system_settings.ONBOARD_AUTOMATION,
              assign_array: [new_contact.id],
              user_id: onboard_account.id,
              required_unique: false,
              type: 'contact',
            };

            assignTimeline(data)
              .then(({ result: _res }) => {
                if (_res[0] && !_res[0].status) {
                  console.log('automation assign err', _res[0].error);
                }
              })
              .catch((err) => {
                console.log('assign automation err', err);
              });
          })
          .catch((err) => {
            console.log('conatct last activity update err', err.message);
          });
      });
    });
  } catch (e) {
    console.log('addOnboard catch error', e);
  }
};

const addAdmin = async (user_id, data) => {
  try {
    // const { user_id } = data;
    let additional_tags = [];
    if (data && data.tags) {
      additional_tags = data.tags;
    }

    const onboard_account = await User.findOne({
      email: system_settings.ADMIN_ACCOUNT,
      role: 'admin',
    });
    const user = await User.findOne({
      _id: user_id,
    });

    const new_contact = new Contact({
      first_name: user.user_name.split(' ')[0],
      last_name: user.user_name.split(' ')[1],
      email: user.email,
      cell_phone: user.cell_phone,
      company: user.company,
      tags: [user.package_level, ...additional_tags],
      label: Labels[1].id,
      source: user.id,
      user: onboard_account.id,
    });

    new_contact.save().catch((err) => {
      console.log('new conatct save err', err.message);
    });

    const new_activity = new Activity({
      contacts: new_contact.id,
      user: onboard_account.id,
      type: 'contacts',
      content: 'added contact',
    });
    new_activity.single_id = new_activity._id;
    new_activity
      .save()
      .then(() => {
        Contact.updateOne(
          {
            _id: new_contact.id,
          },
          {
            $set: { last_activity: new_activity.id },
          }
        )
          .then(() => {
            console.log('added new contact', user.email);
          })
          .catch((err) => {
            console.log('conatct last activity update err', err.message);
          });
      })
      .catch((err) => {
        console.log('new contact add err', err.message);
      });
  } catch (e) {
    console.log('addAdmin catch error', e);
  }
};

const suspendData = async (user_id) => {
  const currentUser = await User.findOne({
    _id: user_id,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  if (!currentUser) {
    return new Promise((resolve) => {
      resolve({
        status: false,
        error: 'No existing user',
      });
    });
  }

  if (!currentUser.id) {
    return new Promise((resolve) => {
      resolve({
        status: false,
        error: 'No valid user',
      });
    });
  }

  await TimeLine.deleteMany({ user: currentUser.id });
  await Task.deleteMany({ user: currentUser.id });
  await CampaignJob.deleteMany({ user: currentUser.id });

  if (currentUser.is_primary) {
    await Team.deleteOne({ owner: currentUser._id, is_internal: true }).catch(
      (err) => {
        console.log('internal community delete error', err);
      }
    );
  } else {
    await Team.updateOne(
      { members: { $in: [currentUser._id] }, is_internal: true },
      { $pull: { members: currentUser._id, editors: currentUser._id } }
    ).catch((err) => {
      console.log('internal community update error', err.message);
    });
  }

  Garbage.updateOne(
    { user: currentUser.id },
    {
      $unset: {
        email_notification: true,
        text_notification: true,
        mobile_notification: true,
        desktop_notification: true,
      },
    }
  ).catch((err) => {
    console.log('notification unset err', err.message);
  });
  // removeTimeline for this contact on ONBOARD_ACCOUNT
  const onboard_account = await User.findOne({
    email: system_settings.ONBOARD_ACCOUNT,
    del: false,
  });
  const user_contact = await Contact.findOne({ email: currentUser.email });
  if (user_contact) {
    const timeline = await TimeLine.findOne({
      contact: user_contact,
      user: onboard_account._id,
      status: 'active',
    });
    if (timeline) {
      removeTimeline({
        userId: currentUser.id,
        automation_line: timeline?.automation_line,
      });
    }
  }
};

const releaseData = async (user_id) => {
  const currentUser = await User.findOne({
    _id: user_id,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  if (!currentUser) {
    return new Promise((resolve) => {
      resolve({
        status: false,
        error: 'No existing user',
      });
    });
  }

  if (!currentUser.id) {
    return new Promise((resolve) => {
      resolve({
        status: false,
        error: 'No valid user',
      });
    });
  }

  await FollowUp.deleteMany({ user: currentUser.id }).catch(() => {});

  try {
    if (currentUser.twilio_number_id) {
      sendErrorToSentry(
        currentUser,
        'Insepct: Twilio Number releasing when clear account:' +
          currentUser.twilio_number_id
      );
      releaseTwilioNumber(currentUser.twilio_number_id, currentUser._id);
    }

    if (currentUser.affiliate) {
      cancelAffiliate(currentUser.affiliate.id);
    }

    if (currentUser.dialer_info && currentUser.dialer_info.is_enabled) {
      cancelWavvDialer(currentUser.id);
    }
  } catch (err) {
    console.log('clear service account err', err.message);
  }

  await User.updateOne(
    {
      _id: currentUser.id,
    },
    {
      $set: {
        data_released: true,
      },
      $unset: {
        affiliate: true,
        twilio_number_id: true,
        twilio_number: true,
      },
    }
  ).catch((err) => {
    console.log('user update remove err', err.message);
  });
};

const clearData = async (user_id, keep_payment = false) => {
  const currentUser = await User.findOne({
    _id: user_id,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  if (!currentUser || !currentUser.id) {
    return;
  }

  await Contact.deleteMany({ user: currentUser.id });
  await Activity.deleteMany({ user: currentUser.id });
  await Appointment.deleteMany({ user: currentUser.id });
  await Tag.deleteMany({ user: currentUser.id });
  await Text.deleteMany({ user: currentUser.id });
  await Notification.deleteMany({ user: currentUser.id });
  await Deal.deleteMany({ user: currentUser.id });
  await Team.deleteMany({ owner: currentUser.id });
  await ExtActivity.deleteMany({ user: currentUser.id });
  await Team.updateMany(
    {
      members: currentUser.id,
    },
    {
      $pull: { members: [currentUser.id] },
    }
  );
  const teams = await Team.find({ members: currentUser.id }).catch((err) => {
    console.log('team find err', err.message);
  });
  for (let i = 0; i < teams.length; i++) {
    removeSharedItems(teams[i]._id, currentUser.id);
  }
  removeMaterials(currentUser.id);
  // removeTeamAutomation(currentUser.id);
  // removeTeamEmailTemplate(currentUser.id);
  await EventType.deleteMany({ user: currentUser.id });
  await Email.deleteMany({ user: currentUser.id });
  await EmailTracker.deleteMany({ user: currentUser.id });
  await VideoTracker.deleteMany({ user: currentUser.id });
  await PdfTracker.deleteMany({ user: currentUser.id });
  await ImageTracker.deleteMany({ user: currentUser.id });
  await Campaign.deleteMany({ user: currentUser.id });
  await Automation.deleteMany({ user: currentUser.id });
  await AutomationLine.deleteMany({ user: currentUser.id });
  await DealStage.deleteMany({ user: currentUser.id });
  await Draft.deleteMany({ user: currentUser.id });
  await EmailTemplate.deleteMany({ user: currentUser.id });
  await Filter.deleteMany({ user: currentUser.id });
  await Folder.deleteMany({ user: currentUser.id });
  await Followup.deleteMany({ user: currentUser.id });
  await Guest.deleteMany({ user: currentUser.id });
  await Label.deleteMany({ user: currentUser.id });
  await Phonelog.deleteMany({ user: currentUser.id });
  await Pipeline.deleteMany({ user: currentUser.id });
  await Task.deleteMany({ user: currentUser.id });
  await Timeline.deleteMany({ user: currentUser.id });
  await Note.deleteMany({ user: currentUser.id });
  await Image.deleteMany({ user: currentUser.id });
  await Video.deleteMany({ user: currentUser.id });
  await PDF.deleteMany({ user: currentUser.id });

  // TODO: file, garbage, paid_demo, payment remove
  // TODO: note remove with audio file remove
  // TODO: When user is closed, team should have notification
  // TODO: When remove team materials, team should be updated
  // TODO; When remove email, shared contact information should be affected

  if (currentUser.payment) {
    if (currentUser.is_primary)
      await cancelCustomer(currentUser.payment).catch(() => {
        console.log('cancel payment err');
      });
    else {
      const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
        () => {
          console.log('invalid payment.');
        }
      );
      if (payment)
        await cancelSubscription({
          subscription: payment.subscription,
          shouldDeletePayment: false,
        }).catch((error) => {
          console.log('invalid subscription.');
        });
    }
    if (!keep_payment) await Payment.deleteOne({ _id: currentUser.payment });
  }
  await User.updateOne(
    {
      _id: currentUser.id,
    },
    {
      $set: {
        del: true,
        user_disabled: true,
        data_cleaned: true,
        cleaned_at: new Date(),
      },
    }
  ).catch((err) => {
    console.log('user update remove err', err.message);
  });
};

const promocodeCheck = (package_level, promo) => {
  if (package_level.includes('EVO')) {
    if (system_settings.PRO_CODE['EVO'] === promo) {
      return true;
    } else {
      return false;
    }
  } else {
    return true;
  }
};

const addNickName = async (user_id) => {
  try {
    const user = await User.findOne({ _id: user_id });

    if (!user.nick_name) {
      let nick_name;
      nick_name = user.user_name.toLowerCase().trim().replace(/\s/g, '');

      const nick_users = await User.find({
        nick_name: { $regex: nick_name + '.*', $options: 'i' },
      });

      if (nick_users.length > 0) {
        nick_name = `${nick_name}${nick_users.length}`;
      }

      await User.updateOne(
        {
          _id: user_id,
        },
        {
          $set: {
            nick_name,
          },
        }
      )
        .then(() => {
          console.log('user updated', user.email);
        })
        .catch((err) => {
          console.log('nick name update error', err.message);
        });
    }
  } catch (e) {
    console.log('addNickName catch error', e);
  }
};

const removeTeamAutomation = async (user) => {
  const automations = await Automation.find({
    user,
    del: false,
    clone_assign: { $ne: true },
  }).catch((err) => {
    console.log('video find err', err.message);
  });
  for (let i = 0; i < automations.length; i++) {
    const automation = automations[i];
    Team.updateOne(
      { automations: automation.id },
      {
        $pull: { automations: { $in: [automation.id] } },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });
  }
};

const removeTeamEmailTemplate = async (user) => {
  const templates = await EmailTemplate.find({
    user,
  }).catch((err) => {
    console.log('video find err', err.message);
  });
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    Team.updateOne(
      { email_templates: template.id },
      {
        $pull: { email_templates: { $in: [template.id] } },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });
  }
};

const removeSharedItems = async (team, user) => {
  const templateIds = [];
  const automationIds = [];
  const videoIds = [];
  const pdfIds = [];
  const imageIds = [];
  const folderIds = [];
  const pipelineIds = [];
  const team_info = await Team.findById(team);
  const templates = await EmailTemplate.find({
    _id: { $in: team_info.email_templates },
    user,
    del: false,
  }).catch((err) => {
    console.log('template find err', err.message);
  });
  for (let i = 0; i < templates.length; i++) {
    templateIds.push(templates[i]._id);
  }

  const automations = await Automation.find({
    _id: { $in: team_info.automations },
    user,
    del: false,
    clone_assign: { $ne: true },
  }).catch((err) => {
    console.log('automation find err', err.message);
  });
  for (let i = 0; i < automations.length; i++) {
    automationIds.push(automations[i]._id);
  }

  const videos = await Video.find({
    _id: { $in: team_info.videos },
    user,
    del: false,
  }).catch((err) => {
    console.log('video find err', err.message);
  });
  for (let i = 0; i < videos.length; i++) {
    videoIds.push(videos[i]._id);
  }

  const pdfs = await PDF.find({
    _id: { $in: team_info.pdfs },
    user,
    del: false,
  }).catch((err) => {
    console.log('pdf find err', err.message);
  });
  for (let i = 0; i < pdfs.length; i++) {
    pdfIds.push(pdfs[i]._id);
  }

  const images = await Image.find({
    _id: { $in: team_info.images },
    user,
    del: false,
  }).catch((err) => {
    console.log('image find err', err.message);
  });
  for (let i = 0; i < images.length; i++) {
    imageIds.push(images[i]._id);
  }

  const folders = await Folder.find({
    _id: { $in: team_info.folders },
    user,
    del: false,
  }).catch((err) => {
    console.log('folder find err', err.message);
  });
  for (let i = 0; i < folders.length; i++) {
    folderIds.push(folders[i]._id);
  }

  // Pipelines
  const pipelines = await Pipeline.find({
    _id: { $in: team_info.pipelines },
    user,
  }).catch((err) => {
    console.log('pipeline find err', err.message);
  });

  for (let i = 0; i < pipelines.length; i++) {
    pipelineIds.push(pipelines[i]._id);
  }

  await Video.updateMany(
    { _id: { $in: videoIds } },
    { $unset: { role: true } }
  );

  await PDF.updateMany({ _id: { $in: pdfIds } }, { $unset: { role: true } });

  await Image.updateMany(
    { _id: { $in: imageIds } },
    { $unset: { role: true } }
  );

  await Folder.updateMany(
    { _id: { $in: folderIds } },
    { $unset: { role: true } }
  );

  await Automation.updateMany(
    { _id: { $in: automationIds } },
    { $unset: { role: true } }
  );

  await EmailTemplate.updateMany(
    { _id: { $in: templateIds } },
    { $unset: { role: true } }
  );

  await Team.updateOne(
    {
      _id: team,
    },
    {
      $pull: {
        email_templates: { $in: templateIds },
        automations: { $in: automationIds },
        images: { $in: imageIds },
        pdfs: { $in: pdfIds },
        videos: { $in: videoIds },
        folders: { $in: folderIds },
        pipelines: { $in: pipelineIds },
      },
    }
  ).catch((err) => {
    console.log('err', err.message);
  });
  await Folder.updateOne(
    {
      team,
      role: 'team',
      del: false,
    },
    {
      $pull: {
        templates: { $in: templateIds },
        automations: { $in: automationIds },
        images: { $in: imageIds },
        pdfs: { $in: pdfIds },
        videos: { $in: videoIds },
        folders: { $in: folderIds },
      },
    }
  );

  // unshare contact that shared by this memeber
  await Contact.updateMany(
    {
      shared_team: [team_info._id],
      type: 'share',
    },
    {
      $pull: {
        shared_members: user,
        pending_users: user,
      },
    }
  ).catch((err) => {
    console.log('Stop share contacts', err.message);
  });
};

const cancelWavvDialer = (user_id) => {
  try {
    var options = {
      method: 'DELETE',
      url: `https://api.wavv.com/v2/users/${user_id}`,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        user: api.DIALER.VENDOR_ID,
        password: api.DIALER.API_KEY,
      },
      json: true,
    };

    request(options, function (error, response, data) {
      if (error) {
        console.log('wavv cancel err', error || error.message);
      } else {
        var _res;
        try {
          _res = JSON.stringify(data);
        } catch (e) {
          error = e.message || e;
        }
        if (!_res.success) {
          console.log('wavv cancel err', _res.error || _res);
        }
      }
    });
  } catch (e) {
    console.log('wavv cancel err', e);
  }
};

const cancelCustomer = async (id) => {
  const payment = await Payment.findOne({ _id: id }).catch((err) => {
    console.log('err', err);
  });

  return new Promise((resolve, reject) => {
    deleteCustomer(payment.customer_id)
      .then(() => {
        resolve();
      })
      .catch((err) => {
        console.log('err', err);
        reject();
      });
  });
};

const cancelAffiliate = (id) => {
  request({
    method: 'DELETE',
    uri: 'https://firstpromoter.com/api/v1/promoters/delete',
    headers: {
      'x-api-key': api.FIRSTPROMOTER.API_KEY,
      'Content-Type': 'application/json',
    },
    body: {
      id,
    },
    json: true,
  }).catch((err) => {
    console.log('user firstpromoter set err', err.message);
  });
};

const createUser = (data) => {
  const { password, os, player_id, email, payment } = data;
  let user_data = {
    ...data,
  };

  if (password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
      .toString('hex');

    user_data = {
      ...user_data,
      salt,
      hash,
    };
  }

  if (os === 'ios') {
    user_data.iOSDeviceToken = player_id;
  } else if (os === 'android') {
    user_data.androidDeviceToken = player_id;
  }

  if (!user_data.phone) {
    if (user_data.cell_phone) {
      const formattedPhone = phone(user_data.cell_phone);
      if (formattedPhone) {
        user_data.phone = {
          number: user_data.cell_phone,
          internationalNumber: formattedPhone.phoneNumber,
          countryCode: formattedPhone.countryIso2,
          areaCode: formattedPhone.countryCode,
        };
      }
    }
  } else if (!user_data.cell_phone) {
    user_data.cell_phone = user_data.phone.internationalNumber;
  }

  return new Promise((resolve) => {
    User.create({
      ...user_data,
      ...(user_data._id ? { _id: mongoose.Types.ObjectId(user_data._id) } : {}),
    })
      .then(async (_res) => {
        Garbage.create({
          user: _res.id,
        }).catch((err) => {
          console.log('garbage save err', err.message);
        });

        createAdminFolder(_res.id);

        addNickName(_res.id);

        initContactBuckets(_res.id);
        const package_data = {
          user: _res.id,
          level: user_data.package_level,
        };

        setPackage(package_data).catch((err) => {
          console.log('user set package err', err.message);
        });

        if (user_data.welcome_email) {
          // add onboard process user
          const time_zone = getUserTimezone(_res);

          addOnboard(_res.id);
          // addAdmin(_res.id);

          const email_data = {
            template_data: {
              user_email: email,
              verification_url: `${urls.VERIFY_EMAIL_URL}?id=${_res.id}`,
              user_name: _res.user_name,
              created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
              password,
              oneonone_url: urls.ONEONONE_URL,
              recording_url: urls.INTRO_VIDEO_URL,
              recording_preview: urls.RECORDING_PREVIEW_URL,
              webinar_url: system_settings.WEBINAR_LINK,
              import_url: urls.IMPORT_CSV_URL,
              template_url: urls.CONTACT_CSV_URL,
              connect_url: urls.INTEGRATION_URL,
            },
            template_name: 'Welcome',
            required_reply: true,
            email: _res.email,
            source: _res.source,
          };

          sendNotificationEmail(email_data);
        }
        // const token = jwt.sign({ id: _res.id }, api.APP_JWT_SECRET, {
        //   expiresIn: '30d',
        // });

        Team.find({ referrals: email })
          .populate('owner')
          .then((teams) => {
            for (let i = 0; i < teams.length; i++) {
              const team = teams[i];
              const members = team.members;
              const referrals = team.referrals;
              if (members.indexOf(_res.id) === -1) {
                members.push(_res.id);
              }
              if (referrals.indexOf(email) !== -1) {
                const pos = referrals.indexOf(email);
                referrals.splice(pos, 1);
              }

              Team.updateOne(
                {
                  _id: team.id,
                },
                {
                  $set: {
                    members,
                    referrals,
                  },
                }
              ).catch((err) => {
                console.log('team update err: ', err.message);
              });
            }
          })
          .catch((err) => {
            console.log('team find found err', err.message);
          });

        if (user_data.source && user_data.source === 'vortex') {
          const redxCommunityId = system_settings.DEFAULT_REDX_COMMUNITY_ID;
          addMemberToCommnunity(_res.id, redxCommunityId);
        }
        const token = jwt.sign(
          {
            id: _res.id,
          },
          api.APP_JWT_SECRET
        );

        const myJSON = JSON.stringify(_res);
        const user = JSON.parse(myJSON);
        userProfileOutputGuard(user);
        user.hasPassword = !!user_data.password;

        user['payment'] = payment;

        resolve({
          status: true,
          data: {
            token,
            user,
          },
        });
      })
      .catch((err) => {
        console.log('user create err', err.message);
        resolve({
          status: false,
          error: err.message,
        });
      });
  });
};

const createAdminFolder = (user_id) => {
  Folder.create({
    rootFolder: true,
    user: user_id,
    folders: [],
    videos: [],
    pdfs: [],
    images: [],
    templates: [],
    automations: [],
    del: false,
  }).catch((err) => {
    console.log('admin folder err', err.message);
  });
};

const userProfileOutputGuard = (user, is_admin = false) => {
  delete user.hash;
  delete user.salt;
  if (!is_admin) delete user.role;
  delete user.outlook_refresh_token;
  delete user.google_refresh_token;
  delete user.yahoo_refresh_token;
  if (user.calendar_list.length > 0) {
    const new_calenar_list = user.calendar_list.map((c) => {
      if (c.connected_calendar_type === 'google') {
        delete c.google_refresh_token;
      } else if (c.connected_calendar_type === 'outlook') {
        delete c.outlook_refresh_token;
      }
      return c;
    });
    user.calendar_list = new_calenar_list;
  }
};

const cleanupUserData = (user) => {
  delete user.hash;
  delete user.salt;
  delete user.is_free;
  delete user.role;
};

const checkRecaptchaToken = async (token) => {
  try {
    const response = await request({
      method: 'POST',
      uri: `https://www.google.com/recaptcha/api/siteverify?secret=${api.RECAPTCHA_SECRET_KEY}&response=${token}`,
      json: true,
    });
    return response.success;
  } catch (error) {
    console.log('recaptcha error', error.message);
    return false;
  }
};

/**
 * find or create the internal team & create the organization
 * And match the new organization and internal team
 * Save the user organization field
 * And set the currentUser.organization field. It would be used after this function calling, the object address is referenced.
 * @param {mongodbObject} currentUser
 */
const createOrganizationAndInternalTeam = async (currentUser) => {
  if (currentUser.organization) {
    return;
  }
  // try to find the internal team
  const internalTeam = await Team.findOne({
    owner: currentUser._id,
    is_internal: true,
  }).catch(() => {});
  let internalTeamId = internalTeam?._id;
  if (!internalTeam) {
    const newInternalTeam = new Team({
      owner: currentUser._id,
      members: [],
      name: currentUser.user_name + `'s team`,
      is_internal: true,
    });
    await newInternalTeam
      .save()
      .then(() => {
        internalTeamId = newInternalTeam._id;
      })
      .catch(() => {});
  }
  const organization = new Organization({
    owner: currentUser._id,
    members: [],
    name: `${currentUser.user_name}'s organization`,
    team: internalTeamId,
  });

  await organization
    .save()
    .then(() => {
      console.log('created the organization');
    })
    .catch(() => {});
  const newOrganizationId = organization._id;
  await User.updateOne(
    { _id: currentUser._id },
    { $set: { organization: newOrganizationId } }
  ).catch(() => {});
  currentUser.organization = newOrganizationId;

  // update the organization on pipelines and deals for this user
  Pipeline.updateMany(
    { _id: currentUser._id },
    { $set: { organization: newOrganizationId } }
  ).catch(() => {});

  Deal.updateMany(
    { _id: currentUser._id },
    { $set: { organization: newOrganizationId } }
  ).catch(() => {});
};

const createInternalTeam = async (currentUser, user) => {
  let userTeam = await Team.findOne({
    owner: currentUser.id,
    is_internal: true,
  }).catch((err) => {
    console.log('internal community find error', err);
  });
  if (!userTeam) {
    const join_link = short.generate();
    const team = new Team({
      name: currentUser.user_name,
      owner: currentUser.id,
      is_internal: true,
      join_link,
    });
    userTeam = await team.save().catch((err) => {
      console.log('user community create error', err);
    });
  }

  await Team.updateOne(
    {
      _id: userTeam._id,
    },
    {
      $push: { members: user._id },
    }
  ).catch((err) => {
    console.log('internal community update error', err);
  });

  // Assignee info
  await User.updateOne(
    {
      _id: user._id,
    },
    {
      $set: {
        assignee_info: {
          is_enabled: true,
        },
      },
    }
  ).catch((err) => {
    console.log('Sub account update error', err);
  });

  // owner assingee info
  await User.updateOne(
    {
      _id: currentUser._id,
    },
    {
      $set: {
        assignee_info: {
          is_enabled: true,
          is_editable: true,
        },
      },
    }
  ).catch((err) => {
    console.log('Primary account update error', err);
  });
};

/// /////////////////// user helper function 2023/9/20/////////////////////
const activeUser = async (_id, data) => {
  return new Promise(async (resolve, reject) => {
    await User.updateOne(
      { _id },
      {
        $set: {
          ...data,
          user_disabled: false,
          'subscription.is_failed': false,
        },
        $unset: {
          data_released: true,
          data_cleaned: true,
          'subscription.is_paused': true,
        },
      }
    ).catch((error) => {
      reject(error);
    });
    Notification.deleteOne({
      type: 'personal',
      $or: [
        { criteria: 'subscription_failed' },
        { criteria: 'subscription_ended' },
      ],
      user: _id,
    }).catch((error) => {
      console.log('notification delete error', error.message);
    });
    resolve(true);
  });
};

const pauseUser = async (_id) => {
  return new Promise(async (resolve, reject) => {
    await User.updateOne(
      { _id },
      {
        $set: {
          'subscription.is_paused': true,
        },
      }
    ).catch((error) => {
      reject(error);
    });
    resolve(true);
  });
};

const disableUser = async (data) => {
  const { _id, close_reason, close_feedback, is_immediately } = data;
  const set_data = {
    user_disabled: true,
    close_reason,
    close_feedback,
  };
  if (is_immediately) {
    set_data.data_released = false;
    set_data.data_cleaned = false;
    set_data.disabled_at = new Date();
  }

  return new Promise(async (resolve, reject) => {
    await User.updateOne(
      { _id },
      {
        $set: set_data,
      }
    ).catch((error) => {
      reject(error);
    });
    resolve(true);
  });
};

const suspendUser = async (_id) => {
  return new Promise(async (resolve, reject) => {
    suspendData(_id);
    await User.updateOne(
      { _id },
      {
        $set: {
          user_disabled: true,
          'subscription.is_failed': true,
          'subscription.is_suspended': true,
          data_released: false,
          data_cleaned: false,
          disabled_at: new Date(),
        },
      }
    ).catch((error) => {
      reject(error);
    });
    resolve(true);
  });
};

const removeUser = async (_id) => {
  return new Promise(async (resolve, reject) => {
    await User.deleteOne({ _id }).catch((error) => {
      reject(error);
    });
    resolve(true);
  });
};

const sleepUser = async (user) => {
  return new Promise(async (resolve, reject) => {
    await User.updateOne(
      {
        _id: user._id,
      },
      {
        $set: {
          'subscription.is_suspended': true,
          package_level: 'SLEEP',
          can_restore_seat: false,
          old_package_level: user.package_level,
        },
      }
    ).catch((error) => {
      reject(error);
    });
    Notification.replaceOne(
      {
        type: 'personal',
        criteria: 'user_sleep',
        user: user.id,
      },
      {
        type: 'personal',
        criteria: 'user_sleep',
        user: user.id,
        is_banner: true,
        banner_style: 'warning',
        del: false,
        content: `<span>You are now in sleep mode. You can activate your account by clicking here. <a href=‘javascript: wakeup()’>Activate</a></span>`,
      },
      { upsert: true }
    ).catch((error) => {
      console.log('Notification replace failed', error);
    });
    resolve(true);
  });
};

const deleteVortexEmailTokens = async (vortexId) => {
  const identityTokens = await getAllTokens({
    userId: vortexId,
    query: 'omitDetails=true',
  }).catch((error) => {
    console.log('identity tokens get error', error.message || error.msg);
  });
  (identityTokens || []).forEach(async (account) => {
    if (
      account.provider === 'google' &&
      account.scopes.includes('https://www.googleapis.com/auth/gmail.send')
    ) {
      await deleteTokenById({ userId: vortexId, tokenId: account.id });
    }
    if (
      account.provider === 'microsoft' &&
      account.scopes.includes('https://graph.microsoft.com/mail.send')
    ) {
      await deleteTokenById({ userId: vortexId, tokenId: account.id });
    }
  });
};

const checkIdentityTokens = async (currentUser) => {
  try {
    if (currentUser.source === 'vortex' && currentUser.vortex_id) {
      const identityTokens = await getAllTokens({
        userId: currentUser.vortex_id,
        // query: 'omitDetails=true',
      }).catch((error) => {
        console.log('identity tokens get error', error.message || error.msg);
      });
      delete currentUser._doc.connected_email;
      delete currentUser._doc.connected_email_type;
      currentUser.primary_connected = false;
      currentUser.calendar_connected = false;
      currentUser.calendar_list = [];
      (identityTokens || []).forEach((account) => {
        if (account.provider === 'google_email') {
          currentUser.connected_email_type = 'gmail';
          currentUser.connected_email = account.account;
          currentUser.primary_connected = true;
          currentUser.connected_email_id = account.id;
          currentUser.google_refresh_token = JSON.stringify(
            account.credentials
          );
        } else if (account.provider === 'google_calendar') {
          currentUser.calendar_connected = true;
          currentUser.calendar_list.push({
            connected_calendar_type: 'google',
            connected_email: account.account,
            id: account.id,
            google_refresh_token: JSON.stringify(account.credentials),
          });
        } else if (account.provider === 'microsoft_email') {
          currentUser.connected_email_type = 'outlook';
          currentUser.connected_email = account.account;
          currentUser.connected_email_id = account.id;
          currentUser.primary_connected = true;
          currentUser.outlook_refresh_token = account.credentials.refresh_token;
        } else if (account.provider === 'microsoft_calendar') {
          currentUser.calendar_connected = true;
          currentUser.calendar_list.push({
            connected_calendar_type: 'outlook',
            connected_email: account.account,
            id: account.id,
            outlook_refresh_token: account.credentials.refresh_token,
          });
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
};

const getOauthClients = (source) => {
  const credentials = {
    client: {
      id: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_ID,
      secret: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_SECRET,
    },
    auth: {
      authorizeHost: 'https://login.microsoftonline.com',
      authorizePath: 'common/oauth2/v2.0/authorize',
      tokenHost: 'https://login.microsoftonline.com',
      tokenPath: 'common/oauth2/v2.0/token',
    },
  };
  const vortexCredentials = {
    client: {
      id: api.OUTLOOK_VORTEX_CLIENT.OUTLOOK_CLIENT_ID,
      secret: api.OUTLOOK_VORTEX_CLIENT.OUTLOOK_CLIENT_SECRET,
    },
    auth: {
      authorizeHost: 'https://login.microsoftonline.com',
      authorizePath: 'common/oauth2/v2.0/authorize',
      tokenHost: 'https://login.microsoftonline.com',
      tokenPath: 'common/oauth2/v2.0/token',
    },
  };

  let msClient;
  if (source === 'vortex') {
    msClient = new AuthorizationCode(vortexCredentials);
  } else {
    msClient = new AuthorizationCode(credentials);
  }

  const GMAIL_CLIENT_ID =
    source === 'vortex'
      ? api.GMAIL_VORTEX_CLIENT.GMAIL_CLIENT_ID
      : api.GMAIL_CLIENT.GMAIL_CLIENT_ID;
  const GMAIL_CLIENT_SECRET =
    source === 'vortex'
      ? api.GMAIL_VORTEX_CLIENT.GMAIL_CLIENT_SECRET
      : api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET;

  const googleClient = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);

  return { msClient, googleClient };
};

const saveVersionInfo = (user, vInfo) => {
  console.log('save version info params', user, vInfo);
  if (vInfo) {
    User.updateOne({ _id: user }, { $set: vInfo }).catch((err) => {
      console.log('version info saving is failed.', err);
    });
  }
};

/**
 * Find the user's orgnization and set the field with that
 * @param {mongooseObject} user
 * @returns
 */
const getUserOrganization = async (user) => {
  if (!user.organization) {
    return;
  }
  const organization = await Organization.findById(user.organization);
  if (organization) {
    user.organization = organization;
  }
};

const saveDeviceToken = (user, os, player_id) => {
  let query = {};
  if (os === 'ios') {
    query = {
      iOSDeviceToken: player_id,
    };
  } else {
    query = {
      androidDeviceToken: player_id,
    };
  }
  User.updateOne({ _id: user }, { $set: query }).catch((err) => {
    console.log('device token saving is failed.', err);
  });
};

module.exports = {
  createUser,
  cleanupUserData,
  setPackage,
  addOnboard,
  addAdmin,
  suspendData,
  releaseData,
  clearData,
  cancelWavvDialer,
  paidEliteOnboardSetup,
  promocodeCheck,
  addNickName,
  removeTeamAutomation,
  removeTeamEmailTemplate,
  removeSharedItems,
  createAdminFolder,
  userProfileOutputGuard,
  createInternalTeam,
  disableUser,
  suspendUser,
  removeUser,
  pauseUser,
  activeUser,
  sleepUser,
  deleteVortexEmailTokens,
  cancelCustomer,
  cancelSubscription,
  checkIdentityTokens,
  getOauthClients,
  saveVersionInfo,
  saveDeviceToken,
  getUserOrganization,
  createOrganizationAndInternalTeam,
  checkRecaptchaToken,
};
