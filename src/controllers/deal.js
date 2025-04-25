const mongoose = require('mongoose');
const moment = require('moment-timezone');
const { S3Client } = require('@aws-sdk/client-s3');
const { SESClient, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');

const User = require('../models/user');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const Note = require('../models/note');
const FollowUp = require('../models/follow_up');
const ActivityHelper = require('../helpers/activity');
const DealHelper = require('../helpers/deal');
const Email = require('../models/email');
const Text = require('../models/text');
const Organization = require('../models/organization');
const Appointment = require('../models/appointment');
const TeamCall = require('../models/team_call');
const Notification = require('../models/notification');
const Garbage = require('../models/garbage');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Task = require('../models/task');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const EmailTracker = require('../models/email_tracker');
const Automation = require('../models/automation');
const TimeLine = require('../models/time_line');
const Pipeline = require('../models/pipe_line');
const AutomationLine = require('../models/automation_line');
const { assignTimeline } = require('../helpers/automation');
const {
  addGoogleCalendarById,
  addOutlookCalendarById,
  updateGoogleCalendarById,
  updateOutlookCalendarById,
  removeGoogleCalendarById,
  removeOutlookCalendarById,
} = require('../helpers/appointment');
const { sendEmail, updateUserCount } = require('../helpers/email');
const { sendText, checkTextCount } = require('../helpers/text');
const { giveRateContacts, shareContact } = require('../helpers/contact');
const api = require('../configs/api');
const urls = require('../constants/urls');
const mail_contents = require('../constants/mail_contents');
const { getAvatarName, compareArraysToString } = require('../helpers/utility');
const { v1: uuidv1 } = require('uuid');
const _ = require('lodash');
const PhoneLog = require('../models/phone_log');
const { createDealFollowUp } = require('../helpers/followup');
const { outbound_constants } = require('../constants/variable');
const {
  getAddDealOutboundData,
  getMoveDealOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');
const { removeFile } = require('../helpers/fileUpload');
const { removeAutomationLine } = require('../services/automation_line');
const {
  updateContacts: updateTimelineContactsMicroApi,
} = require('../services/time_line');
const { triggerTimeline } = require('../services/time_line');
const { bulkAssign } = require('../helpers/task');
const { sendNotificationEmail } = require('../helpers/notification');
const { checkIdentityTokens, getOauthClients } = require('../helpers/user');
const { triggerAutomation } = require('../helpers/automation');

const DEAL_MAX_CONTACTS = 10;
const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const getAll = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  const data = await Deal.find({
    user: currentUser.id,
    contacts: { $in: contacts },
  });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Deal doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser, guest_loggin, guest, mode } = req;
  const { contacts, team_members, has_child_automation } = req.body;

  if (contacts.length > DEAL_MAX_CONTACTS) {
    return res.status(400).json({
      status: false,
      error: `A Deal can‘t have more than ${DEAL_MAX_CONTACTS} contacts`,
    });
  }

  const deal = new Deal({
    ...req.body,
    primary_contact: req.body.primary_contact || contacts[0],
    user: currentUser.id,
    put_at: new Date(),
  });

  const deal_stage = await DealStage.findOne({
    _id: req.body.deal_stage,
  }).catch((err) => {
    console.log('deal stage found error', err.message);
    return res.status(500).send(err.message || 'Deal found error');
  });

  const pipe_line = await Pipeline.findOne({ _id: deal_stage.pipe_line }).catch(
    (err) => {
      console.log('pipeline found error', err.message);
      return res.status(500).send(err.message || 'Pipeline found error');
    }
  );
  let running_automation = false;
  if (
    deal_stage.automation &&
    pipe_line.has_automation &&
    !has_child_automation
  ) {
    const data = {
      automation_id: deal_stage.automation,
      assign_array: [deal.id],
      user_id: currentUser.id,
      required_unique: mode !== 'automation',
      type: 'deal',
      mode,
      assigned_contacts: deal.contacts,
    };

    assignTimeline(data)
      .then(({ due_date, result: _res }) => {
        if (!_res[0].status) {
          console.log('automation assign err', _res[0].error);
        }
      })
      .catch((err) => {
        console.log('assign automation err', err.message);
      });
    running_automation = true;
  }

  let detail_content = 'added deal';

  if (guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
  } else if (mode === 'automation') {
    detail_content = ActivityHelper.automationLog('added deal');
  }

  const activity = new Activity({
    user: currentUser.id,
    content: detail_content,
    type: 'deals',
    deals: deal.id,
    deal_stages: req.body.deal_stage,
  });

  await activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  let teamId;
  if (currentUser.organization_info?.is_enabled && currentUser.organization) {
    const organization = await Organization.findOne({
      _id: currentUser.organization,
    }).catch((e) => console.log(e.message));
    if (organization) {
      teamId = organization.team;
    }
  }
  deal
    .save()
    .then(async (_deal) => {
      DealStage.updateOne(
        {
          _id: req.body.deal_stage,
        },
        {
          $push: { deals: _deal._id },
        }
      ).catch((err) => {
        console.log('error', err.message);
      });
      const _contacts = await Contact.find(
        {
          _id: { $in: contacts },
        },
        {
          first_name: 1,
          last_name: 1,
        }
      ).catch((err) => console.log(err.message));
      const idx = _contacts?.findIndex(
        (e) => e._id.toString() === req.body.primary_contact
      );
      const _primary_contact = _contacts[idx];
      for (let i = 0; i < contacts.length; i++) {
        const _activity = new Activity({
          content: detail_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'deals',
          deals: _deal.id,
          deal_stages: req.body.deal_stage,
        });

        _activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        if (teamId && !contacts[i].shared_all_member) {
          shareContact(contacts[i], currentUser._id, [], teamId, 'all_member');
        }
        Contact.updateOne(
          { _id: contacts[i] },
          { $set: { last_activity: _activity.id } }
        ).catch((err) => {
          console.log('contact update err', err.message);
        });
      }

      const myJSON = JSON.stringify({
        ..._deal._doc,
        contacts: _contacts,
        primary_contact: [_primary_contact],
      });
      const data = JSON.parse(myJSON);
      data.deal_stage = req.body.deal_stage;
      data.activity = activity;
      data.running_automation = running_automation;
      const params = { _id: deal._id };
      await outboundCallhookApi(
        currentUser.id,
        outbound_constants.ADD_DEAL,
        getAddDealOutboundData,
        params
      );

      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const winDeal = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;

  const deal = await Deal.findOne({
    _id: req.params.id,
  });

  let detail_content = 'won deal';
  if (guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
  }

  const activity = new Activity({
    user: currentUser.id,
    content: detail_content,
    type: 'deals',
    deals: deal.id,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  if (deal.contatcts) {
    for (let i = 0; i < deal.contacts.length; i++) {
      const activity = new Activity({
        contacts: deal.contacts[i],
        content: detail_content,
        type: 'deals',
        user: currentUser.id,
        deals: deal.id,
      });
      activity.save().catch((err) => {
        console.log('create deal activity err', err.message);
      });
    }
  }

  return res.send({
    status: true,
  });
};

const moveDeal = async (req, res) => {
  const { currentUser, guest_loggin, guest, mode } = req;
  const { deal_id, position, is_move_next, has_child_automation } = req.body;
  let { deal_stage_id } = req.body;

  if (!deal_id) {
    return res.status(500).send({ status: false, error: 'Deal found error' });
  }
  const deal = await Deal.findOne({ _id: deal_id }).catch((err) => {
    console.log('deal found error', err.message);
    if (mode === 'automation')
      return res
        .status(500)
        .send({ status: false, error: err.message || 'Deal found error' });
  });
  if (!deal_stage_id) {
    if (is_move_next) {
      const source_deal_stage = await DealStage.findOne({
        _id: deal.deal_stage,
      });

      if (source_deal_stage) {
        // move to next deal
        let priority = source_deal_stage.priority;
        priority++;

        const next_deal_stage = await DealStage.findOne({
          user: mongoose.Types.ObjectId(deal.user),
          pipe_line: mongoose.Types.ObjectId(source_deal_stage.pipe_line),
          priority,
        });

        if (next_deal_stage) {
          deal_stage_id = next_deal_stage._id;
        } else {
          deal_stage_id = deal.deal_stage;
        }
      }
    } else {
      deal_stage_id = deal.deal_stage;
    }
  }

  const deal_stage = await DealStage.findOne({ _id: deal_stage_id }).catch(
    (err) => {
      console.log('deal stage found error', err.message);
      return res
        .status(500)
        .send({ status: false, error: err.message || 'Deal found error' });
    }
  );
  const pipe_line = await Pipeline.findOne({ _id: deal_stage.pipe_line }).catch(
    (err) => {
      console.log('pipeline found error', err.message);
      return res
        .status(500)
        .send({ status: false, error: err.message || 'Pipeline found error' });
    }
  );
  const original_stage_id = deal.deal_stage;

  if (
    pipe_line &&
    original_stage_id + '' !== deal_stage_id + '' &&
    !has_child_automation
  ) {
    if (deal_stage.automation) {
      if (pipe_line.has_automation) {
        const data = {
          automation_id: deal_stage.automation,
          assign_array: [deal_id],
          user_id: currentUser.id,
          required_unique: mode !== 'automation',
          type: 'deal',
          mode,
          assigned_contacts: deal.contacts,
        };
        assignTimeline(data)
          .then(({ due_date, result: _res }) => {
            if (!_res[0].status) {
              console.log('automation assign err', _res[0].error);
            }
          })
          .catch((err) => {
            console.log('assign automation err', err.message);
          });
      }
    } else {
      if (pipe_line.no_automation && mode !== 'automation') {
        await removeAutomationLine({
          userId: currentUser.id,
          deal: deal_id,
          by_manual: true,
        });
      }
    }

    await triggerAutomation({
      user: currentUser,
      deals: [deal_id],
      trigger: {
        type: 'deal_stage_updated',
        detail: {
          stage: deal_stage_id,
        },
      },
    });
    await outboundCallhookApi(
      currentUser.id,
      outbound_constants.MOVE_DEAL,
      getMoveDealOutboundData,
      { deal_id, deal_stage_id }
    );
  }
  let activityId;
  try {
    await DealStage.updateOne(
      { _id: deal.deal_stage },
      {
        $pull: {
          deals: { $in: [mongoose.Types.ObjectId(deal_id)] },
        },
      },
      { new: true }
    ).catch((err) => {
      console.log('source deal stage update error', err.message);
      throw err.message || 'Source deal stage update error';
    });

    await Deal.updateOne(
      { _id: deal_id },
      {
        $set: {
          deal_stage: deal_stage_id,
          put_at: new Date(),
        },
      }
    ).catch((err) => {
      console.log('deal update error', err.message);
      throw err.message || 'deal update error';
    });

    if (deal.contacts && original_stage_id + '' !== deal_stage_id + '') {
      let detail_content = 'moved deal';
      if (guest_loggin) {
        detail_content = ActivityHelper.assistantLog(
          detail_content,
          guest.name
        );
      }
      if (mode === 'automation')
        detail_content = ActivityHelper.automationLog(detail_content);
      const activity = new Activity({
        user: currentUser.id,
        content: detail_content,
        type: 'deals',
        deals: deal.id,
        deal_stages: deal_stage_id,
      });

      await activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });
      if (mode === 'automation') activityId = activity._id;
      for (let i = 0; i < deal.contacts.length; i++) {
        const activity = new Activity({
          content: detail_content,
          contacts: deal.contacts[i],
          user: currentUser.id,
          type: 'deals',
          deals: deal.id,
          deal_stages: deal_stage_id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        Contact.updateOne(
          { _id: deal.contacts[i] },
          { $set: { last_activity: activity.id } }
        ).catch((err) => {
          console.log('contact deal update err', err.message);
        });
      }
    }

    await DealStage.updateOne(
      { _id: deal_stage_id },
      {
        $push: {
          deals: {
            $each: [deal_id],
            $position: position,
          },
        },
      }
    ).catch((err) => {
      console.log('destination deal stage update error', err.message);
      throw err.message || 'Destination deal stage update error';
    });
    if (mode === 'automation') {
      return res.send({
        status: true,
        data: { activityId },
      });
    }
    return res.send({
      status: true,
    });
  } catch (error) {
    return res.status(500).send({ status: false, error });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;

  DealHelper.remove(currentUser.id, req.params.id)
    .then((result) => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).json({
        status: false,
        error: 'Permission invalid',
      });
    });
};

const bulkRemove = async (req, res) => {
  const { currentUser } = req;
  const { deals } = req.body;

  const removed_deals = [];
  const promise_array = [];
  deals.forEach((id) => {
    const promise = new Promise(async (resolve) => {
      const deal = await Deal.findOne({
        _id: id,
        user: currentUser.id,
      }).catch((err) => {
        console.log('deal find err', err.message);
      });

      if (!deal) {
        console.log('deal not found', id);
        resolve();
        return;
      }

      await DealHelper.remove(currentUser.id, id);
      removed_deals.push(id);
      resolve();
    });
    promise_array.push(promise);
  });

  Promise.all(promise_array)
    .then(() => {
      return res.send({
        status: true,
        removed_deals,
      });
    })
    .catch((err) => {
      console.log('bulk removing deals error', err);
      return res.send({
        status: true,
        removed_deals,
      });
    });
};

const removeOnlyDeal = async (req, res) => {
  const { currentUser } = req;

  DealHelper.removeOnlyDeal(currentUser, req.params.id)
    .then((result) => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).json({
        status: false,
        error: 'Permission invalid',
      });
    });
};

const edit = async (req, res) => {
  const { currentUser } = req;
  const dealId = req.params.id;
  const body = req.body;
  const { contacts, team_members, applyChangeToTimelines } = req.body;
  const currentDeal = await Deal.findOne({
    _id: dealId,
    user: currentUser._id,
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || JSON.stringify(err),
    });
  });

  if (!currentDeal) {
    return res.status(400).send({
      status: false,
      error: 'Not found current deal.',
    });
  }

  if (!contacts?.length) {
    return res.status(400).send({
      status: false,
      error: `There are no contacts in the request.`,
    });
  }

  let primary_contact = body?.primary_contact;
  if (!body?.primary_contact || !contacts.includes(body?.primary_contact)) {
    primary_contact = contacts[0];
  }

  let teamId;
  if (currentUser.organization_info?.is_enabled && currentUser.organization) {
    const organization = await Organization.findOne({
      _id: currentUser.organization,
    }).catch((e) => console.log(e.message));
    if (organization) {
      teamId = organization.team;
    }
  }

  const original_contacts = currentDeal.contacts;
  let removeContactIds = original_contacts;
  const addContactIds = [];
  contacts.forEach((contact) => {
    if (!original_contacts.includes(new mongoose.Types.ObjectId(contact))) {
      addContactIds.push(new mongoose.Types.ObjectId(contact));
    } else {
      removeContactIds = removeContactIds.filter(
        (id) => id.toString() !== contact
      );
    }
  });

  if (addContactIds.length > 0) {
    if (contacts.length > DEAL_MAX_CONTACTS) {
      return res.status(400).send({
        status: false,
        error: `A deal can't have 10 contacts more`,
      });
    }
  }

  Deal.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    { $set: { ...body, primary_contact } }
  )
    .then(async () => {
      const deal_stage =
        currentDeal.deal_stage.toString() === body.deal_stage.toString()
          ? currentDeal.deal_stage
          : body.deal_stage;
      if (currentDeal.deal_stage + '' !== body.deal_stage + '') {
        await DealStage.updateOne(
          { _id: currentDeal.deal_stage },
          { $pull: { deals: currentDeal._id } }
        ).catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message || JSON.stringify(err),
          });
        });
        await DealStage.updateOne(
          { _id: body.deal_stage },
          { $addToSet: { deals: currentDeal._id } }
        ).catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message || JSON.stringify(err),
          });
        });
        // contact share
        for (let i = 0; i < contacts.length; i++) {
          if (teamId && !contacts[i].shared_all_member) {
            shareContact(
              contacts[i],
              currentUser._id,
              [],
              teamId,
              'all_member'
            );
          }
        }
        const activity = new Activity({
          user: currentUser.id,
          content: 'moved deal',
          type: 'deals',
          deals: dealId,
          deal_stages: body.deal_stage,
        });
        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        triggerAutomation({
          user: currentUser,
          deals: [dealId],
          trigger: {
            type: 'deal_stage_updated',
            detail: {
              stage: body.deal_stage,
            },
          },
        });

        for (let i = 0; i < contacts.length; i++) {
          const activity = new Activity({
            content: 'moved deal',
            contacts: contacts[i],
            user: currentUser.id,
            type: 'deals',
            deals: dealId,
            deal_stages: body.deal_stage,
          });

          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          Contact.updateOne(
            { _id: contacts[i] },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('contact deal update err', err.message);
          });
        }
      }
      let detail_content = '';
      if (removeContactIds.length > 0) {
        await DealHelper.removeContacts(
          currentUser,
          req.params.id,
          removeContactIds,
          deal_stage
        );
      }
      if (addContactIds.length > 0) {
        detail_content = 'added contact';
        for (let i = 0; i < contacts.length; i++) {
          const activity = new Activity({
            content: detail_content,
            contacts: contacts[i],
            user: currentUser.id,
            type: 'deals',
            deals: req.params.id,
            deal_stages: deal_stage,
          });

          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          if (teamId && !contacts[i].shared_all_member) {
            shareContact(
              contacts[i],
              currentUser._id,
              [],
              teamId,
              'all_member'
            );
          }
          Contact.updateOne(
            { _id: contacts[i] },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });
        }
        if (applyChangeToTimelines) {
          await updateTimelineContactsMicroApi({
            deal_id: req.params.id,
            userId: currentUser.id,
            contacts: addContactIds,
            action: 'add',
          });
        }
      }
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const updateContact = async (req, res) => {
  const { currentUser } = req;
  const { action, contacts, deleteAllDealData, isAssign = false } = req.body;

  if (!req.params.id) {
    return res.status(500).send('Deal found error');
  }

  const _deal = await Deal.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  let query;
  if (action === 'add') {
    if (_deal.contacts.length > DEAL_MAX_CONTACTS - 1) {
      return res.status(400).send({
        status: false,
        error: `A deal can't have 10 contacts more`,
      });
    }
    query = { $addToSet: { contacts: { $each: contacts } } };
  } else if (action === 'remove') {
    if (contacts.includes(_deal?.primary_contact?.toString())) {
      return res.status(400).send({
        status: false,
        error: `You can't remove these contacts from the deal because it includes primary contact.`,
      });
    }
    const equalArray = _deal
      ? compareArraysToString(_deal?.contacts, contacts)
      : false;
    if (!equalArray) {
      query = { $pull: { contacts: { $in: contacts } } };
    } else {
      return res.status(400).send({
        status: false,
        error: `You can't remove all contacts in this deal`,
      });
    }
  }

  if (action === 'remove') {
    await DealHelper.removeContacts(
      currentUser,
      req.params.id,
      contacts,
      _deal.deal_stage
    );
  }

  if (_deal) {
    let teamId;
    if (currentUser.organization_info?.is_enabled && currentUser.organization) {
      const organization = await Organization.findOne({
        _id: currentUser.organization,
      }).catch((e) => console.log(e.message));
      if (organization) {
        teamId = organization.team;
      }
    }
    const team_members = _deal.team_members;
    await Deal.updateOne(
      {
        _id: req.params.id,
        user: currentUser.id,
      },
      query
    )
      .then((result) => {
        let detail_content = '';
        if (action === 'add') {
          detail_content = 'added contact';
          for (let i = 0; i < contacts.length; i++) {
            const activity = new Activity({
              content: detail_content,
              contacts: contacts[i],
              user: currentUser.id,
              type: 'deals',
              deals: req.params.id,
              deal_stages: _deal.deal_stage,
            });

            activity.save().catch((err) => {
              console.log('activity save err', err.message);
            });

            if (teamId && !contacts[i].shared_all_member) {
              shareContact(
                contacts[i],
                currentUser._id,
                [],
                teamId,
                'all_member'
              );
            }
            Contact.updateOne(
              { _id: contacts[i] },
              { $set: { last_activity: activity.id } }
            ).catch((err) => {
              console.log('err', err);
            });
          }
          if (isAssign) {
            updateTimelineContactsMicroApi({
              deal_id: req.params.id,
              userId: currentUser.id,
              contacts,
              action,
            });
          }
        } else {
          detail_content = 'removed deal';
        }
        res.send({
          status: true,
        });
      })
      .catch((err) => {
        res.status(500).send({
          status: false,
          error: err.message || JSON.stringify(err),
        });
      });
  } else {
    return res.status(400).send({
      status: false,
      error: 'Not found current deal.',
    });
  }
};

const getDetail = (req, res) => {
  const id = req.params.id;

  Deal.findOne({ _id: id })
    .populate({
      path: 'contacts',
      select: '_id first_name last_name email cell_phone',
    })
    .populate({
      path: 'deal_stage',
      select: '_id title pipe_line',
      populate: { path: 'pipe_line', select: '_id title' },
    })
    .populate({
      path: 'team_members',
      select: '_id user_name email picture_profile',
    })
    .then(async (_deal) => {
      return res.send({
        status: true,
        data: {
          main: _deal,
          contacts: _deal?.contacts || [],
          primary_contact: _deal?.primary_contact,
          activities: [],
        },
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const getDeals = async (req, res) => {
  const { dealIds } = req.body;
  const data = {};
  const deals = [];
  if (dealIds.length) {
    for (let i = 0; i < dealIds.length; i++) {
      const _deal = await Deal.findById(dealIds[i]._id).populate({
        path: 'deal_stage',
        select: '_id title user priority duration',
      });
      if (!_deal) {
        continue;
      }
      const _contacts = await Contact.find({
        _id: { $in: _deal.contacts },
      }).select({
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
      });

      deals.push({
        deal: _deal,
        contacts: _contacts,
      });
    }
  }
  Object.assign(data, { deals, count: dealIds.length });

  res.send({
    status: true,
    data,
  });
};

const getSiblings = (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  DealStage.findOne({ deals: id, user: currentUser._id })
    .then((_stage) => {
      Deal.find({ _id: { $in: _stage.deals } })
        .select({ _id: true, title: true, contacts: true })
        .then(async (_deals) => {
          const existingDealIds = _deals.map((_d) => _d._id + '');
          const deals = _.keyBy(_deals, (_d) => {
            return _d._id + '';
          });
          const currentPos = _stage.deals.indexOf(id);
          let prevDealId;
          let nextDealId;
          let prevDeal = null;
          let nextDeal = null;
          for (let i = currentPos - 1; i >= 0; i--) {
            const cursor = _stage.deals[i] + '';
            if (existingDealIds.indexOf(cursor) !== -1) {
              prevDealId = cursor;
              break;
            }
          }
          for (let i = currentPos + 1; i < _stage.deals.length; i++) {
            const cursor = _stage.deals[i] + '';
            if (existingDealIds.indexOf(cursor) !== -1) {
              nextDealId = cursor;
              break;
            }
          }
          if (prevDealId) {
            prevDeal = deals[prevDealId];
            if (prevDeal && prevDeal.contacts) {
              const _contacts = await Contact.find({
                _id: { $in: prevDeal.contacts },
              })
                .select({
                  _id: true,
                  first_name: true,
                  last_name: true,
                  cell_phone: true,
                  email: true,
                })
                .catch((err) => {
                  console.log('Fail: Prev deal contacts', err);
                });
              prevDeal.contacts = _contacts;
            } else {
              prevDeal.contacts = [];
            }
          }
          if (nextDealId) {
            nextDeal = deals[nextDealId];
            if (nextDeal && nextDeal.contacts) {
              const _contacts = await Contact.find({
                _id: { $in: nextDeal.contacts },
              })
                .select({
                  _id: true,
                  first_name: true,
                  last_name: true,
                  cell_phone: true,
                  email: true,
                })
                .catch((err) => {
                  console.log('Fail: Next deal contacts', err);
                });
              nextDeal.contacts = _contacts;
            } else {
              nextDeal.contacts = [];
            }
          }
          return res.send({
            status: true,
            prev: prevDeal,
            next: nextDeal,
          });
        })
        .catch((err) => {
          console.log('Fail: Deals getting failed.', err);
          return res.send({
            status: true,
            prev: null,
            next: null,
          });
        });
    })
    .catch((err) => {
      console.log('Fail: Deal Stage getting failed.', err);
      return res.send({
        status: true,
        prev: null,
        next: null,
      });
    });
};

const getActivity = async (req, res) => {
  const { currentUser } = req;
  const { count } = req.body;
  const startTime = new Date().getTime();

  // Contact Activity List
  let _activity_list;

  if (count) {
    _activity_list = await Activity.find({
      deals: req.body.deal,
    })
      .populate({
        path: 'user',
        select: {
          user_name: 1,
        },
      })
      .sort({ updated_at: -1 })
      .limit(count);
  } else {
    _activity_list = await Activity.find({
      deals: req.body.deal,
    })
      .populate({
        path: 'user',
        select: {
          user_name: 1,
        },
      })
      .sort({ updated_at: 1 });
  }

  // Contact Relative Details
  const videoIds = [];
  const imageIds = [];
  const pdfIds = [];
  const materials = [];
  let notes = [];
  let emails = [];
  let texts = [];
  let appointments = [];
  let tasks = [];
  let phone_logs = [];
  const automationIds = [];

  if (count) {
    const loadedIds = [];
    const noteIds = [];
    const emailIds = [];
    const textIds = [];
    const apptIds = [];
    const taskIds = [];
    const dealIds = [];
    const phoneLogIds = [];

    for (let i = 0; i < _activity_list.length; i++) {
      const _activity = _activity_list[i];
      if (
        [
          'notes',
          'emails',
          'texts',
          'appointments',
          'follow_ups',
          'deals',
          'phone_logs',
          'automations',
        ].indexOf(_activity.type) !== -1
      ) {
        let detail_id = _activity[_activity.type];
        if (detail_id instanceof Array) {
          detail_id = detail_id[0];
        }
        if (loadedIds.indexOf(detail_id) === -1) {
          switch (_activity.type) {
            case 'notes':
              noteIds.push(detail_id);
              break;
            case 'emails': {
              emailIds.push(detail_id);
              break;
            }
            case 'texts': {
              textIds.push(detail_id);
              break;
            }
            case 'appointments':
              apptIds.push(detail_id);
              break;
            case 'follow_ups':
              taskIds.push(detail_id);
              break;
            case 'deals':
              dealIds.push(detail_id);
              break;
            case 'automations':
              automationIds.push(detail_id);
              break;
            case 'phone_logs':
              phoneLogIds.push(detail_id);
          }
        }
      }
    }
    notes = await Note.find({ _id: { $in: noteIds } });
    emails = await Email.find({ _id: { $in: emailIds } }).populate([
      { path: 'video_tracker', model: VideoTracker },
      { path: 'image_tracker', model: ImageTracker },
      { path: 'pdf_tracker', model: PDFTracker },
      { path: 'email_tracker' },
    ]);
    texts = await Text.find({ _id: { $in: textIds } }).populate([
      { path: 'video_tracker', model: VideoTracker },
      { path: 'image_tracker', model: ImageTracker },
      { path: 'pdf_tracker', model: PDFTracker },
    ]);
    appointments = await Appointment.find({ _id: { $in: apptIds } });
    tasks = await FollowUp.find({
      $or: [
        { _id: { $in: taskIds } },
        { parent_follow_up: { $exists: true, $in: taskIds } },
      ],
    });
    phone_logs = await PhoneLog.find({ _id: { $in: phoneLogIds } });
  } else {
    notes = await Note.find({ deal: req.body.deal });
    emails = await Email.find({ deal: req.body.deal }).populate([
      { path: 'video_tracker', model: VideoTracker },
      { path: 'image_tracker', model: ImageTracker },
      { path: 'pdf_tracker', model: PDFTracker },
      { path: 'email_tracker' },
    ]);
    texts = await Text.find({ deal: req.body.deal }).populate([
      { path: 'video_tracker', model: VideoTracker },
      { path: 'image_tracker', model: ImageTracker },
      { path: 'pdf_tracker', model: PDFTracker },
    ]);
    appointments = await Appointment.find({ deal: req.body.deal });
    tasks = await FollowUp.find({ deal: req.body.deal });
    phone_logs = await PhoneLog.find({ deal: req.body.deal });
  }

  for (let i = 0; i < _activity_list.length; i++) {
    const e = _activity_list[i];
    if (
      (e['type'] === 'emails' && e['emails']) ||
      (e['type'] === 'texts' && e['texts'])
    ) {
      if (e['videos'] instanceof Array) {
        Array.prototype.push.apply(videoIds, e['videos']);
      } else {
        videoIds.push(e['videos']);
      }
      if (e['pdfs'] instanceof Array) {
        Array.prototype.push.apply(pdfIds, e['pdfs']);
      } else {
        pdfIds.push(e['pdfs']);
      }
      if (e['images'] instanceof Array) {
        Array.prototype.push.apply(imageIds, e['images']);
      } else {
        imageIds.push(e['images']);
      }
    }
    if (e['type'] === 'automations') {
      if (e['automations']) {
        automationIds.push(e['automations']);
      }
    }
  }

  const automationLineMap = new Map(
    (
      await AutomationLine.find({
        _id: {
          $in: _activity_list
            .map((activity) => activity.automation_lines)
            .filter(Boolean),
        },
      }).select('_id user title status deal')
    ).map((line) => [line._id.toString(), line])
  );

  _activity_list.forEach((activity) => {
    if (activity.automation_lines) {
      activity.automation_lines =
        automationLineMap.get(activity.automation_lines.toString()) || null;
    }
  });

  const sharedCallLogIds = phone_logs.map((e) => e._id);
  const videos = await Video.find({ _id: { $in: videoIds } });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } });
  const images = await Image.find({ _id: { $in: imageIds } });
  const sub_calls = await PhoneLog.find({
    shared_log: { $in: sharedCallLogIds },
  });
  Array.prototype.push.apply(materials, videos);
  Array.prototype.push.apply(materials, pdfs);
  Array.prototype.push.apply(materials, images);
  const automations = await Automation.find({ _id: { $in: automationIds } });

  const data = {
    activity: _activity_list,

    details: {
      materials,
      notes,
      emails,
      texts,
      appointments,
      tasks,
      phone_logs,
      sub_calls,
      automations,
    },
  };

  return res.send({
    status: true,
    data,
  });
};

const getTimeLines = async (req, res) => {
  const { currentUser } = req;
  const dealId = req.params.id;

  const _deal = await Deal.findOne({ _id: dealId }).catch((err) => {
    console.log('deal found err', err.message);
  });

  if (_deal) {
    const automation_line = await AutomationLine.findOne({
      deal: dealId,
      automation: { $ne: null },
      user: currentUser.id,
      status: 'running',
    });

    const data = {};
    if (automation_line) {
      const _timelines = await TimeLine.find({
        automation_line: automation_line._id,
      });
      data.time_lines = _timelines;
      data.automation = automation_line?.automation;
      data.automation_line = automation_line;
    }
    return res.send({
      status: true,
      data,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Deal not found',
    });
  }
};

const getAllTimeLines = async (req, res) => {
  const { currentUser } = req;
  // TimeLines
  const _timelines = await TimeLine.find({
    type: 'deal',
    user: currentUser.id,
    automation: { $ne: null },
  })
    .populate({ path: 'automation', select: 'title', model: Automation })
    .catch((err) => {
      console.log('err', err);
    });

  const data = {
    time_lines: _timelines,
  };

  return res.send({
    status: true,
    data,
  });
};

const getMaterialActivity = async (req, res) => {
  const { currentUser } = req;
  let send_activityIds;
  let email_trackers;
  let send_activities;
  const deal_activity = await Activity.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (deal_activity['type'] === 'emails') {
    const emailIds = [deal_activity.emails];

    send_activities = await Activity.find({
      user: currentUser._id,
      emails: { $in: emailIds },
    }).select({
      _id: 1,
      contacts: 1,
      status: 1,
      type: 1,
    });

    send_activityIds = send_activities.map((e) => e._id);

    email_trackers = await EmailTracker.find({
      activity: { $in: send_activityIds },
    }).catch((err) => {
      console.log('deal video tracker find err', err.message);
    });
  } else {
    const textIds = [deal_activity.texts];
    send_activities = await Activity.find({
      user: currentUser._id,
      texts: { $in: textIds },
    }).select({
      _id: 1,
      contacts: 1,
      status: 1,
      type: 1,
    });

    send_activityIds = send_activities.map((e) => e._id);
  }
  const video_trackers = await VideoTracker.find({
    activity: { $in: send_activityIds },
  }).catch((err) => {
    console.log('deal video tracker find err', err.message);
  });

  const pdf_trackers = await PDFTracker.find({
    activity: { $in: send_activityIds },
  }).catch((err) => {
    console.log('deal pdf tracker find err', err.message);
  });

  const image_trackers = await ImageTracker.find({
    activity: { $in: send_activityIds },
  }).catch((err) => {
    console.log('deal image tracker find err', err.message);
  });
  send_activities = send_activities?.filter(
    (item) => item.type === 'texts' || item.type === 'emails'
  );
  return res.send({
    status: true,
    data: {
      video_trackers,
      pdf_trackers,
      image_trackers,
      email_trackers,
      send_activities,
    },
  });
};

const getNotes = async (req, res) => {
  const { currentUser } = req;
  const notes = await Note.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: notes,
  });
};

const createNote = async (req, res) => {
  const { currentUser, mode } = req;
  let data = {};
  if (req.body.data) {
    data = JSON.parse(req.body.data);
  } else {
    data = { ...req.body };
  }
  const { deal, content, contacts } = data;

  const file = req.file;
  let location;
  if (file) {
    location = file.location;
  } else if (data?.audio) {
    location = data?.audio;
  }

  const note = new Note({
    content,
    deal,
    user: currentUser.id,
    assigned_contacts: contacts,
    audio: location,
  });

  note.save().catch((err) => {
    console.log('deal note create err', err.message);
  });

  const activityLog =
    mode === 'automation'
      ? ActivityHelper.automationLog('added note')
      : 'added note';
  const activity = new Activity({
    user: currentUser.id,
    content: activityLog,
    notes: note.id,
    type: 'notes',
    deals: deal,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  for (let i = 0; i < contacts.length; i++) {
    const contact_note = new Note({
      contact: contacts[i],
      has_shared: true,
      shared_note: note.id,
      content,
      user: currentUser.id,
      audio: location,
    });

    contact_note.save().catch((err) => {
      console.log('note save err', err.message);
    });

    const note_activity = new Activity({
      content: activityLog,
      contacts: contacts[i],
      type: 'notes',
      notes: contact_note.id,
      user: currentUser.id,
    });

    note_activity
      .save()
      .then((_activity) => {
        Contact.updateOne(
          { _id: contacts[i] },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      })
      .catch((err) => {
        console.log('deal add note error', err.message);
        return res.status(400).send({
          status: false,
          error: err.message,
        });
      });
  }
  if (mode === 'automation') {
    return res.send({
      status: true,
      data: {
        activity,
      },
    });
  } else {
    return res.send({
      status: true,
    });
  }
};

const editNote = async (req, res) => {
  const { currentUser } = req;

  let editData = {};
  if (req.body.data) {
    editData = JSON.parse(req.body.data);
  } else {
    editData = { ...req.body };
  }
  if (req.file) {
    editData['audio'] = req.file.location;
  }
  delete editData.contact;

  const dealNoteId = editData.note;

  const note = await Note.findOne({ _id: dealNoteId }).catch((err) => {
    console.log('not_found_note', err);
  });

  await Note.updateOne(
    {
      _id: dealNoteId,
    },
    {
      $set: { ...editData },
    }
  ).catch((err) => {
    console.log('deal note update err', err.message);
  });

  delete editData.deal;

  Note.updateMany(
    {
      shared_note: dealNoteId,
      user: currentUser.id,
    },
    {
      $set: { ...editData },
    }
  )
    .then(() => {
      if (note.audio) {
        removeAudioFromS3(note.audio);
      }
    })
    .catch((err) => {
      console.log('deal note update err', err.message);
    });

  return res.send({
    status: true,
  });
};

const removeNote = async (req, res) => {
  const { currentUser } = req;

  const note = await Note.findOne({ _id: req.body.note }).catch((err) => {
    console.log('not_found_note', err);
  });

  await Note.deleteOne({
    _id: req.body.note,
  }).catch((err) => {
    console.log('deal note delete err', err.message);
  });

  const contact_notes = await Note.find({
    shared_note: req.body.note,
    user: currentUser.id,
  }).catch((err) => {
    console.log('deal related note find err', err.message);
  });

  const contact_note_ids = [];
  contact_notes.forEach((contact_note) => {
    contact_note_ids.push(mongoose.Types.ObjectId(contact_note.id));
  });

  if (contact_note_ids) {
    Activity.deleteMany({
      notes: { $in: contact_note_ids },
      user: currentUser.id,
      type: 'notes',
    }).catch((err) => {
      console.log('activity deal note delete err', err.message);
    });

    Note.deleteMany({
      _id: { $in: contact_note_ids },
      user: currentUser.id,
    })
      .then(() => {
        if (note.audio) {
          removeAudioFromS3(note.audio);
        }
      })
      .catch((err) => {
        console.log('deal note delete err', err.message);
      });
  }

  Activity.deleteOne({
    user: currentUser.id,
    notes: req.body.note,
    type: 'notes',
  }).catch((err) => {
    console.log('deal not activity remove err', err.message);
  });

  return res.send({
    status: true,
  });
};

/**
 * Remove the audio file from s3
 * @param {*} file: audio file path to remove
 */
const removeAudioFromS3 = async (file) => {
  const count = await Note.countDocuments({ audio: file });
  if (!count) {
    // Remove audio file
    const key = file.replace(
      'https://teamgrow.s3.us-east-2.amazonaws.com/',
      ''
    );
    removeFile(key, function (err, data) {
      console.log('transcoded video removing error', err);
    });
  }
};

const createFollowUp = async (req, res) => {
  const { currentUser, mode } = req;
  // const {
  //   deal,
  //   type,
  //   content,
  //   due_date,
  //   contacts,
  //   set_recurrence,
  //   recurrence_mode,
  // } = req.body;

  // const created = await createDealFollowUp({
  //   ...req.body,
  //   user: currentUser.id,
  // });
  // if (created && created.status) {
  //   return res.send(created);
  // } else {
  //   return res.status(500).send(created);
  // }

  const promise_array = [];
  const activity_content =
    mode === 'automation'
      ? ActivityHelper.automationLog('added task')
      : 'added task';
  promise_array.push(
    createDealFollowUp(
      {
        ...req.body,
        user: currentUser._id,
      },
      activity_content
    )
  );

  Promise.all(promise_array)
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
      });
    });
};

const updateFollowUp = async (req, res) => {
  const { currentUser, mode } = req;
  const {
    edit_mode,
    schedule_mode,
    set_recurrence,
    due_date,
    assigned_contacts,
    recurrence_mode,
    is_full,
  } = req.body;

  const garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('err', err);
    }
  );
  let reminder_before = 30;
  if (garbage) {
    reminder_before = garbage.reminder_before;
  }
  let query = { ...req.body, user: currentUser._id };
  if (assigned_contacts?.length) {
    query = {
      ...query,
      assigned_contacts,
    };
  }
  if (due_date) {
    const startdate = moment(due_date);
    const remind_at = is_full
      ? undefined
      : startdate.subtract(reminder_before, 'minutes');
    query = { ...query, remind_at, status: 0 };
  }

  const follow_up = await FollowUp.findOne({
    _id: query.followup,
  });

  let same_recurring_mode = false;
  if (
    set_recurrence &&
    due_date &&
    moment(due_date).isSame(follow_up.due_date) &&
    recurrence_mode === follow_up.recurrence_mode
  ) {
    same_recurring_mode = true;
  }
  delete query.updated_at;

  let updated;

  if (edit_mode === 'all') {
    if (set_recurrence) {
      query.due_date = await getInitialDate(query);
    }
    await deleteFollowUps(follow_up, true);
    updated = await createDealFollowUp(query, 'updated task');
  } else if (edit_mode === 'following') {
    if (same_recurring_mode) {
      await FollowUp.updateMany(
        {
          user: currentUser._id,
          parent_follow_up: { $exists: true, $eq: follow_up.parent_follow_up },
          status: follow_up.status,
          due_date: { $gte: follow_up.due_date },
        },
        {
          $set: {
            type: query.type,
            content: query.content,
            is_full: query.is_full,
            timezone: query.timezone,
          },
        }
      );
      updated = await updateFollowUpActivity(query);
    } else {
      const recurring_follow_up = await FollowUp.findOne({
        user: currentUser._id,
        _id: follow_up.parent_follow_up,
      });
      if (recurring_follow_up.recurrence_date) {
        query.recurrence_date = recurring_follow_up.recurrence_date;
      }
      if (same_recurring_mode && recurring_follow_up.deleted_due_dates) {
        query.deleted_due_dates = recurring_follow_up.deleted_due_dates;
      }

      await FollowUp.updateMany(
        {
          user: currentUser.id,
          $or: [
            { _id: follow_up.parent_follow_up },
            {
              shared_follow_up: {
                $exists: true,
                $eq: follow_up.parent_follow_up,
              },
            },
          ],
        },
        {
          $set: {
            recurrence_date: follow_up.due_date,
          },
        }
      );

      const follow_ups = await FollowUp.find({
        user: currentUser.id,
        parent_follow_up: { $exists: true, $eq: follow_up.parent_follow_up },
        status: follow_up.status,
        due_date: { $gte: follow_up.due_date },
      });

      for (const _follow_up of follow_ups) {
        deleteFollowUps(_follow_up, false);
      }

      updated = await createDealFollowUp(query, 'updated task');
    }
  } else {
    if (set_recurrence && !follow_up.set_recurrence) {
      await deleteFollowUps(follow_up, false);
      updated = await createDealFollowUp(query, 'updated task');
    } else {
      await FollowUp.updateOne(
        { user: query.user, _id: query.followup },
        {
          $set: {
            ...query,
            parent_follow_up: query.set_recurrence
              ? query.parent_follow_up
              : undefined,
          },
        }
      ).catch((err) => {
        console.log('deal followup update err', err.message);
      });
      updated = await updateFollowUpActivity(query, mode);
    }
  }

  if (updated && updated.status) {
    if (follow_up?.task) {
      const task = await Task.findOne({
        _id: follow_up.task,
        user: currentUser._id,
      })
        .populate({ path: 'contacts' })
        .catch((err) => {
          console.log('find schedule item error', err);
        });
      updated = { ...updated, task };
    }
    return res.send(updated);
  } else {
    return res.status(500).send(updated);
  }
};

const getInitialDate = async (editData) => {
  const first_recurring = await FollowUp.findOne({
    user: editData.user,
    deal: editData.deal,
    parent_follow_up: editData.parent_follow_up,
    status: editData.status,
  })
    .sort({ due_date: 1 })
    .lean();

  const first_date = {
    year: moment(first_recurring.due_date).year(),
    month: moment(first_recurring.due_date).month() + 1,
    day: moment(first_recurring.due_date).date(),
    weekday: moment(first_recurring.due_date).weekday(),
  };
  const edit_date = {
    year: moment(editData.due_date).year(),
    month: moment(editData.due_date).month() + 1,
    day: moment(editData.due_date).date(),
    weekday: moment(editData.due_date).weekday(),
  };

  const time = moment(editData.due_date).format('hh:mm');

  let result;
  if (moment(editData.due_date).isBefore(moment(first_recurring.due_date))) {
    result = editData.due_date;
  } else {
    switch (editData.recurrence_mode) {
      case 'DAILY': {
        result = moment(first_recurring.due_date).format('YYYY-MM-DD ') + time;
        break;
      }
      case 'WEEKLY': {
        if (first_date.weekday <= edit_date.weekday) {
          result =
            moment(first_recurring.due_date)
              .startOf('week')
              .add(edit_date.weekday, 'days')
              .format('YYYY-MM-DD ') + time;
        } else {
          result =
            moment(first_recurring.due_date)
              .startOf('week')
              .add(7, 'days')
              .add(edit_date.weekday, 'days')
              .format('YYYY-MM-DD ') + time;
        }
        break;
      }
      case 'MONTHLY': {
        if (first_date.day <= edit_date.day) {
          result = `${first_date.year}-${first_date.month}-${edit_date.day} ${time}`;
        } else {
          result = `${first_date.year}-${first_date.month + 1}-${
            edit_date.day
          } ${time}`;
        }
        break;
      }
      case 'YEARLY': {
        if (first_date.month <= edit_date.month) {
          result = `${first_date.year}-${edit_date.month}-${edit_date.day} ${time}`;
        } else {
          result = `${first_date.year + 1}-${edit_date.month}-${
            edit_date.day
          } ${time}`;
        }
        break;
      }
    }
  }

  return moment(result, 'YYYY-MM-DD hh:mm').format();
};

const updateFollowUpActivity = async (editData, mode) => {
  return new Promise(async (resolve) => {
    let activity_content = 'updated task';
    if (mode === 'automation') {
      activity_content = ActivityHelper.automationLog(activity_content);
    }
    const activity = new Activity({
      content: activity_content,
      type: 'follow_ups',
      deals: editData.deal,
      user: editData.user,
      follow_ups: editData.set_recurrence
        ? editData.parent_follow_up
        : editData.followup,
    });
    activity.save().catch((err) => {
      console.log('activity save err', err.message);
      resolve({ status: false, error: err.message });
    });

    const followups = await FollowUp.find({
      shared_follow_up: editData.followup,
    });

    const contacts = [];
    const followUpIds = [];
    const contactFollowMatch = {};
    followups.forEach((e) => {
      if (e && e['contact']) {
        contacts.push(e['contact']);
        contactFollowMatch[e['contact']] = e.parent_follow_up
          ? e.parent_follow_up
          : e._id;
      }
      followUpIds.push(e._id);
    });

    const query = { ...editData, assigned_contacts: [] };
    delete query.deal;
    if (query.set_recurrence) {
      delete query.parent_follow_up;
    } else {
      query.parent_follow_up = undefined;
    }

    FollowUp.updateMany(
      { user: editData.user, _id: { $in: followUpIds } },
      { $set: { ...query } }
    ).catch((err) => {
      console.log('followup update err', err.message);
      resolve({ status: false, error: err.message });
    });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      const new_activity = new Activity({
        content: activity_content,
        contacts: contact,
        user: editData.user,
        type: 'follow_ups',
        follow_ups: contactFollowMatch[contact],
      });

      new_activity
        .save()
        .then((_activity) => {
          Contact.updateOne(
            { _id: contact },
            {
              $set: { last_activity: _activity.id },
            }
          ).catch((err) => {
            console.log('err', err);
            resolve({ status: false, error: err.message });
          });
          if (mode !== 'automation') resolve({ status: true });
        })
        .catch((e) => {
          console.log('follow error', e);
          resolve({ status: false, error: e.message });
        });
    }
    if (activity) {
      resolve({
        status: true,
        data: mode === 'automation' ? { _id: activity._id } : {},
      });
    }
  });
};

const completeFollowUp = async (req, res) => {
  const { currentUser, mode } = req;
  // const { deal, type, content, due_date } = req.body;

  FollowUp.updateOne(
    {
      user: currentUser.id,
      _id: req.body.followup,
    },
    {
      $set: { status: 1 },
    }
  ).catch((err) => {
    console.log('deal followup update err', err.message);
  });

  const followup = await FollowUp.findOne({ _id: req.body.followup });
  triggerTimeline({
    userId: currentUser.id,
    type: 'task',
    created_followup: followup._id,
  });

  let activity_content = 'completed task';
  if (mode === 'automation') {
    activity_content = ActivityHelper.automationLog(activity_content);
  }
  const activity = new Activity({
    content: activity_content,
    type: 'follow_ups',
    follow_ups: req.body.followup,
    deals: req.body.deal,
    user: currentUser.id,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  const followups = await FollowUp.find({
    user: currentUser.id,
    shared_follow_up: req.body.followup,
  }).catch((err) => {
    console.log('followups find err', err.message);
  });

  const contacts = [];
  const followUpIds = [];
  const contactFollowMatch = {};
  followups.forEach((e) => {
    if (e && e['contact']) {
      contacts.push(e['contact']);
      contactFollowMatch[e['contact']] = e._id;
    }
    followUpIds.push(e._id);
  });

  FollowUp.updateMany(
    { _id: { $in: followUpIds }, user: currentUser._id },
    {
      $set: { status: 1 },
    }
  ).catch((err) => {
    console.log('contact deal update task', err.message);
  });

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    const activity = new Activity({
      content: activity_content,
      contacts: contact,
      user: currentUser.id,
      type: 'follow_ups',
      follow_ups: contactFollowMatch[contact],
    });

    activity
      .save()
      .then((_activity) => {
        Contact.updateOne(
          { _id: contact },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      })
      .catch((e) => {
        console.log('follow error', e);
        return res.status(400).send({
          status: false,
          error: e,
        });
      });
  }

  return res.send({
    status: true,
    data: mode === 'automation' ? { _id: activity._id } : {},
  });
};

const removeFollowUp = async (req, res) => {
  const { include_recurrence, followup } = req.body;

  const follow_up = await FollowUp.findOne({ _id: followup });
  if (follow_up) {
    await deleteFollowUps(follow_up, include_recurrence);
  }

  if (follow_up.assigned_contacts && follow_up.assigned_contacts.length) {
    const contacts = follow_up.assigned_contacts;
    await ActivityHelper.updateLastActivity(contacts);
  }

  return res.send({
    status: true,
  });
};

const deleteFollowUps = async (follow_up, include_recurrence) => {
  if (follow_up.set_recurrence) {
    const shared_follow_ups = await FollowUp.find({
      user: follow_up.user,
      shared_follow_up: follow_up._id,
    })
      .distinct('_id')
      .lean();
    if (include_recurrence) {
      if (follow_up.parent_follow_up) {
        const parent_follow_ups = await FollowUp.find({
          user: follow_up.user,
          parent_follow_up: { $exists: true, $eq: follow_up.parent_follow_up },
        })
          .distinct('_id')
          .lean();

        const shared_parent_follow_ups = await FollowUp.find({
          user: follow_up.user,
          shared_follow_up: {
            $exists: true,
            $in: [...parent_follow_ups, follow_up.parent_follow_up],
          },
        })
          .distinct('_id')
          .lean();

        // contact task
        if (shared_parent_follow_ups) {
          FollowUp.deleteMany({
            user: follow_up.user,
            _id: { $in: shared_parent_follow_ups },
            status: follow_up.status,
          }).catch((err) => {
            console.log('remove followup err', err.message);
          });
          Activity.deleteMany({
            user: follow_up.user,
            follow_ups: { $in: shared_parent_follow_ups },
            type: 'follow_ups',
          }).catch((err) => {
            console.log('followup find err', err.message);
          });
        }
        // deal task
        if (follow_up.parent_follow_up) {
          FollowUp.deleteMany({
            user: follow_up.user,
            _id: follow_up.parent_follow_up,
          }).catch((err) => {
            console.log('remove followup err', err.message);
          });
          FollowUp.deleteMany({
            user: follow_up.user,
            parent_follow_up: follow_up.parent_follow_up,
            status: follow_up.status,
          }).catch((err) => {
            console.log('remove followup err', err.message);
          });
          Activity.deleteMany({
            user: follow_up.user,
            follow_ups: follow_up.parent_follow_up,
            type: 'follow_ups',
          }).catch((err) => {
            console.log('followup find err', err.message);
          });
        }
      } else {
        const child_follow_ups = await FollowUp.find({
          user: follow_up.user,
          parent_follow_up: { $exists: true, $eq: follow_up._id },
        })
          .distinct('_id')
          .lean();

        const shared_child_follow_ups = await FollowUp.find({
          user: follow_up.user,
          shared_follow_up: {
            $exists: true,
            $in: [...child_follow_ups, follow_up._id],
          },
        })
          .distinct('_id')
          .lean();

        // contact task
        if (shared_child_follow_ups) {
          FollowUp.deleteMany({
            user: follow_up.user,
            _id: { $in: shared_child_follow_ups },
            status: follow_up.status,
          }).catch((err) => {
            console.log('remove followup err', err.message);
          });
          Activity.deleteMany({
            user: follow_up.user,
            follow_ups: { $in: shared_child_follow_ups },
            type: 'follow_ups',
          }).catch((err) => {
            console.log('followup find err', err.message);
          });
        }
      }
    } else {
      FollowUp.deleteMany({
        _id: follow_up._id,
      }).catch((err) => {
        console.log('remove followup err', err.message);
      });

      FollowUp.deleteMany({
        shared_follow_up: follow_up._id,
      }).catch((err) => {
        console.log('remove followup err', err.message);
      });
    }

    Activity.deleteMany({
      user: follow_up.user,
      follow_ups: { $in: [...shared_follow_ups, follow_up._id] },
      type: 'follow_ups',
    }).catch((err) => {
      console.log('followup find err', err.message);
    });
  } else {
    FollowUp.deleteOne({
      user: follow_up.user,
      _id: follow_up._id,
    }).catch((err) => {
      console.log('remove followup err', err.message);
    });

    Activity.deleteMany({
      user: follow_up.user,
      follow_ups: follow_up._id,
      type: 'follow_ups',
    }).catch((err) => {
      console.log('followup find err', err.message);
    });

    const shared_follow_up = await FollowUp.find({
      user: follow_up.user,
      shared_follow_up: follow_up._id,
    })
      .distinct('_id')
      .lean();

    FollowUp.deleteMany({
      user: follow_up.user,
      _id: { $in: shared_follow_up },
    }).catch((err) => {
      console.log('remove followup err', err.message);
    });

    Activity.deleteMany({
      user: follow_up.user,
      follow_ups: { $in: shared_follow_up },
      type: 'follow_ups',
    }).catch((err) => {
      console.log('followup find err', err.message);
    });
  }
};

const sendEmails = async (req, res) => {
  const { currentUser, guest_loggin, guest, mode } = req;
  const {
    subject,
    content,
    cc,
    bcc,
    deal,
    contacts: inputContacts,
    video_ids,
    pdf_ids,
    image_ids,
    timeline_id,
    source,
  } = req.body;

  const CHUNK_COUNT = 20;
  const MIN_CHUNK = 15;
  const errors = [];
  await checkIdentityTokens(currentUser);
  if (!currentUser.primary_connected) {
    return res.status(406).json({
      status: false,
      error: 'no connected',
    });
  }

  const _deal = await Deal.findOne({ _id: deal }).catch((error) => {
    console.log('there is no deal: ', error.message);
  });
  if (!_deal) {
    return res.status(400).json({
      status: false,
      error: 'there is no deal',
    });
  }
  let due_date;
  let contacts = [...inputContacts];
  const taskProcessId =
    mode === 'automation' ? timeline_id : new Date().getTime() + uuidv1();

  // we do not the chunk operation if user connected stmp for a primary sender or send email to a single contacts from app page
  // for manual send from app ( bulk select contacts and send email, send email on a single contact dtail page), source field will be undefined.
  if (
    !(
      currentUser.connected_email_type === 'smtp' &&
      currentUser.primary_connected
    ) &&
    inputContacts.length > 1
  ) {
    const action_content = {
      video_ids,
      pdf_ids,
      image_ids,
      content,
      subject,
      cc,
      bcc,
    };
    const payload = {
      currentUser,
      inputContacts,
      taskProcessId,
      CHUNK_COUNT,
      MIN_CHUNK,
      action_content,
      deal,
      source,
    };

    const { contacts: _contacts, due_date: _due_date } = await bulkAssign(
      payload
    ).catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
    contacts = _contacts;
    due_date = _due_date;
  }

  if (contacts.length) {
    const data = {
      user: currentUser.id,
      ...req.body,
      is_guest: guest_loggin,
      has_shared: true,
      guest,
      mode,
    };

    sendEmail(data)
      .then(async (_res) => {
        giveRateContacts({ user: [currentUser._id] }, contacts);
        let emailId;
        let sentCount = 0;
        let primaryStatus;
        let error_message;
        let error_type;
        const succeedContacts = [];
        const runnedContactIds = [];
        let material_activities;
        let email_opened_activity;
        for (let i = 0; i < _res.length; i++) {
          const res = _res[i];
          if (res.contact._id + '' === deal.primary_contact + '') {
            material_activities = res.material_activities;
            email_opened_activity = res.data;
            if (res.status) {
              primaryStatus = 'completed';
            } else {
              primaryStatus = 'error';
              error_message = res.error;
              error_type = res?.type || '';
            }
          }
          if (!res.status) {
            errors.push({
              contact: res.contact,
              error: res.error,
              type: res.type,
            });
          } else {
            sentCount++;
            succeedContacts.push(res.contact._id);
            if (res.email) emailId = res.email;
          }
          runnedContactIds.push(res.contact._id);
        }

        const activity_content = 'sent email';
        const activity = new Activity({
          user: currentUser.id,
          content: activity_content,
          subject,
          deals: deal,
          type: 'emails',
          emails: emailId,
          videos: video_ids,
          pdfs: pdf_ids,
          images: image_ids,
        });

        if (sentCount) {
          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          Email.updateOne(
            {
              _id: emailId,
            },
            {
              $set: {
                contacts: succeedContacts,
              },
            }
          ).catch((err) => {
            console.log('deal email assigned contact', err.message);
          });
        } else {
          error_message = 'Failed to send any of the contacts in the deal.';
          Email.deleteOne({
            _id: emailId,
          }).catch((err) => {
            console.log('deal email assigned contact', err.message);
          });
        }

        updateUserCount(currentUser._id, _res.length - errors.length).catch(
          (err) => {
            console.log('Update user email count failed.', err);
          }
        );

        if (errors.length > 0 && mode !== 'automation') {
          const notRunnedContactIds = _.differenceBy(
            contacts,
            runnedContactIds,
            (e) => e + ''
          );
          const connect_errors = errors.filter((e) => {
            if (
              e.type === 'connection_failed' ||
              e.type === 'google_token_invalid' ||
              e.type === 'outlook_token_invalid'
            ) {
              return true;
            }
          });
          if (connect_errors.length) {
            return res.status(406).json({
              status: false,
              errors,
              notExecuted: notRunnedContactIds,
              sent: sentCount,
            });
          } else {
            return res.status(405).json({
              status: false,
              errors,
              notExecuted: notRunnedContactIds,
              sent: sentCount,
            });
          }
        }
        if (mode === 'automation') {
          if (primaryStatus !== 'error') {
            return res.send({
              status: true,
              data: {
                activity: activity._id,
                material_activities,
                email_opened_activity,
                primaryStatus,
              },
            });
          } else {
            if (
              error_type === 'connection_failed' ||
              error_type === 'google_token_invalid' ||
              error_type === 'outlook_token_invalid'
            ) {
              let tokenErrorStr;
              switch (error_type) {
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
              const time_zone = currentUser.time_zone_info;
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
              const notification = new Notification({
                type: 'personal',
                criteria: tokenErrorStr,
                content: `You have got above error on sending CRMGROW Automation Email. Please check and connect your email again.`,
                user: currentUser.id,
              });
              notification.save().catch((err) => {
                console.log('err', err.message);
              });
            }
            return res.status(400).json({
              status: false,
              error: error_message,
            });
          }
        } else {
          return res.send({
            status: true,
            sentCount,
          });
        }
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err || 'email send error',
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

const getEmails = async (req, res) => {
  const { currentUser } = req;
  const emails = await Email.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: emails,
  });
};

const getAppointments = async (req, res) => {
  const { currentUser } = req;
  const appointments = await Appointment.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: appointments,
  });
};

const getTeamCalls = async (req, res) => {
  const { currentUser } = req;
  const team_calls = await TeamCall.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: team_calls,
  });
};

const removeTeamCall = async (req, res) => {
  const { currentUser } = req;

  TeamCall.deleteOne({
    _id: req.body.team_call,
    user: currentUser.id,
  })
    .then(() => {
      // shared team call delete
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('team call delete err', err.message);
      return res.send(500).json({
        status: false,
        error: err,
      });
    });
};

const createAppointment = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  await checkIdentityTokens(currentUser);
  let event_id;
  let recurrence_id;

  if (currentUser.calendar_connected) {
    const _appointment = req.body;
    const { connected_email, calendar_id } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    if (calendar.connected_calendar_type === 'outlook') {
      const data = {
        source: currentUser.source,
        appointment: _appointment,
        calendar,
        calendar_id,
      };
      const { new_event_id, new_recurrence_id } = await addOutlookCalendarById(
        data
      );
      event_id = new_event_id;
      recurrence_id = new_recurrence_id;
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      const notification = true;
      const data = {
        source: currentUser.source,
        refresh_token: token.refresh_token,
        appointment: _appointment,
        calendar_id,
        notification,
      };
      const { new_event_id, new_recurrence_id } = await addGoogleCalendarById(
        data
      );
      event_id = new_event_id;
      recurrence_id = new_recurrence_id;
    }

    const deal_data = { ...req.body };

    const appointment = new Appointment({
      ...deal_data,
      event_id,
      recurrence_id,
      user: currentUser.id,
    });

    appointment.save().catch((err) => {
      console.log('deal appointment create err', err.message);
    });

    const content = 'added meeting';
    const activity = new Activity({
      user: currentUser.id,
      content,
      type: 'appointments',
      appointments: appointment.id,
      deals: req.body.deal,
    });

    activity.save().catch((err) => {
      console.log('activity save err', err.message);
    });

    for (let i = 0; i < contacts.length; i++) {
      // const contact_appointment = new Appointment({
      //   ...req.body,
      //   event_id,
      //   contact: contacts[i],
      //   has_shared: true,
      //   shared_appointment: appointment.id,
      //   user: currentUser.id,
      // });

      // contact_appointment.save().catch((err) => {
      //   console.log('note save err', err.message);
      // });

      const appointment_activity = new Activity({
        content,
        contacts: contacts[i],
        type: 'appointments',
        appointments: appointment.id,
        user: currentUser.id,
      });

      appointment_activity.save().catch((err) => {
        console.log('note activity err', err.message);
      });
    }
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'You must connect gmail/outlook',
    });
  }
};

const updateAppointment = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  await checkIdentityTokens(currentUser);
  if (currentUser.calendar_connected) {
    const _appointment = req.body;
    const { connected_email, calendar_id } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const event_id = req.body.recurrence_id || req.body.event_id;
    if (calendar.connected_calendar_type === 'outlook') {
      const data = {
        appointment: _appointment,
        calendar,
        event_id,
        source: currentUser.source,
      };
      updateOutlookCalendarById(data);
    } else {
      const token = JSON.parse(calendar.google_refresh_token);

      const data = {
        source: currentUser.source,
        refresh_token: token.refresh_token,
        appointment: _appointment,
        event_id,
        calendar_id,
      };
      await updateGoogleCalendarById(data);
    }

    const deal_data = { ...req.body };

    Appointment.updateOne(
      {
        _id: req.body.appointment,
      },
      { $set: deal_data }
    ).catch((err) => {
      console.log('appointment update err', err.message);
    });

    const activity_content = 'updated meeting';
    const activity = new Activity({
      user: currentUser.id,
      content: activity_content,
      type: 'appointments',
      appointments: req.body.appointment,
      deals: req.body.deal,
    });

    activity.save().catch((err) => {
      console.log('activity save err', err.message);
    });

    for (let i = 0; i < contacts.length; i++) {
      const appointment_activity = new Activity({
        content: activity_content,
        contacts: contacts[i],
        type: 'appointments',
        appointments: req.body.appointment,
        user: currentUser.id,
      });

      appointment_activity.save().catch((err) => {
        console.log('note activity err', err.message);
      });
    }
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'You must connect gmail/outlook',
    });
  }
};

const removeAppointment = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  if (currentUser.calendar_connected) {
    const { connected_email } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const remove_id = req.body.recurrence_id || req.body.event_id;

    if (calendar.connected_calendar_type === 'outlook') {
      const data = {
        calendar_id: req.body.calendar_id,
        calendar,
        remove_id,
        source: currentUser.source,
      };
      removeOutlookCalendarById(data);
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      const data = {
        source: currentUser.source,
        refresh_token: token.refresh_token,
        calendar_id: req.body.calendar_id,
        remove_id,
      };
      removeGoogleCalendarById(data);
    }

    const appointment = await Appointment.findOne({
      user: currentUser.id,
      event_id: remove_id,
    }).catch((err) => {
      console.log('appointment find err', err.message);
    });

    Activity.deleteMany({
      appointments: appointment.id,
      user: currentUser.id,
    }).catch((err) => {
      console.log('appointment activity err', err.message);
    });

    Appointment.deleteOne({
      user: currentUser.id,
      event_id: remove_id,
    }).catch((err) => {
      console.log('appointment update err', err.message);
    });

    return res.send({
      status: true,
    });
  }
};

const createTeamCall = async (req, res) => {
  const { currentUser } = req;
  let leader;
  let contacts;

  if (req.body.contacts && req.body.contacts.length > 0) {
    contacts = await Contact.find({ _id: { $in: req.body.contacts } }).catch(
      (err) => {
        console.log('contact find err', err.message);
      }
    );
  }

  if (req.body.leader) {
    leader = await User.findOne({ _id: req.body.leader }).catch((err) => {
      console.log('leader find err', err.message);
    });
  }

  const deal_data = { ...req.body };

  const team_call = new TeamCall({
    ...deal_data,
    user: currentUser.id,
  });

  console.log('deal_data', deal_data, team_call);

  team_call
    .save()
    .then(async () => {
      const activity = new Activity({
        team_calls: team_call.id,
        user: currentUser.id,
        content: 'inquired group call',
        type: 'team_calls',
        deals: req.body.deal,
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      if (leader) {
        let guests = '';
        if (contacts) {
          for (let i = 0; i < contacts.length; i++) {
            const first_name = contacts[i].first_name || '';
            const last_name = contacts[i].last_name || '';
            const data = {
              first_name,
              last_name,
            };

            const new_activity = new Activity({
              team_calls: team_call.id,
              user: currentUser.id,
              contacts: contacts[i].id,
              content: 'inquired group call',
              type: 'team_calls',
            });

            new_activity.save().catch((err) => {
              console.log('activity save err', err.message);
            });

            Contact.updateOne(
              {
                _id: contacts[i].id,
              },
              {
                $set: { last_activity: new_activity.id },
              }
            ).catch((err) => {
              console.log('contact update err', err.message);
            });

            const guest = `<tr style="margin-bottom:10px;"><td><span class="icon-user">${getAvatarName(
              data
            )}</label></td><td style="padding-left:5px;">${first_name} ${last_name}</td></tr>`;
            guests += guest;
          }
        }

        const organizer = `<tr><td><span class="icon-user">${getAvatarName({
          full_name: currentUser.user_name,
        })}</label></td><td style="padding-left: 5px;">${
          currentUser.user_name
        }</td></tr>`;

        const templatedData = {
          user_name: currentUser.user_name,
          leader_name: leader.user_name,
          created_at: moment().format('h:mm MMMM Do, YYYY'),
          subject: team_call.subject,
          description: team_call.description || '',
          organizer,
          call_url: urls.TEAM_CALLS + team_call.id,
          guests,
        };

        const params = {
          Destination: {
            ToAddresses: [leader.email],
          },
          Source: mail_contents.NO_REPLAY,
          Template: 'TeamCallRequest',
          TemplateData: JSON.stringify(templatedData),
          ReplyToAddresses: [currentUser.email],
        };
        const command = new SendTemplatedEmailCommand(params);
        // Create the promise and SES service object
        await ses.send(command).catch((err) => {
          console.log('ses command err', err.message);
        });
      }

      /** **********
       *  Creat dashboard notification to the inviated users
       *  */
      if (leader) {
        const notification = new Notification({
          user: leader.id,
          team_call: team_call.id,
          criteria: 'team_call_invited',
          content: `You've been invited to join a call by ${currentUser.user_name}.`,
        });

        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('team save err', err.message);
      return res.status(400).json({
        status: false,
        error: err.message,
      });
    });
};

const sendTexts = async (req, res) => {
  const { currentUser, guest_loggin, guest, mode } = req;
  const {
    content,
    deal,
    video_ids,
    pdf_ids,
    image_ids,
    contacts,
    primary_contact,
  } = req.body;
  if (contacts?.length > 25) {
    return res.status(400).json({
      status: false,
      error:
        'This deal contains a lot of contacts. We could not do your request.',
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
  const text_info = primaryUser.text_info;

  if (!primaryUser['twilio_number'] && !primaryUser['wavv_number']) {
    return res.status(408).json({
      status: false,
      error: 'No phone',
    });
  }

  if (!text_info['is_enabled']) {
    return res.status(412).json({
      status: false,
      error: 'Disable send sms',
    });
  }

  if (!checkTextCount(text_info, content, contacts?.length || 0)) {
    return res.status(409).json({
      status: false,
      error: 'Exceed max sms credit',
    });
  }

  const data = {
    user: currentUser.id,
    ...req.body,
    type: 0,
    // max_text_count,
    is_guest: guest_loggin,
    has_shared: true,
    guest,
  };

  sendText(data)
    .then((_res) => {
      let sentCount = 0;
      const errors = [];
      const failed = [];
      const succeed = [];
      const sendStatus = {};
      const invalidContacts = [];
      let activityId;
      const textResult = _res.splice(-1);
      let material_activities;
      let pending = 0;
      let primaryStatus = '';
      let textId;
      _res.forEach((e) => {
        if (!e.status) {
          errors.push(e);
          if (e.contact && e.contact._id) {
            failed.push(e.contact._id);
          }
        }
        if (e.status) {
          sentCount++;
          if (e.contact && e.contact._id) {
            succeed.push(e.contact._id);
          }
        }
        if (e.sendStatus) {
          if (e.contact && e.contact._id) {
            sendStatus[e.contact._id] = e.sendStatus;
          }
          if (e.sendStatus.status === 3) {
            pending++;
          }
        } else if (!e.status) {
          if (e.contact && e.contact._id) {
            invalidContacts.push(e.contact._id);
          }
        }
        if (e.text) {
          textId = e.text;
        }
        if (e.contact._id?.toString() === primary_contact?.toString()) {
          material_activities = e.material_activities;
          if (e.status) {
            primaryStatus =
              e.sendStatus.status === 3 ? 'executed' : 'completed';
          } else {
            primaryStatus = 'error';
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

      if (sentCount) {
        const activity_content = 'sent text';

        const activity = new Activity({
          user: currentUser.id,
          content: activity_content,
          deals: deal,
          type: 'texts',
          texts: textId,
          videos: video_ids,
          pdfs: pdf_ids,
          images: image_ids,
        });

        activity.save().catch((err) => {
          console.log('deal text activity save err', err.message);
        });
        activityId = activity._id;
      } else {
        Text.deleteOne({
          _id: textId,
        }).catch((err) => {
          console.log('deal email assigned contact', err.message);
        });
      }

      if (errors.length > 0 && mode !== 'automation') {
        return res.status(405).json({
          status: false,
          error: errors,
          sentCount,
          invalidContacts,
          primaryStatus,
          activityId,
        });
      }

      if (mode === 'automation') {
        if (primaryStatus !== 'error') {
          return res.send({
            status: true,
            activityId,
            material_activities,
            primaryStatus,
          });
        } else {
          return res.send({
            status: false,
            errors,
          });
        }
      } else {
        return res.send({
          status: true,
          sentCount,
        });
      }
    })
    .catch((err) => {
      console.log('text send error', err);
      return res.status(500).json({
        status: false,
        error: err || 'text send error',
      });
    });
};

const bulkCreate = async (req, res) => {
  const { currentUser } = req;
  const { deals } = req.body;
  const promise_array = [];
  const deal_ids = [];

  for (let i = 0; i < deals.length; i++) {
    const deal = new Deal({
      title: deals[i].deal,
      deal_stage: deals[i].deal_stage,
      user: currentUser.id,
      put_at: new Date(),
    });

    const promise = new Promise(async (resolve) => {
      const _deal = await deal.save().catch((err) => {
        console.log('deal save err', err.message);
      });

      const deal_stage = await DealStage.findOne({
        _id: deals[i].deal_stage,
      }).catch((err) => {
        console.log('deal stage found error', err.message);
        return res.status(500).send(err.message || 'Deal found error');
      });

      if (deal_stage.automation) {
        const data = {
          automation_id: deal_stage.automation,
          assign_array: [deal.id],
          user_id: currentUser.id,
          required_unique: true,
          type: 'deal',
        };

        assignTimeline(data)
          .then(({ due_date, result: _res }) => {
            if (!_res[0].status) {
              console.log('automation assign err', _res[0].error);
            }
          })
          .catch((err) => {
            console.log('assign automation err', err.message);
          });
      }

      DealStage.updateOne(
        { _id: deals[i].deal_stage },
        { $push: { deals: _deal._id } }
      ).catch((err) => {
        console.log('error', err.message);
      });

      deal_ids.push({
        deal_id: _deal._id,
        deal_name: deals[i].deal,
      });

      resolve(_deal);
    });

    promise_array.push(promise);
  }

  Promise.all(promise_array)
    .then(() => {
      return res.send({
        status: true,
        data: deal_ids,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
      });
    });
};

const bulkCreateCSV = async (req, res) => {
  const { currentUser } = req;
  const { deals, stages, force } = req.body;
  const promise_array = [];
  const failed_data = [];

  for (let i = 0; i < deals.length; i++) {
    const contacts = deals[i].contacts.map((e) =>
      mongoose.Types.ObjectId(e._id + '')
    );
    const deal_stages = stages.map((e) => mongoose.Types.ObjectId(e + ''));
    // if force passed as true, will be ignored the conflicts.
    // Otherwise the conflicts will be checked
    let conflict_deals;
    if (!force) {
      const pipeline = [
        {
          $match: {
            user: mongoose.Types.ObjectId(currentUser.id),
            contacts: { $in: contacts },
            deal_stage: { $in: deal_stages },
          },
        },
        {
          $lookup: {
            from: 'contacts',
            localField: 'contacts',
            foreignField: '_id',
            as: 'contact_details',
          },
        },
        {
          $lookup: {
            from: 'contacts',
            localField: 'primary_contact',
            foreignField: '_id',
            as: 'primary_contact_detail',
          },
        },
        {
          $lookup: {
            from: 'time_lines',
            localField: '_id',
            foreignField: 'deal',
            as: 'timelines',
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            deal_stage: 1,
            contacts: '$contact_details',
            'primary_contact._id': {
              $arrayElemAt: ['$primary_contact_detail._id', 0],
            },
            'primary_contact.first_name': {
              $arrayElemAt: ['$primary_contact_detail.first_name', 0],
            },
            'primary_contact.last_name': {
              $arrayElemAt: ['$primary_contact_detail.last_name', 0],
            },
            'primary_contact.email': {
              $arrayElemAt: ['$primary_contact_detail.email', 0],
            },
            timeline: {
              $arrayElemAt: ['$timelines', 0],
            },
          },
        },
        {
          $lookup: {
            from: 'automations',
            localField: 'timeline.automation',
            foreignField: '_id',
            as: 'automation',
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            deal_stage: 1,
            contacts: 1,
            primary_contact: 1,
            automation_id: {
              $arrayElemAt: ['$automation._id', 0],
            },
          },
        },
      ];
      conflict_deals = await Deal.aggregate(pipeline).catch((err) => {
        console.log('get conflict deals error', err);
      });
    }
    if (conflict_deals && conflict_deals.length) {
      failed_data.push([deals[i], ...conflict_deals]);
    } else {
      const deal = new Deal({
        title: deals[i].title,
        deal_stage: deals[i].deal_stage,
        contacts,
        primary_contact: deals[i].primary_contact._id,
        user: currentUser.id,
        put_at: new Date(),
      });

      const promise = new Promise(async (resolve) => {
        const _deal = await deal.save().catch((err) => {
          console.log('deal save err', err.message);
        });

        const deal_stage = await DealStage.findOne({
          _id: deals[i].deal_stage,
        }).catch((err) => {
          console.log('deal stage found error', err.message);
          return res.status(500).send(err.message || 'Deal found error');
        });

        if (deal_stage.automation) {
          const data = {
            automation_id: deal_stage.automation,
            assign_array: [deal.id],
            user_id: currentUser.id,
            required_unique: true,
            type: 'deal',
          };

          assignTimeline(data)
            .then(({ due_date, result: _res }) => {
              if (!_res[0].status) {
                console.log('automation assign err', _res[0].error);
              }
            })
            .catch((err) => {
              console.log('assign automation err', err.message);
            });
        }

        DealStage.updateOne(
          { _id: deals[i].deal_stage },
          { $push: { deals: _deal._id } }
        ).catch((err) => {
          console.log('error', err.message);
        });

        resolve(_deal);
      });

      promise_array.push(promise);
    }
  }

  Promise.all(promise_array)
    .then(() => {
      return res.send({
        status: true,
        failed: failed_data,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
      });
    });
};

const setPrimaryContact = async (req, res) => {
  const { currentUser } = req;
  const { deal_id, contact_id } = req.body;

  const _deal = await Deal.findOne({
    _id: deal_id,
    user: currentUser.id,
  });

  if (_deal) {
    Deal.updateOne(
      {
        _id: deal_id,
        user: currentUser.id,
      },
      { primary_contact: contact_id }
    )
      .then((result) => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        res.status(500).send({
          status: false,
          error: err.message || JSON.stringify(err),
        });
      });
  } else {
    return res.status(400).send({
      status: false,
      error: 'Not found current deal.',
    });
  }
};

const getTasks = (req, res) => {
  const { currentUser } = req;
  const dealId = req.params.id;

  // const campaign_promise = new Promise((resolve, reject) => {
  //   CampaignJob.find({
  //     user: currentUser._id,
  //     status: 'active',
  //     contacts: contactId,
  //   })
  //     .populate({
  //       path: 'campaign',
  //       select: {
  //         _id: true,
  //         title: true,
  //         subject: true,
  //         content: true,
  //         newsletter: true,
  //       },
  //     })
  //     .then((data) => {
  //       resolve({ campaigns: data });
  //     })
  //     .catch((err) => {
  //       reject(err);
  //     });
  // });
  const task_promise = new Promise((resolve, reject) => {
    Task.find({
      user: currentUser._id,
      status: { $in: ['active', 'draft'] },
      deals: dealId,
    })
      .select({
        action: true,
        due_date: true,
        recurrence_mode: true,
        set_recurrence: true,
        type: true,
        process: true,
      })
      .then(async (data) => {
        // TO REMOVE: please remove this block code in next stage
        const automationIds = [];
        let automations = [];
        data.forEach((e) => {
          if (
            e.type === 'assign_automation' &&
            e.action &&
            (e.action.automation_id || e.action.automation)
          ) {
            automationIds.push(e.action.automation_id || e.action.automation);
          }
        });
        if (automationIds.length) {
          automations = await Automation.find({
            _id: { $in: automationIds },
          })
            .select({ _id: true, title: true })
            .catch((err) => {
              console.log('err', err);
            });
        }
        // --- End Remove ---
        resolve({ tasks: data, automations });
      })
      .catch((err) => {
        reject(err);
      });
  });

  Promise.all([task_promise])
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        err,
      });
    });
};

const getCount = async (req, res) => {
  const { currentUser } = req;
  const total = await Deal.countDocuments({
    user: currentUser.id,
  });
  const compareDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const recent = await Deal.countDocuments({
    user: currentUser.id,
    created_at: { $gte: compareDate },
  });
  return res.send({
    status: true,
    data: { total, recent },
  });
};

const getContactsByStage = async (req, res) => {
  const { dealStageId } = req.body;
  const deals = await Deal.find({
    deal_stage: mongoose.Types.ObjectId(dealStageId),
  });
  const dealStages = {};
  let contactIds = [];
  deals.forEach((deal) => {
    dealStages[deal._id] = deal.contacts;
    contactIds = [...contactIds, ...deal.contacts];
  });
  contactIds = [...new Set(contactIds)];
  const contacts = await Contact.find(
    {
      _id: { $in: contactIds },
    },
    { _id: 1, first_name: 1, last_name: 1, cell_phone: 1 }
  );

  res.send({
    status: true,
    data: { dealStages, contacts },
  });
};

module.exports = {
  getAll,
  getActivity,
  getNotes,
  getAppointments,
  getTeamCalls,
  removeTeamCall,
  create,
  moveDeal,
  edit,
  remove,
  bulkRemove,
  getDetail,
  getSiblings,
  getMaterialActivity,
  createNote,
  editNote,
  removeNote,
  createFollowUp,
  completeFollowUp,
  createAppointment,
  updateAppointment,
  removeAppointment,
  updateFollowUp,
  removeFollowUp,
  createTeamCall,
  sendEmails,
  getEmails,
  sendTexts,
  updateContact,
  getTimeLines,
  bulkCreate,
  bulkCreateCSV,
  setPrimaryContact,
  getAllTimeLines,
  removeOnlyDeal,
  getTasks,
  getCount,
  getDeals,
  getContactsByStage,
};
