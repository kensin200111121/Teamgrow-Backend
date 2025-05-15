/* eslint-disable eqeqeq */
const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const { phone } = require('phone');
const Verifier = require('email-verifier');
const _ = require('lodash');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const FollowUp = require('../models/follow_up');
const Appointment = require('../models/appointment');
const Email = require('../models/email');
const Note = require('../models/note');
const User = require('../models/user');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const TimeLine = require('../models/time_line');
const Automation = require('../models/automation');
const EmailTracker = require('../models/email_tracker');
const Garbage = require('../models/garbage');
const Image = require('../models/image');
const Text = require('../models/text');
const ImageTracker = require('../models/image_tracker');
const PDFTracker = require('../models/pdf_tracker');
const VideoTracker = require('../models/video_tracker');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const Team = require('../models/team');
const Notification = require('../models/notification');
const Task = require('../models/task');
const PhoneLog = require('../models/phone_log');
const CampaignJob = require('../models/campaign_job');
const Campaign = require('../models/campaign');
const Event = require('../models/event');
const LeadForm = require('../models/lead_form');
const LabelHelper = require('../helpers/label');
const ActivityHelper = require('../helpers/activity');
const GarbageHelper = require('../helpers/garbage');
const ContactHelper = require('../helpers/contact');
const api = require('../configs/api');
const system_settings = require('../configs/system_settings');
const Labels = require('../constants/label');
const { outbound_constants } = require('../constants/variable');
const {
  getAvatarName,
  validateEmail,
  trackApiRequest,
} = require('../helpers/utility');
const { sendNotificationEmail } = require('../helpers/notification');
const { assignTimeline } = require('../helpers/automation');
const { createNotification } = require('../helpers/notification');
const {
  shareContactsToOrganization,
  generateSharePromise,
  generateCloneAndTransferContactPromise,
  acceptCloneRequest,
  declineCloneRequest,
  acceptTransferRequest,
  declineTransferRequest,
  acceptAvmRequest,
  declineAvmRequest,
  pushAddtionalFields,
  checkDuplicateContact,
  acceptDuplicateContacts,
  getLoadGroupActivity,
  removeContacts,
  removeSharedContacts,
} = require('../helpers/contact');
const {
  getContactOutboundData,
  getRemoveContactOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');
const { create: createTimelines } = require('./time_line');
const { sendErrorToSentry } = require('../helpers/utility');
const SphereRelationship = require('../models/sphere_relationship');
const AutomationLine = require('../models/automation_line');
const { onAutomationInfo } = require('../helpers/automation');
const urls = require('../constants/urls');
const { LEAD_SOURCE_TYPE } = require('../constants/outbound');
const FormTracker = require('../models/form_tracker');
const CustomField = require('../models/custom_field');
const Organization = require('../models/organization');
const { triggerAutomation } = require('../helpers/automation');

const getAll = async (req, res) => {
  const { currentUser } = req;
  const data = await Contact.find({ user: currentUser.id });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const getAllByLastActivity = async (req, res) => {
  const { currentUser } = req;
  const data = await Contact.find({ user: currentUser.id })
    .populate('last_activity')
    .sort({ first_name: 1 })
    .catch((err) => {
      console.log('err', err);
    });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const getContactList = async (req, res) => {
  const { currentUser } = req;
  let { field, dir } = req.body;
  const { searchType } = req.body;
  const skip = parseInt(req.params.skip || '0');
  const userId = mongoose.Types.ObjectId(currentUser.id);
  dir = dir ? 1 : -1;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }
  let findQuery;
  if (searchType === 'own') {
    const teamList = await Team.find({ members: userId }).select({ _id: 1 });
    const teamListIds = teamList.map((e) => e._id);
    findQuery = {
      $or: [
        { user: userId },
        { shared_members: userId },
        { 'shared_team.0': { $in: teamListIds }, shared_all_member: true },
      ],
    };
  } else if (searchType === 'team') {
    const teamList = await Team.find({ members: userId }).select({ _id: 1 });
    const teamListIds = teamList.map((e) => e._id);
    findQuery = {
      $or: [
        { shared_members: userId },
        { 'shared_team.0': { $in: teamListIds }, shared_all_member: true },
        { 'shared_team.0': { $exists: true }, user: userId },
      ],
    };
  } else if (searchType === 'private') {
    findQuery = {
      user: userId,
      'shared_team.0': { $exists: false },
    };
  } else if (searchType === 'prospect') {
    findQuery = {
      user: userId,
      prospect_id: { $exists: true, $ne: '' },
    };
  } else if (searchType === 'assigned') {
    findQuery = { owner: userId };
  } else if (searchType === 'pending') {
    findQuery = {
      $or: [
        {
          pending_users: currentUser._id,
          type: { $in: ['transfer', 'clone', 'avm', 'share'] },
        },
      ],
    };
  } else {
    findQuery = { user: userId };
  }

  const userProject = {
    user_name: 1,
    nick_name: 1,
    email: 1,
    cell_phone: 1,
    phone: 1,
    picture_profile: 1,
  };

  const total = await Contact.countDocuments(findQuery);
  let contacts;
  const pipeline = [
    {
      $match: findQuery,
    },
    {
      $sort: { [field]: dir },
    },
    {
      $skip: skip,
    },
  ];

  if (count > 0) {
    pipeline.push(
      {
        $limit: count,
      },
      {
        $lookup: {
          from: 'activities',
          localField: 'last_activity',
          foreignField: '_id',
          as: 'last_activity',
        },
      },
      {
        $lookup: {
          from: 'users',
          let: { userId: '$user' },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$userId'] } } },
            {
              $project: userProject,
            },
          ],
          as: 'user',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'shared_members',
          foreignField: '_id',
          as: 'shared_members',
        },
      },
      {
        $lookup: {
          from: 'users',
          let: { ownerId: '$owner' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$ownerId'] } } },
            {
              $project: userProject,
            },
          ],
          as: 'owner',
        },
      }
    );
  }

  if (count < 0) {
    pipeline.push({
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
      },
    });
  }

  await Contact.aggregate(pipeline)
    .collation({ locale: 'en' })
    .allowDiskUse(true)
    .exec((err, data) => {
      contacts = data;
      if (!contacts) {
        return res.status(400).json({
          status: false,
          error: 'Contacts doesn’t exist',
        });
      }
      return res.send({
        status: true,
        data: {
          contacts,
          count: total,
        },
      });
    });
};

const getContactsTotalCount = async (req, res) => {
  const { currentUser } = req;
  const { searchType } = req.body;
  const userId = mongoose.Types.ObjectId(currentUser.id);
  let findQuery;
  if (searchType === 'own') {
    const teamList = await Team.find({ members: userId }).select({ _id: 1 });
    const teamListIds = teamList.map((e) => e._id);
    findQuery = {
      $or: [
        { user: userId },
        { shared_members: userId },
        { shared_team: { $in: teamListIds }, shared_all_member: true },
      ],
    };
  } else if (searchType === 'team') {
    const teamList = await Team.find({ members: userId }).select({ _id: 1 });
    const teamListIds = teamList.map((e) => e._id);
    findQuery = {
      $or: [
        { shared_members: userId },
        { shared_team: { $in: teamListIds }, shared_all_member: true },
        { 'shared_team.0': { $exists: true }, user: userId },
      ],
    };
  } else if (searchType === 'private') {
    findQuery = {
      user: userId,
      'shared_members.0': { $exists: false },
      'shared_team.0': { $exists: false },
    };
  } else if (searchType === 'prospect') {
    findQuery = {
      user: userId,
      prospect_id: { $exists: true, $ne: '' },
    };
  } else if (searchType === 'assigned') {
    findQuery = { owner: userId };
  } else if (searchType === 'pending') {
    findQuery = {
      $or: [
        { pending_users: userId, type: 'share' },
        {
          pending_users: currentUser._id,
          type: { $in: ['transfer', 'clone', 'avm'] },
        },
      ],
    };
  }

  const total = await Contact.countDocuments(findQuery);
  return res.send({
    status: true,
    data: {
      count: total,
    },
  });
};

const getByLastActivity = async (req, res) => {
  const { currentUser } = req;
  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  const userProject = {
    user_name: 1,
    nick_name: 1,
    email: 1,
    cell_phone: 1,
    phone: 1,
    picture_profile: 1,
  };

  const total = await Contact.countDocuments({
    user: currentUser.id,
  });

  const id = parseInt(req.params.id || '0');
  const userId = mongoose.Types.ObjectId(currentUser.id);
  let contacts;
  await Contact.aggregate([
    {
      $match: {
        user: userId,
      },
    },
    {
      $sort: { [field]: dir },
    },
    {
      $skip: id,
    },
    {
      $limit: count,
    },
    {
      $lookup: {
        from: 'activities',
        localField: 'last_activity',
        foreignField: '_id',
        as: 'last_activity',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userId: '$user' },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$userId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'user',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'shared_members',
        foreignField: '_id',
        as: 'shared_members',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { owerId: '$owner' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$owerId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'owner',
      },
    },
  ])
    .collation({ locale: 'en' })
    .allowDiskUse(true)
    .exec((err, data) => {
      contacts = data;
      if (!contacts) {
        return res.status(400).json({
          status: false,
          error: 'Contacts doesn`t exist',
        });
      }
      return res.send({
        status: true,
        data: {
          contacts,
          count: total,
        },
      });
    });
};

const getDetail = async (req, res) => {
  const { currentUser } = req;
  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  }
  const contactId = req.params.id;

  const _contact = await Contact.findOne({ _id: contactId })
    .populate([
      {
        path: 'shared_members',
        select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
      },
    ])
    .catch((err) => {
      console.log('contact found err', err.message);
    });

  let userExists = false;

  if (!_contact) {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }

  userExists =
    _contact.user.includes(currentUser._id) ||
    _contact.shared_members.some((member) =>
      member._id.equals(currentUser._id)
    ) ||
    _contact.pending_users.includes(currentUser._id) ||
    (_contact.owner && _contact.owner.equals(currentUser._id));

  if (!userExists) {
    const _team = await Team.findOne({ _id: _contact.shared_team });
    if (_team) {
      userExists = _team.members.some((member) =>
        member.equals(currentUser._id)
      );
    }
  }

  if (!userExists) {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }

  const myJSON = JSON.stringify(_contact);
  const contact = JSON.parse(myJSON);

  if (_contact.user?.length && !_contact.user.includes(currentUser._id)) {
    const customFields = await CustomField.find({
      kind: 'contact',
      user: _contact.user[0],
    }).catch(() => {});

    contact.customFields = customFields || [];
  }

  return res.send({
    status: true,
    data: contact,
  });
};

const removeEmptyKey = (obj) => {
  for (var key in obj) {
    if (typeof obj[key] === 'object') {
      removeEmptyKey(obj[key]);
      if (!Object.keys(obj[key]).length) delete obj[key];
    } else if (Array.isArray(obj[key])) {
      if (!obj[key].length) delete obj[key];
    } else {
      if (obj[key] === undefined || !obj[key].toString().trim().length)
        delete obj[key];
    }
  }
  return obj;
};

const create = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;

  trackApiRequest('contact_create_micro', req.body);

  let deal_stage;
  let newDeal;
  let newContact;

  if (req.body.tags && typeof req.body.tags === 'string')
    req.body.tags = req.body.tags.split(',');

  if (
    req.body.source &&
    typeof req.body.source === 'string' &&
    req.body.source.toLowerCase() === 'redx' &&
    Array.isArray(req.body.tags)
  ) {
    req.body.tags = req.body.tags.map((tag) =>
      typeof tag === 'string' && tag.toLowerCase() === 'third-party'
        ? 'manual import'
        : tag
    );
  }

  if (req.body.label && !mongoose.Types.ObjectId.isValid(req.body.label)) {
    req.body.label = await LabelHelper.convertLabel(
      currentUser.id,
      req.body.label,
      currentUser.source
    );
  }

  if (req.body.cell_phone) {
    const formattedNumber = phone(req.body.cell_phone);
    req.body.cell_phone = formattedNumber?.phoneNumber || req.body.cell_phone;
  } else {
    delete req.body.cell_phone;
  }

  req.body = ContactHelper.mergePrimaryEmailAndEmails(req.body);

  req.body = ContactHelper.mergePrimaryPhoneAndPhones(req.body);

  req.body = ContactHelper.mergePrimaryAddressAndAddresses(req.body);

  /**
   *  Email / Phone unique validation
   */

  let contact_old;
  if (req.body.email && req.body.email != '') {
    contact_old = await Contact.findOne({
      user: currentUser.id,
      email: req.body['email'],
    });
    if (contact_old !== null) {
      if (!req.body.override) {
        return res.status(400).send({
          status: false,
          error: 'Email must be unique!',
        });
      } else {
        req.body = removeEmptyKey(req.body);
        delete req.body.override;
        req.body.id = contact_old.id;
        return updateContact(req, res);
      }
    }
  }

  if (req.body.cell_phone) {
    contact_old = await Contact.findOne({
      user: currentUser.id,
      cell_phone: req.body['cell_phone'],
    });
    if (contact_old !== null) {
      return res.status(400).send({
        status: false,
        error: 'Phone number must be unique!',
      });
    }
  }

  if (req.body.deal_stage) {
    deal_stage = await DealStage.findOne({
      _id: req.body.deal_stage,
    }).catch((err) => {
      console.log('error', err.message);
    });
  }

  if (!req.body.owner || !mongoose.Types.ObjectId.isValid(req.body.owner)) {
    delete req.body['owner'];
  }

  const contact = new Contact({
    ...req.body,
    user: currentUser.id,
    prospect_id: req.body.vortex_id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await contact
    .save()
    .then((_contact) => {
      newContact = _contact;
    })
    .catch((err) => {
      console.log('contact save error', err.message);
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: 'Internal server error',
      });
    });

  let data;
  if (newContact) {
    /* req.body includes  "shareWith" optional param. 
      this is used for share team action when create contact. 
      shareWith: boolean | {target:Array<string>} 
      this field can be boolean or targetUser Id Array. 
      const { shareWith } = req.body 
    */

    let detail_content = 'added';
    if (guest_loggin) {
      detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
    }

    if (newContact.prospect_id) {
      detail_content = `${detail_content} (Prospect)`;
    }

    const activity = new Activity({
      content: detail_content,
      contacts: newContact.id,
      user: currentUser.id,
      type: 'contacts',
    });
    activity.single_id = activity._id;
    await activity.save().then((_activity) => {
      const myJSON = JSON.stringify(newContact);
      data = JSON.parse(myJSON);
      data.activity = _activity;
      newContact['last_activity'] = _activity.id;
      newContact.save().catch((err) => {
        console.log('err', err);
      });
    });

    await shareContactsToOrganization(currentUser, newContact._id).catch(
      (err) => console.log('share contacts to organization err', err.message)
    );

    if (req.body.note) {
      const note = new Note({
        contact: newContact.id,
        user: currentUser.id,
        content: req.body.note,
      });

      await note.save().catch((err) => {
        console.log('add note save err', err.message);
      });
    }

    if (req.body.deal_stage) {
      const deal = new Deal({
        contacts: newContact.id,
        user: currentUser.id,
        deal_stage: req.body.deal_stage,
        primary_contact: newContact.id,
        title: `${newContact.first_name} ${newContact.last_name || ''} Deal`,
        put_at: new Date(),
      });

      await deal.save().then((_deal) => {
        newDeal = _deal;
        let detail_content = 'added deal';
        if (guest_loggin) {
          detail_content = ActivityHelper.assistantLog(
            detail_content,
            guest.name
          );
        }

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

        const activity = new Activity({
          content: detail_content,
          contacts: newContact.id,
          user: currentUser.id,
          type: 'deals',
          deals: _deal.id,
          deal_stages: req.body.deal_stage,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        Contact.updateOne(
          { _id: newContact.id },
          { $set: { last_activity: activity.id } }
        ).catch((err) => {
          console.log('contact update err', err.message);
        });
      });

      if (newDeal) {
        if (deal_stage.automation) {
          const data = {
            automation_id: deal_stage.automation,
            assign_array: [newDeal._id],
            type: 'deal',
            user_id: currentUser.id,
            required_unique: true,
          };

          assignTimeline(data)
            .then(({ due_date, result: _res }) => {
              if (_res[0] && !_res[0].status) {
                console.log('automation assign err', _res[0].error);
              }
              // Rating
              ContactHelper.calculateContactRate(
                newContact._id,
                currentUser._id
              );
            })
            .catch((err) => {
              console.log('assign automation err', err.message);
            });
        }
      }
    } else {
      // Rating
      ContactHelper.calculateContactRate(newContact._id, currentUser._id);
    }

    const params = { _id: newContact._id };

    await outboundCallhookApi(
      currentUser.id,
      outbound_constants.ADD_CONTACT,
      getContactOutboundData,
      params
    );

    res.send({
      status: true,
      data,
    });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const data = await Contact.findOne({
    user: currentUser.id,
    _id: req.params.id,
  });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }

  const id = req.params.id;

  if (!id) {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }

  await outboundCallhookApi(
    currentUser.id,
    outbound_constants.DELETE_CONTACT,
    getContactOutboundData,
    { _id: id }
  );
  removeContacts(currentUser.id, [id]);
};

const bulkRemove = async (req, res) => {
  const { currentUser } = req;
  const ids = req.body.ids;

  // 1. find the id list of contacts which are included to current user
  // 2. exclude the user contacts & find the shared contacts
  // 3. remove the shared contacts
  // 4. remove the user contacts
  const contacts = await Contact.find({
    user: currentUser._id,
    _id: { $in: ids },
  });

  await outboundCallhookApi(
    currentUser.id,
    outbound_constants.DELETE_CONTACT,
    getRemoveContactOutboundData,
    { contacts }
  );
  const contactIds = contacts.map((e) => e._id + '');
  const sharedContactIds = _.difference(ids, contactIds);
  removeSharedContacts(currentUser._id, sharedContactIds);
  await removeContacts(currentUser._id, contactIds, sharedContactIds);

  return res.send({
    status: true,
  });
};

const update = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;

  if (req.body.tags && typeof req.body.tags === 'string')
    req.body.tags = req.body.tags.split(',');

  const query = { ...req.body };
  const unsetQuery = {};
  
  if (!query.owner || !mongoose.Types.ObjectId.isValid(query.owner)) {
    delete query.owner;
    unsetQuery.owner = "";
  }

  if (!query.label || !mongoose.Types.ObjectId.isValid(query.label)) {
    delete query.label;
    unsetQuery.label = "";
  }

  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  } else {
    const contact = await Contact.findOne({
      _id: req.params.id,
    }).catch((err) => {
      console.log('err', err);
    });

    let contact_old;
    if (req.body.email && req.body.email != '') {
      contact_old = await Contact.findOne({
        _id: { $ne: req.params.id },
        user: currentUser.id,
        email: req.body['email'],
      });
      if (contact_old !== null) {
        return res.status(400).send({
          status: false,
          error: 'Email must be unique!',
        });
      }
    }

    if (req.body.cell_phone) {
      contact_old = await Contact.findOne({
        _id: { $ne: req.params.id },
        user: currentUser.id,
        cell_phone: req.body['cell_phone'],
      });
      if (contact_old !== null) {
        return res.status(400).send({
          status: false,
          error: 'Phone number must be unique!',
        });
      }
    }

    if (req.body.deal_stage) {
      const deal = new Deal({
        contacts: contact.id,
        user: currentUser.id,
        deal_stage: req.body.deal_stage,
        title: `${contact.first_name} ${contact.last_name || ''} Deal`,
        primary_contact: contact.id,
        put_at: new Date(),
      });

      deal
        .save()
        .then((_deal) => {
          let detail_content = 'added deal';
          if (guest_loggin) {
            detail_content = ActivityHelper.assistantLog(
              detail_content,
              guest.name
            );
          }

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

          const activity = new Activity({
            user: currentUser.id,
            content: detail_content,
            type: 'deals',
            deals: deal.id,
            deal_stages: req.body.deal_stage,
          });

          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          const contact_activity = new Activity({
            content: detail_content,
            contacts: contact.id,
            user: currentUser.id,
            type: 'deals',
            deals: _deal.id,
            deal_stages: req.body.deal_stage,
          });

          contact_activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: contact_activity.id } }
          ).catch((err) => {
            console.log('contact update err', err.message);
          });
        })
        .catch((err) => {
          console.log('deal create err', err.message);
        });
    }

    const updateQuery = { $set: query };
    if(Object.keys(unsetQuery)?.length){
      updateQuery['$unset'] = unsetQuery;
    }

    Contact.updateOne({ _id: contact.id }, updateQuery)
      .then(async () => {
        const params = { _id: contact._id };
        await outboundCallhookApi(
          currentUser.id,
          outbound_constants.UPDATE_CONTACT,
          getContactOutboundData,
          params
        );
        // post-process of the contact update for trigger automation
        if (contact.label && contact.label.toString() !== query.label) {
          try {
            triggerAutomation({
              user: currentUser,
              contacts: [contact._id],
              trigger: {
                type: 'contact_status_updated',
                detail: {
                  status: query.label,
                },
              },
            });
          } catch (err) {
            console.log('trigger automation is failed', err);
          }
        }
        // post-process of the contact update for trigger automation
        const changedTags = (query.tags || []).filter(
          (e) => !(contact.tags || []).includes(e)
        );
        if (changedTags?.length) {
          triggerAutomation({
            user: currentUser,
            contacts: [contact._id],
            trigger: {
              type: 'contact_tags_added',
              detail: {
                tags: changedTags,
              },
            },
          });
        }
        const updatedContact = await Contact.findOne({
          _id: req.params.id,
          user: currentUser.id,
        });
        if (
          !query['rate_lock'] ||
          (query['rate_lock'] && query['rate_lock'] !== true)
        ) {
          const rate = await ContactHelper.calculateContactRate(
            contact.id,
            currentUser._id
          );
          return res.send({
            status: true,
            data: { rate, ...updatedContact?._doc },
          });
        } else {
          return res.send({
            status: true,
            data: { ...query, ...updatedContact?._doc },
          });
        }
      })
      .catch((err) => {
        console.log('contact update err', err.message);
        sendErrorToSentry(currentUser, err);
        return res.status(500).json({
          status: false,
          error: err.message,
        });
      });
  }
};

const bulkEditLabel = async (req, res) => {
  const { currentUser, contacts } = req.body;
  let { label } = req.body;
  if (label === '') {
    label = undefined;
  }
  Contact.find({ _id: { $in: contacts } })
    .updateMany({ $set: { label } })
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      sendErrorToSentry(currentUser, err);
      res.status(500).send({
        status: false,
        error: err.message || 'Label Update Error',
      });
    });
};

const bulkUpdate = async (req, res) => {
  const { currentUser, mode } = req;
  const { contacts, data, tags } = req.body;

  const additionalFields = await CustomField.find({
    user: currentUser.id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed, ', ex.message);
  });
  const additionalData = data?.additional_field;
  delete data.additional_field;

  let tagUpdateQuery = {};
  if (tags?.tags && tags?.tags.length) {
    switch (tags.option) {
      case 2:
        tagUpdateQuery = { $addToSet: { tags: { $each: tags.tags } } };
        break;
      case 3:
        tagUpdateQuery = { $pull: { tags: { $in: tags.tags } } };
        break;
      case 4:
        tagUpdateQuery = { tags: tags.tags };
        break;
    }
  }

  let updateQuery = {};
  const additionalInfoQuery = {};
  const mainInfoQuery = {};
  const unsetQuery = {};
  const activityQuery = {};
  if (Object.keys(data).length > 0) {
    for (const key of Object.keys(data)) {
      if (key === 'label') mainInfoQuery[key] = data[key];
      else if (key === 'owner' && data[key] && data[key] === 'unassign') {
        unsetQuery[key] = true;
      } else if (data[key] && data[key] !== '') {
        mainInfoQuery[key] = data[key];
      }

      // Create activity for assignee
      if (key === 'owner') {
        for (let i = 0; i < contacts.length; i++) {
          if (contacts[i]) {
            const activity = new Activity({
              content: 'updated assignee',
              contacts: contacts[i],
              user: currentUser.id,
              type: 'users',
              assigner: data[key] === 'unassign' ? null : data[key],
            });
            activity.single_id = activity._id;
            activity.save().catch((err) => {
              console.log('activity save err', err.message);
            });
            activityQuery['last_activity'] = activity._id;
          }
        }
      }
    }
  }

  if (additionalData && Object.keys(additionalData).length > 0) {
    for (const key of Object.keys(additionalData)) {
      if (additionalData[key] && additionalData[key] !== '') {
        const field = additionalFields.find((f) => f.name === key);
        if (field.type === 'date') {
          additionalInfoQuery[`additional_field.${key}`] = new Date(
            additionalData[key]
          );
        } else {
          additionalInfoQuery[`additional_field.${key}`] = additionalData[key];
        }
      }
    }
  }
  updateQuery = {
    $set: { ...mainInfoQuery, ...additionalInfoQuery, ...activityQuery },
    $unset: { ...unsetQuery },
  };

  if (Object.keys(tagUpdateQuery).length > 0) {
    updateQuery = { ...updateQuery, ...tagUpdateQuery };
  }
  if (data.label) {
    const _contacts = await Contact.find({
      _id: { $in: contacts },
      label: { $ne: data.label },
    }).catch((err) => console.log(err.message));
    if (_contacts.length) {
      triggerAutomation({
        user: currentUser,
        contacts: _contacts.map((e) => e._id),
        trigger: {
          type: 'contact_status_updated',
          detail: {
            status: data.label,
          },
        },
      });
    }
  }

  if (mode === 'automation') {
    let autoTagQuery = {};
    if (
      data?.pushTags &&
      data?.pushTags.length &&
      data?.pullTags &&
      data?.pullTags.length
    ) {
      autoTagQuery = {
        $addToSet: { tags: { $each: data?.pushTags } },
      };
      await Contact.updateMany(
        { _id: { $in: contacts } },
        { ...updateQuery, ...autoTagQuery }
      ).catch((err) => {
        console.log('error', err);
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message || 'Update Error',
        });
      });
      autoTagQuery = {
        $pull: { tags: { $in: data?.pullTags } },
      };
      await Contact.updateMany(
        { _id: { $in: contacts } },
        { ...updateQuery, ...autoTagQuery }
      ).catch((err) => {
        console.log('error', err);
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message || 'Update Error',
        });
      });
      return res.send({
        status: true,
      });
    } else if (data?.pushTags && data?.pushTags.length) {
      autoTagQuery = {
        $addToSet: { tags: { $each: data?.pushTags } },
      };
      await Contact.updateMany(
        { _id: { $in: contacts } },
        { ...updateQuery, ...autoTagQuery }
      )
        .then(() => {
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.log('error', err);
          sendErrorToSentry(currentUser, err);
          return res.status(500).send({
            status: false,
            error: err.message || 'Update Error',
          });
        });
    } else if (data?.pullTags && data?.pullTags.length) {
      autoTagQuery = {
        $pull: { tags: { $in: data?.pullTags } },
      };
      await Contact.updateMany(
        { _id: { $in: contacts } },
        { ...updateQuery, ...autoTagQuery }
      )
        .then(() => {
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.log('error', err);
          sendErrorToSentry(currentUser, err);
          return res.status(500).send({
            status: false,
            error: err.message || 'Update Error',
          });
        });
    } else {
      await Contact.updateMany({ _id: { $in: contacts } }, updateQuery)
        .then(() => {
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.log('error', err);
          sendErrorToSentry(currentUser, err);
          return res.status(500).send({
            status: false,
            error: err.message || 'Update Error',
          });
        });
    }
  } else {
    Contact.updateMany({ _id: { $in: contacts } }, updateQuery)
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.log('error', err);
        sendErrorToSentry(currentUser, err);
        return res.status(500).send({
          status: false,
          error: err.message || 'Update Error',
        });
      });
  }
};

const importCSV = async (req, res) => {
  const file = req.file;
  const contact_array = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', async (data) => {
      contact_array.push(data);
    })
    .on('end', async () => {
      uploadContacts(req, res, contact_array);
    });
};

const importCSVChunk = async (req, res) => {
  const file = req.file;
  const contact_array = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', async (data) => {
      contact_array.push(data);
    })
    .on('end', async () => {
      console.log('ended');
      uploadContactsChunk(req, res, contact_array);
    });
};

const importContacts = async (req, res) => {
  const contacts = req.body.contacts || [];
  uploadContacts(req, res, contacts);
};

const uploadContacts = async (req, res, contact_array) => {
  const { currentUser, guest_loggin, guest } = req;
  const additional_fields = [];

  const additionalFields = await CustomField.find({
    user: currentUser.id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field error:', ex.message);
  });
  additionalFields.forEach((field) => {
    additional_fields.push(field.name);
  });
  const labels = await LabelHelper.getAll(currentUser.id);
  let duplicate_contacts = [];
  const exceed_contacts = [];
  const promise_array = [];

  let add_content = 'added';
  if (guest_loggin) {
    add_content = ActivityHelper.assistantLog(add_content, guest.name);
  }
  const assignAutomation = [];
  for (let i = 0; i < contact_array.length; i++) {
    const promise = new Promise(async (resolve) => {
      try {
        const data = contact_array[i];

        // additional field working
        if (additional_fields.length > 0) {
          const additionalData = {};
          for (const key in data) {
            if (additional_fields.indexOf(key) > -1) {
              additionalData[key] = data[key];
            }
          }
          data['additional_field'] = additionalData;
        }

        if (data['first_name'] === '') {
          data['first_name'] = null;
        }
        if (data['email'] === '') {
          data['email'] = null;
        }
        if (data['cell_phone'] === '') {
          data['cell_phone'] = null;
        }
        if (data['first_name'] || data['email'] || data['cell_phone']) {
          const query = [];

          /**
          if (data['first_name'] && data['last_name']) {
            query.push({
              user: currentUser.id,
              first_name: data['first_name'],
              last_name: data['last_name'],
            });
          }
          */

          const _duplicate_contacts = await checkDuplicateContact(
            data,
            currentUser
          );
          if (_duplicate_contacts && _duplicate_contacts.length > 0) {
            duplicate_contacts = duplicate_contacts.concat(_duplicate_contacts);
            duplicate_contacts.push(data);
            resolve();
            return;
          }

          let tags = [];
          if (data['tags'] !== '' && typeof data['tags'] !== 'undefined') {
            tags = data['tags'].split(/,\s|\s,|,|\s/);
          }
          let label;

          if (data['label'] !== '' && typeof data['label'] !== 'undefined') {
            for (let i = 0; i < labels.length; i++) {
              if (
                capitalize(labels[i].name) === capitalize(data['label']) ||
                capitalize(labels[i]._id + '') === capitalize(data['label'])
              ) {
                label = labels[i]._id;
                break;
              }
            }

            /**
            if (!label) {
              const new_label = new Label({
                user: currentUser.id,
                name: data['label'],
              });

              new_label.save().catch((err) => {
                console.log('new label save err', err.message);
              });
              label = new_label.id;
              labels.push({
                _id: label,
                name: data['label'],
              });
            }
            */
          }

          delete data.label;
          delete data.tags;

          const contact = new Contact({
            ...data,
            tags,
            label,
            user: currentUser.id,
          });

          contact
            .save()
            .then(async (_contact) => {
              const activity = new Activity({
                content: add_content,
                contacts: _contact.id,
                user: currentUser.id,
                type: 'contacts',
              });
              activity.single_id = activity._id;
              activity
                .save()
                .then((_activity) => {
                  Contact.updateOne(
                    { _id: _contact.id },
                    {
                      $set: { last_activity: _activity.id },
                    }
                  ).catch((err) => {
                    console.log('err', err);
                  });
                })
                .catch((err) => {
                  console.log('err', err);
                });
              await shareContactsToOrganization(
                currentUser,
                _contact._id
              ).catch((err) =>
                console.log('share contacts to organization err', err.message)
              );

              if (data['notes'] && data['notes'].length > 0) {
                let notes = [];
                try {
                  notes = JSON.parse(data['notes']);
                } catch (err) {
                  if (data['notes'] instanceof Array) {
                    notes = data['notes'];
                  } else {
                    notes = [data['notes']];
                  }
                }
                // const notes = data['notes'];
                for (let i = 0; i < notes.length; i++) {
                  // const { content, title } = notes[i];
                  const content = notes[i];
                  const note = new Note({
                    content,
                    contact: _contact.id,
                    user: currentUser.id,
                  });

                  note.save().catch((err) => {
                    console.log('contact import note save err', err.message);
                  });

                  /**
                  note.save().then((_note) => {
                    const _activity = new Activity({
                      content: note_content,
                      contacts: _contact.id,
                      user: currentUser.id,
                      type: 'notes',
                      notes: _note.id,
                    });

                    _activity
                      .save()
                      .then((__activity) => {
                        Contact.updateOne(
                          { _id: _contact.id },
                          { $set: { last_activity: __activity.id } }
                        ).catch((err) => {
                          console.log('err', err);
                        });
                      })
                      .catch((err) => {
                        console.log('error', err);
                      });
                  });
                  */
                }
              }
              if (data['deal_id']) {
                const deal = await Deal.findOne({
                  _id: data['deal_id'],
                });
                if (deal) {
                  const query = { contacts: _contact.id };
                  if (data['primary_contact']) {
                    query['primary_contact'] = _contact.id;
                  }
                  Deal.updateOne(
                    {
                      _id: deal.id,
                      user: currentUser.id,
                    },
                    { $push: query }
                  ).catch((err) => {
                    console.log('deal update err', err.message);
                  });
                  const activity = new Activity({
                    content: 'added deal',
                    contacts: _contact.id,
                    user: currentUser.id,
                    type: 'deals',
                    deals: deal.id,
                    deal_stages: deal.deal_stage,
                  });

                  activity.save().catch((err) => {
                    console.log('activity save err', err.message);
                  });
                }
              }

              // make group for bulk assign automation
              if (data['automation_id']) {
                const automation_id = data['automation_id'];
                const index = assignAutomation.findIndex(
                  (item) => item['automation'] === automation_id
                );
                if (index >= 0) {
                  if (assignAutomation[index]['contacts']) {
                    assignAutomation[index]['contacts'].push(_contact.id);
                  } else {
                    assignAutomation[index]['contacts'] = [_contact.id];
                  }
                } else {
                  assignAutomation.push({
                    automation: automation_id,
                    contacts: [_contact._id],
                  });
                }
              }
              resolve();
            })
            .catch((err) => {
              console.log('contact save err', err);
            });
        } else {
          resolve();
        }
      } catch (err) {
        console.log('contact import csv internal err', err);
      }
    });
    promise_array.push(promise);
  }

  Promise.all(promise_array).then(async () => {
    // bulk assign automation
    if (assignAutomation.length > 0) {
      for (const groupItem of assignAutomation) {
        const automation_id = groupItem.automation;
        const inputContacts = groupItem.contacts;
        const inputDeals = groupItem.deals;
        createTimelines({
          currentUser,
          body: { automation_id, contacts: inputContacts, deals: inputDeals },
        });
      }
    }

    return res.send({
      status: true,
      exceed_contacts,
      duplicate_contacts,
    });
  });
};

const uploadContactsChunk = async (req, res, contact_array) => {
  const { currentUser, guest_loggin, guest } = req;
  const additional_fields = [];
  const additionalFields = await CustomField.find({
    user: currentUser.id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field error:', ex.message);
  });

  additionalFields.forEach((field) => {
    additional_fields.push(field.name);
  });
  const labels = await LabelHelper.getAll(currentUser.id);
  const succeed_contacts = [];
  let duplicate_contacts = [];
  const exceed_contacts = [];
  const promise_array = [];

  let add_content = 'added';
  if (guest_loggin) {
    add_content = ActivityHelper.assistantLog(add_content, guest.name);
  }
  const assignAutomation = [];
  for (let i = 0; i < contact_array.length; i++) {
    const promise = new Promise(async (resolve) => {
      try {
        const data = contact_array[i];
        // additional field working
        if (additional_fields.length > 0) {
          const additionalData = {};
          for (const key in data) {
            const index = additional_fields.indexOf(key);
            if (index > -1) {
              const additionalField = additionalFields.find(
                (field) => field.name === key
              );
              if (additionalField.type === 'date') {
                if (data[key]) {
                  additionalData[key] = new Date(data[key]);
                }
              } else {
                additionalData[key] = data[key];
                // if the value is not in options, add to the field
                if (additionalField.type === 'dropdown') {
                  const vIndex = additionalField.options.findIndex(
                    (v) => v.value === data[key]
                  );
                  if (vIndex === -1) {
                    additionalField.options.push({
                      label: data[key],
                      value: data[key],
                    });
                    await CustomField.updateOne(
                      {
                        _id: additionalField._id,
                      },
                      {
                        $set: { options: additionalField.options },
                      }
                    ).catch((ex) => {
                      console.log('custom field updated failed', ex.message);
                    });
                  }
                }
              }
              delete data[key];
            }
          }
          data['additional_field'] = additionalData;
        }

        if (data['first_name'] === '') {
          data['first_name'] = null;
        }
        if (data['email'] === '') {
          data['email'] = null;
        }
        if (data['cell_phone'] === '') {
          data['cell_phone'] = null;
        }
        if (data['first_name'] || data['email'] || data['cell_phone']) {
          let cell_phone;
          if (data['cell_phone']) {
            cell_phone = phone(data['cell_phone'])?.phoneNumber;
          }

          const _duplicate_contacts = await checkDuplicateContact(
            data,
            currentUser
          );
          if (_duplicate_contacts && _duplicate_contacts.length > 0) {
            duplicate_contacts = duplicate_contacts.concat(_duplicate_contacts);
            duplicate_contacts.push(data);
            resolve();
            return;
          }

          // emails
          const emails = [];
          if (data['emails']) {
            const secondary_emails = data['emails'].split(',');
            if (data['email']) {
              emails.push({
                value: data['email'],
                isPrimary: true,
                type: '',
              });
            }
            secondary_emails.forEach((email) => {
              emails.push({
                value: email,
                isPrimary: false,
                type: '',
              });
            });
            delete data.emails;
          }

          // phones
          const phones = [];
          if (data['phones']) {
            const secondary_phones = data['phones'].split(',');
            if (data['cell_phone']) {
              phones.push({
                value: data['cell_phone'],
                isPrimary: true,
                type: '',
              });
            }
            secondary_phones.forEach((phone) => {
              if (phone.length > 0)
                phones.push({
                  value: phone,
                  isPrimary: false,
                  type: '',
                });
            });
            delete data.phones;
          }

          let tags = [];
          if (data['tags'] !== '' && typeof data['tags'] !== 'undefined') {
            tags = data['tags'].split(/,\s|\s,|,|\s/);
          }
          let label;
          if (data['status'] !== '' && typeof data['status'] !== 'undefined') {
            for (let i = 0; i < labels.length; i++) {
              if (
                capitalize(labels[i].name) === capitalize(data['status']) ||
                capitalize(labels[i]._id + '') === capitalize(data['status'])
              ) {
                label = labels[i]._id;
                break;
              }
            }
          }

          delete data.label;
          delete data.tags;

          if (!label && data['status']) {
            label = await LabelHelper.convertLabel(
              currentUser.id,
              data['status'],
              currentUser.source
            );
          }

          const contact = new Contact({
            ...data,
            emails,
            phones,
            tags,
            label,
            cell_phone,
            user: currentUser.id,
          });

          contact
            .save()
            .then(async (_contact) => {
              succeed_contacts.push({
                ..._contact._doc,
                deal: data.deal || '',
              });
              const activity = new Activity({
                content: add_content,
                contacts: _contact.id,
                user: currentUser.id,
                type: 'contacts',
              });
              activity.single_id = activity._id;
              activity
                .save()
                .then((_activity) => {
                  Contact.updateOne(
                    { _id: _contact.id },
                    {
                      $set: { last_activity: _activity.id },
                    }
                  ).catch((err) => {
                    console.log('err', err);
                  });
                })
                .catch((err) => {
                  console.log('err', err);
                });

              await shareContactsToOrganization(
                currentUser,
                _contact._id
              ).catch((err) =>
                console.log('share contacts to organization err', err.message)
              );

              if (data['notes'] && data['notes'].length > 0) {
                let notes = [];
                try {
                  notes = JSON.parse(data['notes']);
                } catch (err) {
                  if (data['notes'] instanceof Array) {
                    notes = data['notes'];
                  } else {
                    notes = [data['notes']];
                  }
                }
                // const notes = data['notes'];
                for (let i = 0; i < notes.length; i++) {
                  // const { content, title } = notes[i];
                  const content = notes[i];
                  const note = new Note({
                    content,
                    contact: _contact.id,
                    user: currentUser.id,
                  });

                  note.save().catch((err) => {
                    console.log('contact import note save err', err.message);
                  });
                }
              }
              if (data['deal_id']) {
                const deal = await Deal.findOne({
                  _id: data['deal_id'],
                });
                if (deal) {
                  const query = { contacts: _contact.id };
                  if (data['primary_contact']) {
                    query['primary_contact'] = _contact.id;
                  }
                  Deal.updateOne(
                    {
                      _id: deal.id,
                      user: currentUser.id,
                    },
                    { $push: query }
                  ).catch((err) => {
                    console.log('deal update err', err.message);
                  });
                  const activity = new Activity({
                    content: 'added deal',
                    contacts: _contact.id,
                    user: currentUser.id,
                    type: 'deals',
                    deals: deal.id,
                    deal_stages: deal.deal_stage,
                  });

                  activity.save().catch((err) => {
                    console.log('activity save err', err.message);
                  });
                }
              }

              // make group for bulk assign automation
              if (data['automation_id']) {
                const automation_id = data['automation_id'];
                const index = assignAutomation.findIndex(
                  (item) => item['automation'] === automation_id
                );
                if (index >= 0) {
                  if (assignAutomation[index]['contacts']) {
                    assignAutomation[index]['contacts'].push(_contact.id);
                  } else {
                    assignAutomation[index]['contacts'] = [_contact.id];
                  }
                } else {
                  assignAutomation.push({
                    automation: automation_id,
                    contacts: [_contact._id],
                  });
                }
              }
              resolve();
            })
            .catch((err) => {
              console.log('contact save err', err);
              resolve();
            });
        } else {
          resolve();
        }
      } catch (err) {
        console.log('contact import csv internal err', err);
        resolve();
      }
    });
    promise_array.push(promise);
  }

  Promise.all(promise_array)
    .then(async () => {
      // bulk assign automation
      if (assignAutomation.length > 0) {
        for (const groupItem of assignAutomation) {
          const automation_id = groupItem.automation;
          const inputContacts = groupItem.contacts;
          const inputDeals = groupItem.deals;
          createTimelines({
            currentUser,
            body: { automation_id, contacts: inputContacts, deals: inputDeals },
          });
        }
      }

      return res.send({
        status: true,
        succeed_contacts,
        exceed_contacts,
        duplicate_contacts,
      });
    })
    .catch((err) => {
      console.log('upload contacts chunk error', err);
      return res.send({
        status: false,
      });
    });
};

const overwriteCSV = async (req, res) => {
  const file = req.file;
  const { currentUser } = req;
  const failure = [];

  const contact_array = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', async (data) => {
      contact_array.push(data);
    })
    .on('end', async () => {
      const promise_array = [];
      for (let i = 0; i < contact_array.length; i++) {
        const email = contact_array[i]['email'];
        const data = contact_array[i];
        let tags = [];
        if (data['tags'] !== '' && typeof data['tags'] !== 'undefined') {
          tags = data['tags'].split(/,\s|\s,|,|\s/);
        }
        delete data.tags;
        for (const key in data) {
          if (data[key] === '' && typeof data[key] === 'undefined') {
            delete data[key];
          }
        }
        if (email) {
          await Contact.updateOne(
            { email },
            { $set: data, $push: { tags: { $each: tags } } }
          ).catch((err) => {
            console.log('err', err);
          });
        }
      }
      return res.send({
        status: true,
      });
    });
};

const duplicateCSV = async (req, res) => {
  const file = req.file;

  const contact_array = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', async (data) => {
      contact_array.push(data);
    })
    .on('end', async () => {
      bulkUpdateDuplicatedContacts(contact_array, req, res);
    });
};

const exportCSV = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const data = [];

  for (let i = 0; i < contacts.length; i++) {
    const _data = {
      contact_id: contacts[i],
      note: [],
    };
    const _note = await Note.find({
      user: currentUser.id,
      contact: contacts[i],
    });
    const _contact = await Contact.findOne({ _id: contacts[i] }).populate({
      path: 'label',
      select: 'name',
    });

    if (_note.length !== 0) {
      _data['note'] = _note;
    }
    _data['contact'] = _contact;
    data.push(_data);
  }

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Note doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const search = async (req, res) => {
  const { currentUser } = req;
  const searchStr = req.body.search;
  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const phoneSearch = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
  const runStartTime = new Date().getTime();
  let contacts = [];
  if (search.split(' ').length > 1) {
    contacts = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0], $options: 'i' },
          last_name: { $regex: search.split(' ')[1], $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0], $options: 'i' },
          last_name: { $regex: search.split(' ')[1], $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          first_name: { $regex: search, $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search, $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search, $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search, $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          shared_members: currentUser.id,
        },
      ],
    })
      .populate('last_activity')
      .sort({ first_name: 1 });
  } else {
    contacts = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          shared_members: currentUser.id,
        },
      ],
    })
      .populate('last_activity')
      .sort({ first_name: 1 });
  }

  console.log('run time', new Date().getTime() - runStartTime);
  const count = await Contact.countDocuments({ user: currentUser.id });
  return res.send({
    status: true,
    data: {
      contacts,
      search,
      total: count,
    },
  });
};

const searchEasy = async (req, res) => {
  const { currentUser } = req;
  let search = req.body.search;
  let phoneSearchStr;
  if (search) {
    search = search.replace(/[.*+\-?^${}()|[\]\\\s,#]/g, '\\$&');
    phoneSearchStr = search.replace(/[.*+\-?^${}()|[\]\\\s,#]/g, '');
  }
  const skip = req.body.skip || 0;
  const includeSharedContacts = req.body?.includeSharedContacts || false;
  let query = {};
  let shared_query;
  if (
    includeSharedContacts &&
    currentUser.organization_info?.is_enabled &&
    currentUser.organization
  ) {
    const organization = await Organization.findOne({
      _id: currentUser.organization,
    });
    if (organization) {
      const internal_team = await Team.findOne({
        _id: organization?.team,
        is_internal: true,
      });
      if (internal_team) {
        shared_query = {
          shared_team: { $in: [internal_team?._id] },
          shared_all_member: true,
        };
      }
    }
  }
  if (search.split(' ').length == 1) {
    if (includeSharedContacts && shared_query) {
      query = {
        $and: [
          {
            $or: [{ user: currentUser.id }, { ...shared_query }],
          },
          {
            $or: [
              {
                first_name: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
              },
              {
                email: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
              },
              {
                last_name: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
              },
              {
                cell_phone: {
                  $regex: '.*' + phoneSearchStr + '.*',
                  $options: 'i',
                },
              },
            ],
          },
        ],
      };
    } else {
      query = {
        $and: [
          {
            $or: [
              { user: currentUser.id },
              { shared_members: { $in: currentUser.id } },
            ],
          },
          {
            $or: [
              {
                first_name: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
              },
              {
                email: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
              },
              {
                last_name: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
              },
              {
                cell_phone: {
                  $regex: '.*' + phoneSearchStr + '.*',
                  $options: 'i',
                },
              },
            ],
          },
        ],
      };
    }
  } else {
    if (includeSharedContacts && shared_query) {
      query = {
        $and: [
          {
            $or: [{ user: currentUser.id }, { ...shared_query }],
          },
          {
            $or: [
              {
                first_name: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
                last_name: {
                  $regex: '.*' + search.split(' ')[1] + '.*',
                  $options: 'i',
                },
              },
              {
                first_name: { $regex: '.*' + search + '.*', $options: 'i' },
              },
              {
                last_name: { $regex: '.*' + search + '.*', $options: 'i' },
              },
              {
                cell_phone: {
                  $regex: '.*' + phoneSearchStr + '.*',
                  $options: 'i',
                },
              },
            ],
          },
        ],
      };
    } else {
      query = {
        $and: [
          {
            $or: [
              { user: currentUser.id },
              { shared_members: { $in: currentUser.id } },
            ],
          },
          {
            $or: [
              {
                first_name: {
                  $regex: '.*' + search.split(' ')[0] + '.*',
                  $options: 'i',
                },
                last_name: {
                  $regex: '.*' + search.split(' ')[1] + '.*',
                  $options: 'i',
                },
              },
              {
                first_name: { $regex: '.*' + search + '.*', $options: 'i' },
              },
              {
                last_name: { $regex: '.*' + search + '.*', $options: 'i' },
              },
              {
                cell_phone: {
                  $regex: '.*' + phoneSearchStr + '.*',
                  $options: 'i',
                },
              },
            ],
          },
        ],
      };
    }
  }
  const data = await Contact.find(query)
    .sort({ first_name: 1 })
    .skip(skip)
    .limit(8)
    .lean()
    .catch((err) => {
      console.log('err', err);
    });
  return res.send({
    status: true,
    data,
  });
};

const filter = async (req, res) => {
  const { currentUser } = req;
  const query = req.body;
  let data = [];
  data = await Contact.find({ ...query, user: currentUser.id });
  return res.send({
    status: true,
    data,
  });
};

const getById = async (req, res) => {
  const { currentUser } = req;
  const _contact = await Contact.findOne({
    user: currentUser.id,
    _id: req.params.id,
  });

  if (!_contact) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  res.send({
    status: true,
    data: _contact,
  });
};

const getByIds = async (req, res) => {
  const { ids } = req.body;
  const _contacts = await Contact.find({
    _id: { $in: ids },
  });

  res.send({
    status: true,
    data: _contacts,
  });
};

const leadContact = async (req, res) => {
  let { currentUser } = req;
  const {
    first_name,
    last_name,
    email,
    cell_phone,
    video,
    pdf,
    image,
    automation = automation === 'null' ? null : automation,
    form: lead_id,
    landing_page,
  } = req.body;
  let user = req.body.user;
  if (!user && !currentUser) {
    return res.status(400).send({
      status: false,
      error: 'INCORRECT_REQUEST',
    });
  }
  if (!user && currentUser) {
    user = currentUser._id;
  }
  if (user && !currentUser) {
    currentUser = await User.findOne({ _id: user }).catch((err) => {
      console.log('User not found');
    });
  }
  if (!currentUser) {
    return res.status(400).send({
      status: false,
      error: 'NOT_FOUND_USER',
    });
  }

  const tags = req.body.tags || [];
  const fieldData = { ...req.body };

  const tracker = new FormTracker({
    user,
    lead_form: lead_id,
    data: {
      ...fieldData,
      tags: undefined,
      automation: undefined,
      form: undefined,
      user: undefined,
      video: undefined,
      image: undefined,
      pdf: undefined,
    },
    landing_page,
  });

  delete fieldData['user'];
  delete fieldData['first_name'];
  delete fieldData['last_name'];
  delete fieldData['email'];
  delete fieldData['cell_phone'];
  delete fieldData['video'];
  delete fieldData['pdf'];
  delete fieldData['image'];
  delete fieldData['tags'];
  delete fieldData['automation'];
  delete fieldData['form'];

  tracker.tags = tags || [];

  if (automation && mongoose.Types.ObjectId.isValid(automation)) {
    tracker.automation = automation;
  }

  const additional_fields = [];
  const additionalFields = await CustomField.find({
    user: currentUser._id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field error', ex.message);
  });

  if (additionalFields.length) {
    for (let i = 0; i < additionalFields.length; i++) {
      const field = additionalFields[i];
      additional_fields.push(field.name);
    }
  }
  if (additional_fields.length > 0) {
    const additionalData = {};
    for (const key in fieldData) {
      const isAdditionalField = additional_fields.includes(key);
      const isExcludedField = [
        'source',
        'website',
        'brokerage',
        'address',
        'city',
        'country',
        'state',
        'zip',
      ].includes(key);
      if (isAdditionalField || !isExcludedField) {
        additionalData[key] = fieldData[key];
        delete fieldData[key];
      }
    }
    fieldData['additional_field'] = additionalData;
  }

  if (!email && !cell_phone) {
    return res.status(400).send({
      status: false,
      error: 'Please input email address or cell_phone',
    });
  }

  let _sentActivity;
  if (req.body.activity && mongoose.Types.ObjectId.isValid(req.body.activity)) {
    const prevActivity = await Activity.findOne({
      _id: req.body.activity,
    }).catch(() => {});
    if (prevActivity) {
      _sentActivity = prevActivity;
    }
  }

  let _exist;
  if (req.body.contact && mongoose.Types.ObjectId.isValid(req.body.contact)) {
    _exist = await Contact.findOne({
      _id: req.body.contact,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }
  if (!_exist && email) {
    _exist = await Contact.findOne({
      email,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }

  if (!_exist && cell_phone) {
    _exist = await Contact.findOne({
      cell_phone,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }

  if (_exist) {
    let content;
    tracker.contact = _exist.id;

    await tracker
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });

    if (video) {
      content = 'LEAD CAPTURE - watched video';
    } else if (pdf) {
      content = 'LEAD CAPTURE - reviewed pdf';
    } else if (image) {
      content = 'LEAD CAPTURE - reviewed image';
    } else {
      content = 'LEAD CAPTURE - watched landing page';
    }

    // If the prev(sent) activity doesn't have contact field, please update that.
    // This means it is the material anonymous track activity (not sent activity) in real meaning.
    ContactHelper.updateAnonymousActivityWithContact(_sentActivity, _exist.id);

    const _activity = new Activity({
      content,
      contacts: _exist.id,
      user,
      type: 'form_trackers',
      videos: video,
      pdfs: pdf,
      images: image,
      form_trackers: tracker.id,
      landing_pages: landing_page,
    });
    if (_sentActivity) {
      if (_sentActivity.emails) {
        _activity.emails = _sentActivity.emails;
      } else if (_sentActivity.texts) {
        _activity.texts = _sentActivity.texts;
      } else if (_sentActivity.single_id) {
        _activity.single_id = _sentActivity.single_id;
      }
    } else {
      _activity.single_id = _activity._id;
    }
    const newTags = _.union(_exist.tags, tags);
    const updateData = { ...fieldData, tags: newTags };

    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });
    updateData['last_activity'] = activity.id;
    updateData['source'] = LEAD_SOURCE_TYPE.LEADFORM;

    const MaterialModels = { video: Video, pdf: PDF, image: Image };
    let material;
    let materialType;
    if (video) materialType = 'video';
    if (pdf) materialType = 'pdf';
    if (image) materialType = 'image';

    const materialId = video || pdf || image;
    if (materialId && materialType) {
      material = await MaterialModels[materialType]
        .findOne({ _id: materialId })
        .catch((err) => {
          console.log('video found err', err.message);
        });
    }
    const form_link = `${urls.MATERIAL_URL}/embeded-form/${lead_id}`;
    const leadForm = await LeadForm.findOne({
      _id: mongoose.Types.ObjectId(lead_id),
    });
    // Create Notification for lead capture video
    createNotification(
      (materialType || 'page') + '_lead_capture',
      {
        criteria: 'lead_capture',
        contact: _exist,
        ...(material ? { [materialType]: material } : {}),
        form_name: leadForm?.name,
        form_link,
      },
      currentUser
    );

    Contact.updateOne(
      { _id: _exist.id },
      {
        $set: {
          ...updateData,
        },
      }
    )
      .then(() => {
        triggerAutomation({
          user: currentUser,
          contacts: [_exist.id],
          trigger: {
            type: 'form_submitted',
            form_id: lead_id,
          },
          fieldData: { ...req.body },
        });

        outboundCallhookApi(
          currentUser.id,
          outbound_constants.LEAD_SOURCE,
          getContactOutboundData,
          { _id: _exist._id, type: LEAD_SOURCE_TYPE.LEADFORM, lead: lead_id }
        );
        if (automation) {
          const data = {
            assign_array: [_exist.id],
            automation_id: automation,
            type: 'contact',
            user_id: user,
            required_unique: false,
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
      })
      .catch((err) => {
        console.log('contact update err', err.message);
      });

    return res.json({
      status: true,
      data: {
        contact: _exist.id,
        activity: _activity ? _activity.id : null,
      },
    });
  } else {
    const MaterialModels = { video: Video, pdf: PDF, image: Image };
    const ActivityContents = {
      video: 'LEAD CAPTURE - watched video',
      pdf: 'LEAD CAPTURE - reviewed pdf',
      image: 'LEAD CAPTURE - reviewed image',
    };
    const DEFAULT_CONTENT = 'LEAD CAPTURE - watched landing page';
    const e164Phone = phone(cell_phone)?.phoneNumber || cell_phone;
    const label = Labels[9].id;
    const _contact = new Contact({
      ...fieldData,
      first_name,
      last_name,
      email,
      cell_phone: e164Phone,
      label,
      tags,
      user,
      source: LEAD_SOURCE_TYPE.LEADFORM,
    });

    _contact
      .save()
      .then(async (contact) => {
        await shareContactsToOrganization(currentUser, contact._id).catch(
          (err) =>
            console.log('share contacts to organization err', err.message)
        );
        triggerAutomation({
          user: currentUser,
          contacts: [contact.id],
          trigger: {
            type: 'form_submitted',
            form_id: lead_id,
          },
          fieldData: { ...req.body },
        });

        outboundCallhookApi(
          currentUser.id,
          outbound_constants.LEAD_SOURCE,
          getContactOutboundData,
          {
            _id: _contact._id,
            type: LEAD_SOURCE_TYPE.LEADFORM,
            lead: lead_id,
          }
        );
        let material;
        let materialType;
        if (video) materialType = 'video';
        if (pdf) materialType = 'pdf';
        if (image) materialType = 'image';
        const materialId = video || pdf || image;
        if (materialId && materialType) {
          material = await MaterialModels[materialType]
            .findOne({ _id: materialId })
            .catch((err) => {
              console.log('video found err', err.message);
            });
        }
        tracker.contact = contact.id;
        await tracker
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        ContactHelper.updateAnonymousActivityWithContact(
          _sentActivity,
          contact.id
        ); // if sentActivity is anonymous track activity, apply the contact value

        const _activity = new Activity({
          content: ActivityContents[materialType] || DEFAULT_CONTENT,
          contacts: contact.id,
          user: currentUser.id,
          type: 'form_trackers',
          ...(material ? { [materialType + 's']: materialId } : {}),
          form_trackers: tracker.id,
          landing_pages: landing_page,
        });
        if (_sentActivity) {
          if (_sentActivity.emails) {
            _activity.emails = _sentActivity.emails;
          } else if (_sentActivity.texts) {
            _activity.texts = _sentActivity.texts;
          } else if (_sentActivity.single_id) {
            _activity.single_id = _sentActivity.single_id;
          }
        } else {
          _activity.single_id = _activity._id;
        }
        _activity.single_id = _activity._id;
        const activity = await _activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });
        const form_link = `${urls.MATERIAL_URL}/embeded-form/${lead_id}`;
        const leadForm = await LeadForm.findOne({
          _id: mongoose.Types.ObjectId(lead_id),
        });
        // Create Notification for lead capture video
        createNotification(
          (materialType || 'page') + '_lead_capture',
          {
            criteria: 'lead_capture',
            contact,
            ...(material ? { [materialType]: material } : {}),
            form_name: leadForm?.name,
            form_link,
          },
          currentUser
        );

        Contact.updateOne(
          { _id: contact.id },
          { $set: { last_activity: activity.id } }
        ).catch((err) => {
          console.log('contact update err', err.message);
        });

        if (automation) {
          const data = {
            assign_array: [contact.id],
            automation_id: automation,
            user_id: currentUser.id,
            type: 'contact',
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

        return res.send({
          status: true,
          data: {
            contact: contact.id,
            activity: activity.id,
          },
        });
      })
      .catch((err) => {
        return res.status(400).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const createContactByUcraft = async (req, res) => {
  const { formData, sitename } = req.body;
  const { currentUser } = req;

  const event = new Event({
    additional: req.body,
    type: 'ucraft_lead',
  });

  event
    .save()
    .then(() => {})
    .catch(() => {});

  let inputData;
  try {
    inputData = JSON.parse(formData)?.formData;
  } catch (err) {
    return res.status(400).send({
      status: false,
      error: 'Please input valid data.',
    });
  }

  if (!inputData || inputData.length == 0) {
    return res.status(400).send({
      status: false,
      error: 'Please input valid data.',
    });
  }

  const contactData = {};

  if (Array.isArray(inputData)) {
    inputData.forEach((data) => {
      contactData[data.name.toLowerCase()] = data.value;
    });
  } else {
    for (const field in inputData) {
      const data = inputData[field];
      contactData[data.name.toLowerCase()] = data.value;
    }
  }

  const email = contactData.email;

  if (!email) {
    return res.status(400).send({
      status: false,
      error: 'Please input Email Address.',
    });
  }

  const name = contactData.name;
  const cell_phone = contactData.phone;

  delete contactData.email;
  delete contactData.name;
  delete contactData.phone;

  const exist = await Contact.findOne({
    email,
    user: currentUser.id,
  }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });

  if (exist) {
    return res.status(200).send({
      status: true,
      error: 'Contact already exists.',
    });
  } else {
    const e164Phone = phone(cell_phone)?.phoneNumber || cell_phone;
    const label = Labels[9].id;
    const _contact = new Contact({
      first_name: name?.split(' ')[0],
      last_name: name?.split(' ')[1],
      email,
      cell_phone: e164Phone,
      label,
      additionalFields: contactData,
      user: currentUser.id,
    });

    _contact
      .save()
      .then(async (contact) => {
        const _activity = new Activity({
          content: `Added contact from landing page (${sitename})`,
          contacts: contact.id,
          user: currentUser.id,
          type: 'contacts',
        });
        _activity.single_id = _activity._id;
        const activity = await _activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          { $set: { last_activity: activity.id } }
        ).catch((err) => {
          console.log('contact update err', err.message);
        });

        await shareContactsToOrganization(currentUser, contact._id).catch(
          (err) =>
            console.log('share contacts to organization err', err.message)
        );
        return res.send({
          status: true,
          data: {
            contact: contact.id,
            activity: activity.id,
          },
        });
      })
      .catch((err) => {
        return res.status(400).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const generateAdvancedFilterQuery = ({
  searchStr,
  labelCondition,
  countryCondition,
  regionCondition,
  cityCondition,
  zipcodeCondition,
  tagsCondition,
  brokerageCondition,
  sourceCondition,
  includeLabel,
  includeUnsubscribed = true,
  includeSource,
  includeTag,
  orTag,
  includeBrokerage,
  fieldQuery,
  assigneeCondition,
  customFieldCondition,
  unsubscribed,
}) => {
  const query = [];
  if (searchStr) {
    var strQuery = {};
    var search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
    var phoneSearchStr = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
    if (search.split(' ').length > 1) {
      const firstStr = search.split(' ')[0];
      const secondStr = search.split(' ')[1];
      strQuery = {
        $or: [
          {
            first_name: { $regex: '.*' + firstStr, $options: 'i' },
            last_name: { $regex: secondStr + '.*', $options: 'i' },
          },
          { first_name: { $regex: '.*' + search + '.*', $options: 'i' } },
          { last_name: { $regex: '.*' + search + '.*', $options: 'i' } },
          {
            cell_phone: { $regex: '.*' + phoneSearchStr + '.*', $options: 'i' },
          },
        ],
      };
    } else {
      strQuery = {
        $or: [
          { first_name: { $regex: '.*' + search + '.*', $options: 'i' } },
          { email: { $regex: '.*' + search + '.*', $options: 'i' } },
          { last_name: { $regex: '.*' + search + '.*', $options: 'i' } },
          {
            cell_phone: { $regex: '.*' + phoneSearchStr + '.*', $options: 'i' },
          },
        ],
      };
    }
    query.push(strQuery);
  }

  if (sourceCondition && sourceCondition.length) {
    let sources = sourceCondition;
    if (sourceCondition.indexOf(null) !== -1) {
      sources = [...sourceCondition, '', null];
    }
    var sourceQuery = {};
    if (includeSource) {
      sourceQuery = { source: { $in: sources } };
    } else {
      sourceQuery = { source: { $nin: sources } };
    }
    query.push(sourceQuery);
  }

  if (labelCondition && labelCondition.length) {
    var labelQuery;
    const labelConditionData = [];
    labelCondition.forEach((e) => {
      if (e) {
        labelConditionData.push(mongoose.Types.ObjectId(e));
      } else {
        labelConditionData.push(e);
      }
    });
    if (includeLabel) {
      labelQuery = { label: { $in: labelConditionData } };
    } else {
      labelQuery = { label: { $nin: labelConditionData } };
    }
    query.push(labelQuery);
  }

  if (tagsCondition && tagsCondition.length) {
    var tagsQuery;

    const regexTags = tagsCondition
      .filter((tag) => tag !== null)
      .map((tag) => new RegExp(`^${tag}$`, 'i'));

    const hasNull = tagsCondition.indexOf(null) !== -1;
    if (hasNull) {
      const index = tagsCondition.indexOf(null);
      tagsCondition.splice(index, 1);
      if (includeTag) {
        if (orTag) {
          tagsQuery = {
            $or: [
              { tags: { $elemMatch: { $in: regexTags } } },
              { tags: [] },
              { tags: '' },
              { tags: null },
            ],
          };
        } else {
          tagsQuery = {
            $and: regexTags.map((regex) => ({
              tags: { $elemMatch: { $regex: regex } },
            })),
          };
        }
      } else {
        tagsQuery = {
          $and: [
            { tags: { $nin: [[], '', null] } },
            ...regexTags.map((regex) => ({
              tags: { $not: regex },
            })),
          ],
        };
      }
    } else {
      if (includeTag) {
        if (orTag) {
          tagsQuery = { tags: { $elemMatch: { $in: regexTags } } };
        } else {
          tagsQuery = {
            $and: regexTags.map((regex) => ({
              tags: { $elemMatch: { $regex: regex } },
            })),
          };
        }
      } else {
        tagsQuery = {
          $and: regexTags.map((regex) => ({
            tags: { $not: regex },
          })),
        };
      }
    }
    query.push(tagsQuery);
  }

  if (brokerageCondition && brokerageCondition.length) {
    let brokerages = brokerageCondition;
    if (brokerageCondition.indexOf(null) !== -1) {
      brokerages = [...brokerageCondition, '', null];
    }
    var brokerageQuery = {};
    if (includeBrokerage) {
      brokerageQuery = { brokerage: { $in: brokerages } };
    } else {
      brokerageQuery = { brokerage: { $nin: brokerages } };
    }
    query.push(brokerageQuery);
  }

  if (countryCondition && countryCondition.length) {
    var countryQuery = { country: { $in: countryCondition } };
    query.push(countryQuery);
  }

  if (regionCondition && regionCondition.length) {
    var regionQuery = { state: { $in: regionCondition } };
    query.push(regionQuery);
  }

  if (cityCondition && cityCondition.length) {
    var cityQuery = { city: { $regex: '.*' + cityCondition + '.*' } };
    query.push(cityQuery);
  }

  if (zipcodeCondition) {
    var zipQuery = { zip: { $regex: '.*' + zipcodeCondition + '.*' } };
    query.push(zipQuery);
  }

  try {
    if (fieldQuery && Object.keys(fieldQuery).length) {
      query.push(fieldQuery);
    }
  } catch (err) {
    console.log('analytics query', err);
  }

  if (assigneeCondition && assigneeCondition.length) {
    const assignee = assigneeCondition.map((e) =>
      mongoose.Types.ObjectId(e._id)
    );
    var assigneeQuery = { owner: { $in: assignee } };
    query.push(assigneeQuery);
  }

  if (customFieldCondition && customFieldCondition.length) {
    const customQuery = {
      $or: [],
    };
    for (let i = 0; i < customFieldCondition.length; i++) {
      const customFilter = customFieldCondition[i];
      const field = 'additional_field.' + customFilter['column'];
      if (customFilter.type === 'date') {
        const timeQuery = {
          [field]: {},
        };
        if (customFilter.start) {
          const startDate = new Date(
            `${customFilter.start.year}-${customFilter.start.month}-${customFilter.start.day}`
          );
          timeQuery[field]['$gte'] = new Date(
            startDate.getTime() +
              Math.abs(startDate.getTimezoneOffset() * 60000)
          ).toISOString();
        }
        if (customFilter.end) {
          let endDate = new Date(
            `${customFilter.end.year}-${customFilter.end.month}-${customFilter.end.day}`
          );
          endDate = new Date(
            endDate.getTime() + Math.abs(endDate.getTimezoneOffset() * 60000)
          );
          endDate.setDate(endDate.getDate() + 1);
          timeQuery[field]['$lte'] = endDate.toISOString();
        }
        customQuery['$or'].push(timeQuery);
      } else if (customFilter.type === 'dropdown') {
        if (customFilter['include']) {
          customQuery['$or'].push({
            [field]: { $in: customFilter['options'] },
          });
        } else {
          customQuery['$or'].push({
            [field]: { $nin: customFilter['options'] },
          });
        }
      } else {
        customQuery['$or'].push({
          [field]: {
            $regex: '.*' + customFilter['condition'] + '.*',
            $options: 'i',
          },
        });
      }
    }
    if (customQuery['$or'].length) {
      query.push(customQuery);
    }
  }

  if (unsubscribed?.email || unsubscribed?.text) {
    if (unsubscribed?.email) {
      if (includeUnsubscribed) {
        query.push({ 'unsubscribed.email': true });
      } else {
        query.push({ 'unsubscribed.email': { $ne: true } });
      }
    }

    if (unsubscribed?.text) {
      if (includeUnsubscribed) {
        query.push({ 'unsubscribed.text': true });
      } else {
        query.push({ 'unsubscribed.text': { $ne: true } });
      }
    }
  }

  return query;
};

const advanceSearch = async (req, res) => {
  const { currentUser } = req;
  // Select or Fetch
  const action = req.params.action;

  const {
    teamOptions,
    analyticsConditions,
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    stagesCondition,
    assigneeCondition,

    includeLabel,
    includeUnsubscribed,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    includeStage,

    activityCondition,
    activityStart,
    activityEnd,

    customFieldCondition,

    unsubscribed,
  } = req.body;
  const { searchType } = req.body;

  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const skip = req.body.skip || 0;
  const count = req.body.count || 50;

  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  /**
   * Pre. Split the analytics search options to fieldCondition & activityCondition
   */
  const {
    fieldQuery,
    activityCondition: activityConditionQuery,
    automationOption,
  } = ContactHelper.getConditionsByAnalytics(analyticsConditions || []);

  /**
   * Pre. Additional Query for the select or loading option
   */
  const additionalQuery = [];
  if (action === 'select') {
    additionalQuery.push({
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
      },
    });
  } else {
    // Sort & Facet
    additionalQuery.push({
      $project: {
        _id: 1,
      },
    });
    additionalQuery.push({
      $sort: { [field]: dir },
    });
    additionalQuery.push({
      $facet: {
        count: [{ $count: 'total' }],
        data: [
          {
            $skip: skip,
          },
          {
            $limit: count,
          },
        ],
      },
    });
  }

  try {
    if (teamOptions && Object.keys(teamOptions).length) {
      const teamContactData = await teamMemberSearch(
        currentUser._id,
        teamOptions,
        {
          searchStr,
          labelCondition,
          countryCondition,
          regionCondition,
          cityCondition,
          zipcodeCondition,
          tagsCondition,
          brokerageCondition,
          sourceCondition,
          includeLabel,
          includeSource,
          includeTag,
          includeBrokerage,
          fieldQuery,
        },
        additionalQuery,
        action
      );
      return res.send(teamContactData);
    }
  } catch (e) {
    sendErrorToSentry(currentUser, e);
    return res.status(500).send({
      status: false,
      error: e.message,
    });
  }

  let query = {
    $or: [],
    $and: [],
  };

  //= = apply universal list type
  const userId = mongoose.Types.ObjectId(currentUser.id);

  if (searchType === 'own') {
    if (automationOption?.id || analyticsConditions.length > 0) {
      query['$or'] = [{ user: userId }];
    } else {
      const teamList = await Team.find({ members: userId }).select({ _id: 1 });
      const teamListIds = teamList.map((e) => e._id);
      query['$or'] = [
        { user: userId },
        { shared_members: userId },
        { shared_team: { $in: teamListIds }, shared_all_member: true },
      ];
    }
  } else if (searchType === 'team') {
    const teamList = await Team.find({ members: userId }).select({ _id: 1 });
    const teamListIds = teamList.map((e) => e._id);

    query['$or'] = [
      { shared_members: userId },
      { shared_team: { $in: teamListIds }, shared_all_member: true },
      { 'shared_team.0': { $exists: true }, user: userId },
    ];
  } else if (searchType === 'private') {
    query = {
      ...query,
      user: userId,
      'shared_members.0': { $exists: false },
      'shared_team.0': { $exists: false },
    };
  } else if (searchType === 'prospect') {
    query = {
      ...query,
      user: userId,
      prospect_id: { $exists: true, $ne: '' },
    };
  } else if (searchType === 'assigned') {
    query = { ...query, owner: userId };
  } else if (searchType === 'pending') {
    const teamList = await Team.find({ members: userId }).select({ _id: 1 });
    const teamListIds = teamList.map((e) => e._id);
    if (teamList.length) {
      query['$or'] = [
        {
          shared_members: { $ne: userId },
          declined_users: { $ne: userId },
          shared_team: { $in: teamListIds },
          shared_all_member: true,
        },
        { pending_users: userId, type: 'share' },
        {
          pending_users: currentUser._id,
          type: { $in: ['transfer', 'clone', 'avm'] },
        },
      ];
    } else {
      query['$or'] = [
        { pending_users: userId, type: 'share' },
        {
          pending_users: currentUser._id,
          type: { $in: ['transfer', 'clone', 'avm'] },
        },
      ];
    }
  } else {
    query = { ...query, user: userId };
  }

  // ==end apply universal list type

  /* 
  if (!(automationOption && automationOption.id)) {
    query['$or'].push({ shared_members: currentUser._id });
  } 
  */

  /**
   * 1. Deal Stage Contact Ids Getting
   */
  let dealContactIds = [];
  if (stagesCondition && stagesCondition.length) {
    const dealStages = await DealStage.find({
      _id: { $in: stagesCondition },
      user: currentUser._id,
    });
    const _dealIds = dealStages.flatMap((stage) => stage.deals);
    const deals = await Deal.find({
      _id: { $in: _dealIds },
      user: currentUser._id,
    });
    dealContactIds = deals.flatMap((deal) => deal.contacts);
    if (!dealContactIds.length) {
      return res.send({
        status: true,
        data: [],
      });
    }
  }

  /**
   * 2. Contact Ids getting by Activity & Analytics Activity Search
   * activityQuery = { $and: [ activityTimeQuery, { $or: activityTypeQueries }]}
   * */
  const activityQuery = {
    $and: [{ user: currentUser._id }],
  };
  // 2.1 Time Query Setting
  const activityTimeQuery = {};
  if (activityStart || activityEnd) {
    activityTimeQuery['created_at'] = {};
    if (activityStart) {
      const activityStartDate = new Date(
        `${activityStart.year}-${activityStart.month}-${activityStart.day}`
      );
      activityTimeQuery['created_at']['$gte'] = new Date(
        activityStartDate.getTime() +
          Math.abs(activityStartDate.getTimezoneOffset() * 60000)
      );
    }
    if (activityEnd) {
      let activityEndDate = new Date(
        `${activityEnd.year}-${activityEnd.month}-${activityEnd.day}`
      );
      activityEndDate = new Date(
        activityEndDate.getTime() +
          Math.abs(activityEndDate.getTimezoneOffset() * 60000)
      );
      activityEndDate.setDate(activityEndDate.getDate() + 1);
      activityTimeQuery['created_at']['$lte'] = activityEndDate;
    }
    activityQuery['$and'].push(activityTimeQuery);
  }
  // 2.2 Activity Type Query Setting
  const activityTypeQueries = [];
  const singleActivities = [];
  for (let i = 0; i < activityCondition.length; i++) {
    const condition = activityCondition[i];
    const type =
      // eslint-disable-next-line no-nested-ternary
      condition.type === 'watched_pdf'
        ? 'pdf_trackers'
        : condition.type === 'watched_image'
        ? 'image_trackers'
        : condition.type;
    if (type === 'clicked_link') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*clicked.*',
          $options: 'i',
        },
      });
    } else if (type === 'opened_email') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*opened.*',
          $options: 'i',
        },
      });
    } else if (condition.detail) {
      const DETAIL_TYPES = {
        videos: 'videos',
        pdfs: 'pdfs',
        images: 'images',
        video_trackers: 'videos',
        pdf_trackers: 'pdfs',
        image_trackers: 'images',
      };
      activityTypeQueries.push({
        type,
        [DETAIL_TYPES[type]]: {
          $in: [mongoose.Types.ObjectId(condition.detail)],
        },
      });
    } else {
      singleActivities.push(type);
    }
  }
  if (singleActivities.length) {
    activityTypeQueries.push({
      type: { $in: singleActivities },
    });
  }
  try {
    if (activityConditionQuery && Object.keys(activityConditionQuery).length) {
      activityTypeQueries.push(activityConditionQuery);
    }
  } catch (err) {
    console.log('analytics condition query');
  }
  if (activityTypeQueries.length) {
    activityQuery['$and'].push({ $or: activityTypeQueries });
    activityQuery['$and'].push({ contacts: { $exists: true } });
  }

  // 3. Analytics Automation Search

  // 4. Contact Data Field Search & Analytics Field & Rate Search
  const subQuery = generateAdvancedFilterQuery({
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    includeLabel,
    includeUnsubscribed,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    fieldQuery,
    assigneeCondition,
    customFieldCondition,
    unsubscribed,
  });
  query['$and'] = subQuery;

  // Automation Option Query
  if (automationOption && automationOption.id) {
    if (automationOption.id === 'recent_off_automation') {
      const latestOffAutomation = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      subQuery.push({ automation_off: { $gte: latestOffAutomation } });
    } else if (
      automationOption.id === 'on_automation' ||
      automationOption.id === 'never_automated'
    ) {
      const automationContactIds = await onAutomationInfo(
        currentUser._id,
        'contact'
      );

      if (automationOption.id === 'on_automation') {
        if (!automationContactIds.length) {
          return res.send({
            status: true,
            data: [],
          });
        } else {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $in: automationContactIds } });
        }
      } else {
        subQuery.push({ automation_off: { $exists: false } });
        if (automationContactIds.length) {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $nin: automationContactIds } });
        }
      }
    }
  }

  if (!subQuery.length && !dealContactIds.length) {
    delete query['$and'];
  }
  if (!query['$or'].length) {
    delete query['$or'];
  }

  if (dealContactIds.length) {
    if (includeStage) {
      activityQuery['$and'].push({ contacts: { $in: dealContactIds } });
      query['$and'].push({ _id: { $in: dealContactIds } });
    } else {
      activityQuery['$and'].push({ contacts: { $nin: dealContactIds } });
      query['$and'].push({ _id: { $nin: dealContactIds } });
    }
  }

  // 5. Exec search query
  let data = [];
  if (activityTypeQueries.length) {
    // Join Query
    data = await Activity.aggregate([
      {
        $match: activityQuery,
      },
      {
        $group: { _id: { contact: '$contacts' } },
      },
      {
        $lookup: {
          from: 'contacts',
          localField: '_id.contact',
          foreignField: '_id',
          as: 'contacts',
        },
      },
      { $unwind: '$contacts' },
      {
        $replaceRoot: {
          newRoot: '$contacts',
        },
      },
      {
        $match: query,
      },
      // ...additionalQuery,
    ]);
  } else {
    data = await Contact.aggregate([
      { $match: query } /* ...additionalQuery */,
    ]);
  }

  if (action === 'select') {
    return res.send({
      status: true,
      data,
    });
  }
  // Last Activity Join and Shared Members Join
  if (data && data.length) {
    const total = data.length;
    const ids = data.map((e) => e._id);
    const contacts = await Contact.find({
      _id: { $in: ids },
    })
      .populate([
        { path: 'last_activity', select: { content: 1, type: 1 } },
        { path: 'shared_members', select: { _id: 1, user_name: 1, email: 1 } },
        {
          path: 'user',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
        {
          path: 'owner',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
      ])
      .sort({ [field]: dir })
      .skip(skip)
      .limit(count);

    return res.send({
      status: true,
      data: contacts,
      total,
    });
  }
  return res.send({
    status: true,
    data: [],
  });
};

const teamMemberSearch = async (
  user,
  teamOptions,
  {
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    includeLabel,
    includeSource,
    includeTag,
    includeBrokerage,
    fieldQuery,
  },
  additionalQuery,
  action
) => {
  const teamQuery = { $or: [] };
  let teamContacts = [];
  const teamContactIds = [];
  for (const team_id in teamOptions) {
    const teamOption = teamOptions[team_id];
    if (teamOption.flag === 1) {
      if (
        teamOption.share_with &&
        teamOption.share_with.flag === 1 &&
        teamOption.share_by &&
        teamOption.share_by.flag === 1
      ) {
        teamQuery['$or'].push({
          shared_team: [team_id],
          $or: [
            {
              user,
            },
            { shared_members: [user] },
          ],
        });
      } else {
        const users = [...teamOption.share_with.members, user];
        teamQuery['$or'].push({
          shared_team: [team_id],
          $or: [
            {
              user: { $in: users },
            },
            { shared_members: teamOption.share_with.members },
          ],
        });
      }
      continue;
    } else {
      const shareWithQuery = {};
      const shareByQuery = {};
      const evTeamQuery = { $or: [] };
      if (teamOption.share_with && teamOption.share_with.flag !== -1) {
        shareWithQuery['user'] = user;
        shareWithQuery['shared_team'] = [team_id];
        if (!teamOption.share_with.flag) {
          shareWithQuery['shared_members'] = teamOption.share_with.members;
        }
        evTeamQuery['$or'].push(shareWithQuery);
      }
      if (teamOption.share_by && teamOption.share_by.flag !== -1) {
        if (teamOption.share_by.members && teamOption.share_by.members.length) {
          shareByQuery['user'] = {
            $in: teamOption.share_by.members,
          };
          shareByQuery['shared_team'] = [team_id];
          if (!teamOption.share_by.flag) {
            shareByQuery['shared_members'] = {
              $in: [user],
            };
          }
        } else {
          shareByQuery['shared_team'] = [team_id];
          if (!teamOption.share_by.flag) {
            shareByQuery['shared_members'] = {
              $in: [user],
            };
          }
          shareByQuery['user'] = {
            $ne: user,
          };
        }
        evTeamQuery['$or'].push(shareByQuery);
      }
      teamQuery['$or'].push(evTeamQuery);
    }
  }

  teamContacts = await Contact.find(teamQuery);
  teamContacts.forEach((e) => {
    teamContactIds.push(e._id);
  });
  if (!teamContactIds.length) {
    return {
      status: true,
      data: [],
    };
  }

  const subQuery = generateAdvancedFilterQuery({
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    includeLabel,
    includeSource,
    includeTag,
    includeBrokerage,
    fieldQuery,
  });
  const query = {
    _id: { $in: teamContactIds },
    $and: subQuery,
  };
  if (!subQuery.length) {
    delete query['$and'];
  }

  const data = await Contact.aggregate([{ $match: query }, ...additionalQuery]);
  if (action === 'select') {
    return {
      status: true,
      data,
    };
  }
  if (
    data &&
    data.length &&
    data[0].count &&
    data[0].count.length &&
    data[0].count[0]['total']
  ) {
    const total = data[0].count[0]['total'];
    const result = data[0].data;
    const ids = result.map((e) => e._id);
    const contacts = await Contact.find({ _id: { $in: ids } }).populate([
      { path: 'last_activity', select: { content: 1, type: 1 } },
      { path: 'shared_members', select: { _id: 1, user_name: 1, email: 1 } },
      {
        path: 'user',
        select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
      },
    ]);

    return {
      status: true,
      data: contacts,
      total,
    };
  }
};

const additionalFields = async (req, res) => {
  const { currentUser } = req;
  const additional_fields = await CustomField.find({
    user: currentUser.id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed, ', ex.message);
  });
  const garbage = await Garbage.findOne({ user: currentUser.id });
  let totalCount = 0;
  const counts = [];
  let query = {};
  for (const item of additional_fields) {
    const fieldName = item.name;
    query = { ['additional_field.' + fieldName]: { $nin: [null, ''] } };
    query['user'] = currentUser.id;
    totalCount = await Contact.countDocuments(query).catch((err) => {
      console.log('custom contact search is failed', err);
    });
    counts.push(totalCount);
  }
  return res.send({
    status: true,
    total: counts,
    data: garbage,
  });
};

const additionalFieldSearch = async (req, res) => {
  const { currentUser } = req;
  const { fieldName, str, option, dateRange } = req.body;
  const additional_fields = await CustomField.find({
    user: currentUser._id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('contact custom field load error', ex.message);
  });
  let totalCount = 0;
  let data = [];
  let query = {};
  const commonQuery = [];
  let fieldQuery = {};
  const search = str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const phoneSearch = str.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
  const selectedField = (additional_fields || []).filter(
    (e) => e.name === fieldName
  )[0];
  const stringSearchQ = {
    $regex: '.*' + search + '.*',
    $options: 'i',
  };
  const phoneSearchQ = {
    $regex: '.*' + phoneSearch + '.*',
    $options: 'i',
  };
  const existQ = {
    [`additional_field.${fieldName}`]: { $nin: [null, ''] },
  };
  fieldQuery = { ...existQ };
  if (str) {
    commonQuery.push(
      ...[
        { first_name: stringSearchQ },
        { last_name: stringSearchQ },
        { email: stringSearchQ },
        { cell_phone: phoneSearchQ },
        { secondary_phone: phoneSearchQ },
      ]
    );
  }
  if (
    !selectedField ||
    selectedField.type === 'text' ||
    selectedField.type === 'email'
  ) {
    if (str) {
      commonQuery.push({
        [`additional_field.${fieldName}`]: stringSearchQ,
      });
    }
  } else if (selectedField.type === 'phone') {
    if (str) {
      commonQuery.push({
        [`additional_field.${fieldName}`]: phoneSearchQ,
      });
    }
  } else if (selectedField.type === 'dropdown' && option !== 'all') {
    fieldQuery[`additional_field.${fieldName}`] = option;
  } else if (selectedField.type === 'date') {
    const dateQuery = {};
    if (dateRange && dateRange.startDate) {
      dateQuery['$gte'] = dateRange.startDate;
      fieldQuery[`additional_field.${fieldName}`] = dateQuery;
    }
    if (dateRange && dateRange.endDate) {
      dateQuery['$lte'] = dateRange.endDate;
      fieldQuery[`additional_field.${fieldName}`] = dateQuery;
    }
  }
  query = { ...fieldQuery };
  if (commonQuery.length > 0) {
    query['$or'] = commonQuery;
  }
  query['user'] = currentUser.id;
  totalCount = await Contact.countDocuments(query).catch((err) => {
    console.log('custom contact search is failed', err);
  });
  if (totalCount) {
    data = await Contact.find(query)
      .populate({ path: 'last_activity' })
      .catch((err) => {
        console.log('custom contact search is failed.', err);
      });
  }
  return res.send({
    status: true,
    data,
    total: totalCount,
  });
};

const getBrokerages = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    { $group: { _id: '$brokerage' } },
    {
      $sort: { _id: 1 },
    },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getSources = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    { $group: { _id: '$source' } },
    {
      $sort: { _id: 1 },
    },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getCities = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    { $group: { _id: '$city' } },
    {
      $sort: { _id: 1 },
    },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getNthContact = async (req, res) => {
  const { currentUser } = req;
  const skip = req.params.id;

  const contact = await Contact.aggregate([
    {
      $match: { user: currentUser.id },
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $skip: skip,
    },
  ]);
};

const loadFollows = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _follow_up = await FollowUp.find({
    user: currentUser.id,
    contact,
    status: { $ne: -1 },
  }).sort({ due_date: 1 });
  return res.send({
    status: true,
    follow_ups: _follow_up,
  });
};

const loadTimelines = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _timelines = await TimeLine.find({
    user: currentUser.id,
    contact,
  });
  let automation = {};
  if (_timelines.length) {
    automation = await Automation.findOne({ _id: _timelines[0]['automation'] })
      .select({ title: 1 })
      .catch((err) => {
        console.log('err', err);
      });
  }
  return res.send({
    status: true,
    timelines: _timelines,
    automation,
  });
};

const selectAllContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  }).select('_id');
  return res.send({
    status: true,
    data: contacts,
  });
};

const getAllContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  }).select({
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    cell_phone: 1,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const checkEmail = async (req, res) => {
  const { currentUser } = req;
  const { email } = req.body;

  const contacts = await Contact.find({
    user: currentUser.id,
    email: { $regex: new RegExp('^' + email + '$', 'i') },
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const checkPhone = async (req, res) => {
  const { currentUser } = req;
  const { cell_phone } = req.body;

  if (typeof cell_phone === 'object') {
    return res.send({
      data: [],
      status: true,
    });
  }

  const contacts = await Contact.find({
    user: currentUser.id,
    cell_phone,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const loadDuplication = async (req, res) => {
  const { currentUser } = req;
  const duplications = await Contact.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser._id),
      },
    },
    {
      $group: {
        _id: { email: '$email' },
        count: { $sum: 1 },
        contacts: { $push: '$$ROOT' },
      },
    },
    {
      $match: { count: { $gte: 2 } },
    },
  ]).catch((err) => {
    console.log('err', err);
    sendErrorToSentry(currentUser, err);
    return res.status(500).send({
      status: false,
      error: err.error,
    });
  });

  return res.send({
    status: true,
    data: duplications,
  });
};

/**
const mergeContacts = (req, res) => {
  const { currentUser } = req;
  const { primary, secondaries, result } = req.body;
  delete result['_id'];
  Contact.updateOne({ _id: mongoose.Types.ObjectId(primary) }, { $set: result })
    .then((data) => {
      Contact.deleteMany({ _id: { $in: secondaries } })
        .then(async (data) => {
          await Activity.deleteMany({
            contacts: { $in: secondaries },
            type: 'contacts',
          });
          await Activity.updateMany(
            { contacts: { $in: secondaries } },
            { $set: { contacts: mongoose.Types.ObjectId(primary) } }
          );
          await EmailTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await Email.updateMany(
            { contacts: { $in: secondaries } },
            { $set: { contacts: mongoose.Types.ObjectId(primary) } }
          );
          await FollowUp.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await ImageTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await Note.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await PDFTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await PhoneLog.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await Reminder.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await VideoTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          return res.send({
            status: true,
          });
        })
        .catch((e) => {
          console.log('error', e);
          return res.status(500).send({
            status: false,
            error: e.error,
          });
        });
      // TimeLine.updateMany({contact: {$in: secondaries}}, {$set: {contact: mongoose.Types.ObjectId(primary)}});
    })
    .catch((e) => {
      console.log('error', e);
      return res.status(500).send({
        status: false,
        error: e.error,
      });
    });
};
 */

const bulkCreate = async (req, res) => {
  const { contacts } = req.body;
  const { currentUser, guest_loggin, guest } = req;

  const failure = [];
  const succeed = [];
  const promise_array = [];
  let detail_content = 'added';
  if (guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content, guest.name);
  }

  for (let i = 0; i < contacts.length; i++) {
    const promise = new Promise(async (resolve, reject) => {
      const data = { ...contacts[i] };

      if (data['email']) {
        const email_contact = await Contact.findOne({
          email: data['email'],
          user: currentUser.id,
        }).catch((err) => {
          console.log('contact found err', err.message);
        });
        if (email_contact) {
          failure.push({ message: 'duplicate', data });

          let existing = false;
          failure.some((item) => {
            if (item.data._id == email_contact.id) {
              existing = true;
              return true;
            }
          });
          if (!existing) {
            failure.push({ message: 'duplicate', data: email_contact });
          }
          resolve();
          return;
        }
      }

      if (data['cell_phone']) {
        const cell_phone =
          phone(data['cell_phone'])?.phoneNumber || data['cell_phone'];
        const phone_contact = await Contact.findOne({
          cell_phone,
          user: currentUser.id,
        }).catch((err) => {
          console.log('contact found err', err.message);
        });
        if (phone_contact) {
          failure.push({ message: 'duplicate', data });

          let existing = false;
          failure.some((item) => {
            if (item.data._id == phone_contact.id) {
              existing = true;
              return true;
            }
          });
          if (!existing) {
            failure.push({ message: 'duplicate', data: phone_contact });
          }
          resolve();
          return;
        }
      }

      if (data['label']) {
        data['label'] = await LabelHelper.convertLabel(
          currentUser.id,
          data['label'],
          currentUser.source
        );
      } else {
        delete data.label;
      }

      const contact = new Contact({
        ...data,
        user: currentUser.id,
        created_at: new Date(),
        updated_at: new Date(),
      });
      contact
        .save()
        .then(async (_contact) => {
          succeed.push(_contact);

          const activity = new Activity({
            content: detail_content,
            contacts: _contact.id,
            user: currentUser.id,
            type: 'contacts',
          });
          activity.single_id = activity._id;
          activity
            .save()
            .then((_activity) => {
              Contact.updateOne(
                { _id: _contact.id },
                {
                  $set: { last_activity: _activity.id },
                }
              ).catch((err) => {
                console.log('err', err);
              });
            })
            .catch((err) => {
              console.log('err', err);
            });
          await shareContactsToOrganization(currentUser, _contact._id).catch(
            (err) =>
              console.log('share contacts to organization err', err.message)
          );
          resolve();
        })
        .catch((err) => {
          console.log('err', err);
        });
    });

    promise_array.push(promise);
  }

  Promise.all(promise_array).then(function () {
    return res.send({
      status: true,
      failure,
      succeed,
    });
  });
};

const verifyEmail = async (email) => {
  // const { email } = req.body;
  const verifier = new Verifier(api.EMAIL_VERIFICATION_KEY, {
    checkFree: false,
    checkDisposable: false,
    checkCatchAll: false,
  });

  return new Promise((resolve, reject) => {
    verifier.verify(email, (err, data) => {
      if (err) {
        reject(false);
      }
      if (
        data['formatCheck'] === 'true' &&
        data['smtpCheck'] === 'true' &&
        data['dnsCheck'] === 'true'
      ) {
        resolve(true);
      } else {
        reject(false);
      }
    });
  });
};

const verifyPhone = async (req, res) => {
  const { cell_phone } = req.body;
  const e164Phone = phone(cell_phone)?.phoneNumber;
  if (e164Phone) {
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Invalid Phone Number',
    });
  }
};

const capitalize = (s) => {
  if ((typeof s).toLowerCase() !== 'string') return;
  if (s.split(' ').length === 2) {
    const s1 = s.split(' ')[0];
    const s2 = s.split(' ')[1];

    return `${s1.charAt(0).toUpperCase() + s1.slice(1).toLowerCase()} ${s2
      .charAt(0)
      .toUpperCase()}${s2.slice(1).toLowerCase()}`;
  }
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const interestContact = async (req, res) => {
  const { user, contact, material, materialType } = req.body;
  const _exist = await Contact.findOne({
    _id: contact,
    user,
  }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });
  if (_exist) {
    let _activity;
    if (materialType === 'video') {
      _activity = new Activity({
        content: 'gave thumbs up',
        contacts: _exist.id,
        user,
        type: 'videos',
        videos: material,
      });
    } else if (materialType === 'pdf') {
      _activity = new Activity({
        content: 'gave thumbs up',
        contacts: _exist.id,
        user,
        type: 'pdfs',
        pdfs: material,
      });
    } else if (materialType === 'image') {
      _activity = new Activity({
        content: 'gave thumbs up',
        contacts: _exist.id,
        user,
        type: 'images',
        images: material,
      });
    }
    _activity.single_id = _activity._id;
    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('activity save err', err.message);
      });

    return res.json({
      status: true,
      data: {
        contact: _exist.id,
        activity: activity.id,
      },
    });
  }
};

const interestSubmitContact = async (req, res) => {
  const { user, first_name, email, cell_phone, material, materialType } =
    req.body;
  let _exist = await Contact.findOne({
    email,
    user,
  }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });

  if (!_exist) {
    _exist = await Contact.findOne({
      cell_phone,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }

  let video;
  let pdf;
  let image;
  if (materialType === 'video') {
    video = material;
  }
  if (materialType === 'pdf') {
    pdf = material;
  }
  if (materialType === 'image') {
    image = material;
  }

  if (_exist) {
    let _activity;
    if (video) {
      _activity = new Activity({
        content: 'INTERESTED',
        contacts: _exist.id,
        user,
        type: 'videos',
        videos: video,
      });
    } else if (pdf) {
      _activity = new Activity({
        content: 'INTERESTED',
        contacts: _exist.id,
        user,
        type: 'pdfs',
        pdfs: pdf,
      });
    } else if (image) {
      _activity = new Activity({
        content: 'INTERESTED',
        contacts: _exist.id,
        user,
        type: 'images',
        images: image,
      });
    }
    _activity.single_id = _activity._id;
    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });

    return res.json({
      status: true,
      data: {
        contact: _exist.id,
        activity: activity.id,
      },
    });
  } else {
    if (email) {
      const { error } = await verifyEmail(email).catch((err) => {
        return {
          error: err.message,
        };
      });
      if (error) {
        res.status(400).json({
          status: false,
          error,
        });
      }
    }
    const e164Phone = phone(cell_phone)?.phoneNumber || cell_phone;
    if (!e164Phone) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Phone Number',
      });
    }

    const label = system_settings.LEAD;
    const _contact = new Contact({
      first_name,
      email,
      cell_phone: e164Phone,
      label,
      tags: ['interested'],
      user,
    });

    if (video) {
      _contact
        .save()
        .then(async (contact) => {
          const _video = await Video.findOne({ _id: video }).catch((err) => {
            console.log('video found err', err.message);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('current user found err', err.message);
          });

          const _activity = new Activity({
            content: 'INTERESTED',
            contacts: contact.id,
            user: currentUser.id,
            type: 'videos',
            videos: video,
          });
          _activity.single_id = _activity._id;
          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          // Create Notification for interested video lead capture
          createNotification(
            'video_interesting_capture',
            {
              criteria: 'lead_capture',
              contact,
              video: _video,
            },
            currentUser
          );

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('contact update err', err.message);
          });

          await shareContactsToOrganization(currentUser, contact._id).catch(
            (err) =>
              console.log('share contacts to organization err', err.message)
          );

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    } else if (pdf) {
      _contact
        .save()
        .then(async (contact) => {
          const _pdf = await PDF.findOne({ _id: pdf }).catch((err) => {
            console.log('err', err);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('err', err);
          });

          const _activity = new Activity({
            content: 'INTERESTED',
            contacts: contact.id,
            user: currentUser.id,
            type: 'pdfs',
            pdfs: pdf,
          });
          _activity.single_id = _activity._id;
          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          // Create Notification for interested pdf lead capture
          createNotification(
            'pdf_interesting_capture',
            {
              criteria: 'lead_capture',
              contact,
              pdf: _pdf,
            },
            currentUser
          );

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          await shareContactsToOrganization(currentUser, contact._id).catch(
            (err) =>
              console.log('share contacts to organization err', err.message)
          );

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          sendErrorToSentry(user, err);
          return res.status(500).send({
            status: false,
            error: err.message,
          });
        });
    } else if (image) {
      _contact
        .save()
        .then(async (contact) => {
          const _image = await Image.findOne({ _id: image }).catch((err) => {
            console.log('err', err);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('err', err);
          });

          const _activity = new Activity({
            content: 'INTERESTED',
            contacts: contact.id,
            user: currentUser.id,
            type: 'images',
            images: image,
          });
          _activity.single_id = _activity._id;
          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          // Create Notification for the interested image lead
          createNotification(
            'image_interesting_capture',
            {
              criteria: 'lead_capture',
              contact,
              image: _image,
            },
            currentUser
          );

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          await shareContactsToOrganization(currentUser, contact._id).catch(
            (err) =>
              console.log('share contacts to organization err', err.message)
          );

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    }
  }
};

const resubscribe = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _activity = new Activity({
    user: currentUser.id,
    contacts: contact,
    content: 'resubscribed',
    type: 'emails',
  });
  _activity.single_id = _activity._id;
  const activity = await _activity
    .save()
    .then()
    .catch((err) => {
      console.log('err', err.message);
    });
  Contact.updateOne(
    { _id: contact },
    {
      $set: { last_activity: activity.id, 'unsubscribed.email': false },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const mergeContact = async (req, res) => {
  const { currentUser } = req;
  const { primary_contact, secondary_contact } = req.body;
  const editData = { ...req.body };

  if (!secondary_contact || !primary_contact) {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }

  delete editData.primary_contact;
  delete editData.secondary_contact;

  if (editData.activity_merge) {
    switch (editData.activity_merge) {
      case 'both': {
        Activity.updateMany(
          {
            contacts: secondary_contact,
          },
          {
            $set: { contacts: mongoose.Types.ObjectId(primary_contact) },
          }
        ).catch((err) => {
          console.log('activity update err', err.message);
        });

        VideoTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        PDFTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        ImageTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        EmailTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        // Migration Needed
        Email.updateMany(
          {
            user: currentUser._id,
            contacts: { $elemMatch: { $in: [secondary_contact] } },
          },
          { $addToSet: { contacts: primary_contact } }
        ).then(() => {
          Email.updateMany(
            {
              user: currentUser._id,
              contacts: { $elemMatch: { $in: [secondary_contact] } },
            },
            { $pull: { contacts: secondary_contact } }
          ).then(() => {
            Email.updateMany(
              {
                user: currentUser._id,
                contacts: secondary_contact,
              },
              { $set: { contacts: mongoose.Types.ObjectId(primary_contact) } }
            );
          });
        });

        Text.updateMany(
          {
            user: currentUser._id,
            contacts: { $elemMatch: { $in: [secondary_contact] } },
          },
          { $addToSet: { contacts: primary_contact } }
        ).then(() => {
          Text.updateMany(
            {
              user: currentUser._id,
              contacts: { $elemMatch: { $in: [secondary_contact] } },
            },
            { $pull: { contacts: secondary_contact } }
          ).then(() => {
            Text.updateMany(
              {
                user: currentUser._id,
                contacts: secondary_contact,
              },
              { $set: { contacts: mongoose.Types.ObjectId(primary_contact) } }
            );
          });
        });

        PhoneLog.updateMany(
          {
            contact: { $elemMatch: { $in: [secondary_contact] } },
          },
          { $addToSet: { contact: primary_contact } }
        ).then(() => {
          PhoneLog.updateMany(
            {
              contact: { $elemMatch: { $in: [secondary_contact] } },
            },
            { $pull: { contact: secondary_contact } }
          ).then(() => {
            PhoneLog.updateMany(
              {
                contact: secondary_contact,
              },
              { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
            );
          });
        });

        break;
      }

      case 'primary': {
        Activity.deleteMany({
          contacts: secondary_contact,
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });
        break;
      }

      case 'remove': {
        Activity.deleteMany({
          contacts: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });
        break;
      }
    }
  }

  if (editData.followup_merge) {
    switch (editData.followup_merge) {
      case 'both': {
        FollowUp.updateMany(
          {
            contact: secondary_contact,
          },
          {
            $set: { contact: primary_contact },
          }
        ).catch((err) => {
          console.log('followup update err', err.message);
        });
        break;
      }
      case 'primary': {
        FollowUp.deleteMany({
          contact: secondary_contact,
        }).catch((err) => {
          console.log('followup remove err', err.message);
        });
        break;
      }
      case 'remove': {
        FollowUp.deleteMany({
          contact: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('followup remove err', err.message);
        });
        break;
      }
    }
  }

  if (editData.automation_merge) {
    switch (editData.automation_merge) {
      case 'primary': {
        TimeLine.deleteMany({
          contact: secondary_contact,
        }).catch((err) => {
          console.log('timeline remove err', err.message);
        });
        break;
      }
      case 'remove': {
        TimeLine.deleteMany({
          contact: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('timeline remove err', err.message);
        });
        break;
      }
    }
  }

  if (editData.notes_merge) {
    switch (editData.notes_merge) {
      case 'both': {
        Note.updateMany(
          {
            contact: { $elemMatch: { $in: [secondary_contact] } },
          },
          { $addToSet: { contact: primary_contact } }
        ).then(() => {
          Note.updateMany(
            {
              contact: { $elemMatch: { $in: [secondary_contact] } },
            },
            { $pull: { contact: secondary_contact } }
          ).then(() => {
            Note.updateMany(
              {
                contact: secondary_contact,
              },
              { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
            );
          });
        });
        break;
      }
      case 'remove': {
        Note.updateMany(
          {
            contacts: { $elemMatch: { $in: [primary_contact] } },
          },
          { $pull: { contacts: primary_contact } }
        );
      }
      case 'primary': {
        Note.updateMany(
          {
            contacts: { $elemMatch: { $in: [secondary_contact] } },
          },
          { $pull: { contacts: secondary_contact } }
        );
      }
    }
  }

  Contact.findOneAndUpdate(
    {
      _id: primary_contact,
    },
    {
      $set: editData,
    },
    { new: true }
  )
    .then((data) => {
      Contact.deleteOne({ _id: secondary_contact }).catch((err) => {
        console.log('contact delete err', err.message);
      });

      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('contact update err', err.message);
    });
};

const bulkUpdateDuplicatedContacts = async (contact_array, req, res) => {
  console.log('contact Array', contact_array);
  const { currentUser, guest_loggin, guest } = req;
  const additional_fields = [];
  const additionalFields = await CustomField.find({
    user: currentUser.id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed', ex.message);
  });

  additionalFields.forEach((field) => {
    additional_fields.push(field.name);
  });
  const updates = [];
  const assgin_automation = [];
  const promise_array = contact_array.map((contact) => {
    const promise = new Promise(async (resolve) => {
      try {
        const label = contact.label;
        const cell_phone = contact.cell_phone;
        if (label) {
          contact.label = await LabelHelper.convertLabel(
            currentUser.id,
            label,
            currentUser.source
          );
        } else {
          delete contact.label;
        }
        if (cell_phone) {
          const formattedNumber = phone(cell_phone)?.phoneNumber;
          contact.cell_phone = formattedNumber || cell_phone;
        } else {
          delete contact.cell_phone;
        }
        // additional field working
        if (additional_fields.length > 0) {
          const additionalData = {};
          for (const key in contact) {
            const index = additional_fields.indexOf(key);
            if (index > -1) {
              const field = additionalFields.find((f) => f.name === key);
              if (field.type === 'date') {
                additionalData[key] = new Date(contact[key]);
              } else {
                additionalData[key] = contact[key];
                if (field.type === 'dropdown') {
                  const vIndex = field.options.findIndex(
                    (v) => v.value === contact[key]
                  );
                  if (vIndex === -1) {
                    field.options.push({
                      label: contact[key],
                      value: contact[key],
                    });
                    await CustomField.updateOne(
                      { _id: field.id },
                      { $set: { options: field.options } }
                    ).catch((err) => {
                      console.error('custom field update failed', err.message);
                    });
                  }
                }
              }
              delete contact[key];
            }
          }
          contact['additional_field'] = additionalData;
        }
        if (contact.notes && contact.notes.length > 0) {
          let notes = [];
          try {
            notes = JSON.parse(contact.notes);
          } catch (err) {
            if (contact.notes instanceof Array) {
              notes = contact.notes;
            } else {
              notes = [contact.notes];
            }
          }
          let note_content = 'added note';
          if (guest_loggin) {
            note_content = ActivityHelper.assistantLog(
              note_content,
              guest.name
            );
          }
          for (let i = 0; i < notes.length; i++) {
            const content = notes[i];
            const note = new Note({
              content,
              contact: contact.id,
              user: currentUser.id,
            });

            const _note = await note.save();

            const activity = new Activity({
              content: note_content,
              contacts: contact.id,
              user: currentUser.id,
              type: 'notes',
              notes: _note.id,
            });
            const _activity = await activity.save();

            await Contact.updateOne(
              { _id: contact.id },
              { $set: { last_activity: _activity.id } }
            );
          }
        }

        const setContact = {};
        const unsetContact = {};
        for (const key in contact) {
          // eslint-disable-next-line no-empty
          const shouldNotUpdateFields = [
            'shared_members',
            'declined_users',
            'pending_users',
            'automation_id',
            'unsubscribed',
            'shared_contact',
            'shared_team',
            'shared_all_member',
            'last_activity',
          ];
          if (shouldNotUpdateFields.includes(key)) {
            continue;
          } else if (contact[key] && contact[key] !== 'undefined') {
            setContact[key] = contact[key];
          } else {
            unsetContact[key] = true;
          }
        }

        await Contact.updateOne(
          {
            _id: contact.id,
            user: currentUser.id,
          },
          {
            $set: { ...setContact },
            $unset: { ...unsetContact },
          }
        );
        updates.push(contact.id);
        if (contact['automation_id'] && contact['automation_id'] !== '') {
          const automation_id = contact['automation_id'];
          const index = assgin_automation.findIndex(
            (item) => item['automation'] === automation_id
          );
          if (index >= 0) {
            if (assgin_automation[index]['contacts']) {
              assgin_automation[index]['contacts'].push(contact.id);
            } else {
              assgin_automation[index]['contacts'] = [contact.id];
            }
          } else {
            assgin_automation.push({
              automation: automation_id,
              contacts: [contact._id],
            });
          }
        }
      } catch (e) {
        console.log(e);
      }
      resolve();
    });
    return promise;
  });

  Promise.all(promise_array)
    .then(async (_) => {
      if (assgin_automation.length > 0) {
        for (const groupItem of assgin_automation) {
          const automation_id = groupItem.automation;
          const inputContacts = groupItem.contacts;
          const inputDeals = groupItem.deals;
          createTimelines({
            currentUser,
            body: { automation_id, contacts: inputContacts, deals: inputDeals },
          });
        }
      }
      return res.send({
        status: true,
        updates,
      });
    })
    .catch((err) => {
      console.log('bulk update duplicated contacts error', err);
      return res.send({
        status: false,
      });
    });
};

const updateContact = async (req, res) => {
  const { label, cell_phone } = req.body;
  const { currentUser, guest_loggin, guest } = req;

  const additional_fields = [];
  const additionalFields = await CustomField.find({
    user: currentUser.id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed', ex.message);
  });

  additionalFields.forEach((field) => {
    additional_fields.push(field.name);
  });

  if (label) {
    req.body.label = await LabelHelper.convertLabel(
      currentUser.id,
      label,
      currentUser.source
    );
  } else {
    delete req.body.label;
  }

  if (req.body.cell_phone) {
    const formattedNumber = phone(req.body.cell_phone)?.phoneNumber;
    req.body.cell_phone = formattedNumber || req.body.cell_phone;
  } else {
    delete req.body.cell_phone;
  }

  // additional field working
  if (additional_fields.length > 0) {
    const additionalData = {};
    for (const key in req.body) {
      const index = additional_fields.indexOf(key);
      if (index > -1) {
        const field = additionalFields.find((f) => f.name === key);
        if (field.type === 'date') {
          additionalData[key] = new Date(req.body[key]);
        } else {
          additionalData[key] = req.body[key];
          if (field.type === 'dropdown') {
            const vIndex = field.options.findIndex(
              (v) => v.value === req.body[key]
            );
            if (vIndex === -1) {
              field.options.push({
                label: req.body[key],
                value: req.body[key],
              });
              await CustomField.updateOne(
                { _id: field.id },
                { $set: { options: field.options } }
              ).catch((err) => {
                console.error('custom field update failed', err.message);
              });
            }
          }
        }
        delete req.body[key];
      }
    }
    req.body['additional_field'] = additionalData;
  }

  if (req.body.notes && req.body.notes.length > 0) {
    let notes = [];
    try {
      notes = JSON.parse(req.body.notes);
    } catch (err) {
      if (req.body.notes instanceof Array) {
        notes = req.body.notes;
      } else {
        notes = [req.body.notes];
      }
    }
    let note_content = 'added note';
    if (guest_loggin) {
      note_content = ActivityHelper.assistantLog(note_content, guest.name);
    }
    for (let i = 0; i < notes.length; i++) {
      const content = notes[i];
      const note = new Note({
        content,
        contact: req.body.id,
        user: currentUser.id,
      });

      note.save().then((_note) => {
        const _activity = new Activity({
          content: note_content,
          contacts: req.body.id,
          user: currentUser.id,
          type: 'notes',
          notes: _note.id,
        });

        _activity
          .save()
          .then((__activity) => {
            Contact.updateOne(
              { _id: req.body.id },
              { $set: { last_activity: __activity.id } }
            ).catch((err) => {
              console.log('err', err);
            });
          })
          .catch((err) => {
            console.log('error', err);
          });
      });
    }
  }

  const old_contact = await Contact.findOne({ _id: req.body.id }).catch(
    (err) => {
      console.log(err.message);
    }
  );

  if (old_contact.label && old_contact.label.toString() !== req.body.label) {
    triggerAutomation({
      user: currentUser,
      contacts: [req.body.id],
      trigger: {
        type: 'contact_status_updated',
        detail: {
          status: req.body.label,
        },
      },
    });
  }
  const added_tags = [];
  req.body.tags?.forEach((tag) => {
    const idx = old_contact.tags?.findIndex(
      (e) => e.toString() === tag.toString()
    );
    if (idx < 0) {
      added_tags.push(tag);
    }
  });
  if (added_tags.length) {
    triggerAutomation({
      user: currentUser,
      contacts: [req.body.id],
      trigger: {
        type: 'contact_tags_added',
        detail: {
          tags: added_tags,
        },
      },
    });
  }

  Contact.updateOne(
    {
      _id: req.body.id,
      user: currentUser.id,
    },
    {
      $set: {
        ...req.body,
      },
    }
  )
    .then(async () => {
      if (req.body.automation_id && req.body.automation_id !== '') {
        const automation_id = req.body.automation_id;
        createTimelines({
          currentUser,
          body: { automation_id, contacts: [req.body.id] },
        });
      }

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('contact update err', err.message);
      return res.send({
        status: false,
        error: 'Internal server error',
      });
    });
};

const shareContacts = async (req, res) => {
  const { currentUser, mode: apiMode } = req;
  const { contacts, type, mode } = req.body;
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  const promise_array = [];
  const userIds = req.body.user;
  const notificationUsers = [];
  let act = '';
  let action = '';

  const shareTeam = await Team.findOne({ _id: req.body.team }).catch((err) => {
    console.log('team not found', err.message);
    throw Error('team found error');
  });

  if (!shareTeam) {
    return res.status(400).json({
      status: false,
      error: 'team not found',
    });
  }
  if (type !== 2) {
    const userId = userIds[0];
    if (userId !== currentUser.id) {
      for (let i = 0; i < contacts.length; i++) {
        const promise = await generateCloneAndTransferContactPromise({
          currentUser,
          contactId: contacts[i],
          userId,
          type,
          mode,
          runByAutomation: apiMode === 'automation',
          isInternal: shareTeam.is_internal,
        });
        promise_array.push(promise);
      }
      if (type === 1) {
        act = 'transferred';
        action = 'transferring';
      } else {
        act = 'cloned';
        action = 'cloning';
      }
      await User.find({ _id: { $in: userIds } }).then((users) => {
        notificationUsers.push(...users);
      });
    }
  } else {
    act = 'shared';
    action = 'sharing';

    if (mode == 'round_robin') {
      const cursor = shareTeam.cursor + '';
      if (shareTeam.members.length) {
        await User.find({ _id: { $in: shareTeam.members } }).then(
          async (users) => {
            if (users.length > 1) {
              users.sort((a, b) =>
                a.user_name.toLowerCase() > b.user_name.toLowerCase() ? 1 : -1
              );
            }
            notificationUsers.push(...users);
            const userIds = users.map((e) => e._id + '');
            let startIndex = 0;
            if (cursor) {
              const lastIndex = userIds.indexOf(cursor);
              if (lastIndex >= userIds.length - 1) startIndex = 0;
              else startIndex = lastIndex + 1;
            } else {
              startIndex = 0;
            }
            let lastUserId;
            for (let i = 0; i < contacts.length; i++) {
              const newIndex = (startIndex + i) % userIds.length;
              const userId = userIds[newIndex];
              const user = users[newIndex];
              lastUserId = userId;
              const promise = generateSharePromise({
                currentUser,
                contactId: contacts[i],
                users: [user],
                type,
                mode,
                team: req.body.team,
                shareTeam,
                runByAutomation: apiMode === 'automation',
              });
              promise_array.push(promise);
            }
            await Team.updateOne(
              { _id: req.body.team },
              { $set: { cursor: lastUserId, last_rounded_at: new Date() } }
            ).catch((err) => {
              console.log('err', err.message);
            });
          }
        );
      }
    } else {
      const users = await User.find({
        _id: { $in: _.filter(userIds, (userId) => userId !== currentUser.id) },
      }).catch((err) => {
        console.log('user find err', err.message);
        return [];
      });
      const targetUsers = _.compact(users);
      notificationUsers.push(...targetUsers);
      if (targetUsers.length > 0) {
        for (let i = 0; i < contacts.length; i++) {
          const promise = generateSharePromise({
            currentUser,
            contactId: contacts[i],
            users: targetUsers,
            type,
            mode,
            team: req.body.team,
            shareTeam,
            runByAutomation: apiMode === 'automation',
          });
          promise_array.push(promise);
        }
      }
    }
  }

  Promise.all(promise_array)
    .then((_result) => {
      const data = [];
      const error = [];
      _result.forEach(async (e) => {
        if (!e) {
          return;
        }
        if (e.status) {
          data.push(e.data.contact);
        } else {
          error.push(e.data);
        }
      });
      if (data.length) {
        let contactListHTML = '';
        for (let i = 0; i < data.length; i++) {
          const contact = data[i];
          const no = i + 1;
          let style = '';
          if (i === data.length - 1) {
            style = 'border-bottom: 1px solid #aaaaaa;';
          }
          contactListHTML += '<tr>';
          contactListHTML +=
            '<td style="text-align:center; ' + style + '">' + no + '</td>';
          let contact_name = '';
          if (contact.first_name && contact.last_name) {
            contact_name = contact.first_name + ' ' + contact.last_name;
          } else if (contact.first_name) {
            contact_name = contact.first_name;
          } else if (contact.last_name) {
            contact_name = contact.last_name;
          } else {
            contact_name = 'Unnamed Contact';
          }
          const email = contact.email || ' ';
          const cell_phone = contact.cell_phone || ' ';
          contactListHTML +=
            '<td style="' +
            style +
            '"><a href="' +
            urls.DOMAIN_ORIGIN +
            '/contacts/' +
            contact._id +
            '", target="_blank">' +
            contact_name +
            '</a></td>';
          contactListHTML += '<td style="' + style + '">' + email + '</td>';
          contactListHTML +=
            '<td style="border-right: 1px solid #aaaaaa;' +
            style +
            '">' +
            cell_phone +
            '</td>';
          contactListHTML += '</tr>';
        }
        for (let i = 0; i < notificationUsers.length; i++) {
          const user = notificationUsers[i];
          const data = {
            template_data: {
              user_name: user.user_name,
              team_member_name: currentUser.user_name,
              team_name: shareTeam.name,
              contact_list: contactListHTML,
              act,
              action,
            },
            template_name: prefix + 'ShareContactInCommunity',
            required_reply: false,
            email: user.email,
          };
          sendNotificationEmail(data);
        }
      }
      return res.send({
        status: true,
        data,
        error,
      });
    })
    .catch((err) => {
      console.log('contact share err', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const stopShare = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const promise_array = [];
  const data = [];
  const error = [];

  const user = await User.findOne({
    _id: req.body.user,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  for (let i = 0; i < contacts.length; i++) {
    const promise = new Promise(async (resolve, reject) => {
      const contact = await Contact.findOne({
        _id: contacts[i],
        user: currentUser.id,
      })
        .populate([
          { path: 'last_activity' },
          {
            path: 'shared_members',
            select: {
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          },
          {
            path: 'user',
            select: {
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          },
        ])
        .catch((err) => {
          console.log('contact find err', err.message);
        });

      if (!contact) {
        const _contact = await Contact.findOne({
          _id: contacts[i],
        }).catch((err) => {
          console.log('contact find err', err.message);
        });
        error.push({
          contact: {
            _id: contacts[i],
            first_name: _contact.first_name,
            email: _contact.email,
          },
          error: 'Invalid permission',
        });

        resolve();
      }

      const activity_content = 'stopped sharing contact';
      const activity = new Activity({
        user: currentUser.id,
        contacts: contacts[i],
        content: activity_content,
        users: req.body.user,
        type: 'users',
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      let query;
      if (contact.shared_all_member === true) {
        query = {
          $unset: {
            shared_team: true,
            shared_members: true,
            shared_all_member: true,
            type: true,
            pending_users: true,
          },
        };
      } else {
        if (contact.shared_members && contact.shared_members.length > 1) {
          query = {
            $pull: {
              shared_members: req.body.user,
              pending_users: req.body.user,
            },
          };
        } else {
          query = {
            $unset: {
              shared_team: true,
              shared_members: true,
              shared_all_member: true,
              type: true,
              pending_users: true,
            },
          };
        }
      }

      Contact.updateOne(
        {
          _id: contacts[i],
        },
        {
          ...query,
        }
      )
        .then(() => {
          const myJSON = JSON.stringify(contact);
          const _contact = JSON.parse(myJSON);
          _contact.shared_members.push({
            user_name: user.user_name,
            picture_profile: user.picture_profile,
            email: user.email,
            cell_phone: user.cell_phone,
            _id: user._id,
          });
          data.push(_contact);
          resolve();
        })
        .catch((err) => {
          console.log('contact update err', err.message);
        });
    });
    promise_array.push(promise);
  }

  Promise.all(promise_array)
    .then(() => {
      if (data.length) {
        const stoppedContact = data.map((e) => e._id);
        const notification = new Notification({
          creator: currentUser._id,
          user: req.body.user,
          criteria: 'stop_share_contact',
          contact: stoppedContact,
          team: req.body?.team ?? '',
          content: `${currentUser.user_name} has stop the contact sharing in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
      if (error.length > 0) {
        return res.status(405).json({
          status: false,
          error,
        });
      }
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('contact share err', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const loadByEmails = (req, res) => {
  const { currentUser } = req;
  const { emails } = req.body;
  Contact.find({
    email: { $in: emails },
    user: currentUser._id,
  })
    .select({ _id: 1, first_name: 1, last_name: 1, email: 1, cell_phone: 1 })
    .then((_contacts) => {
      return res.send({
        status: true,
        data: _contacts,
      });
    })
    .catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err,
      });
    });
};

const loadGroupActivities = async (req, res) => {
  const { currentUser } = req;
  const contact = req.params.id;
  const { from, limit, type } = req.body;
  const data = await getLoadGroupActivity(
    currentUser._id,
    contact,
    from,
    limit,
    type
  );
  return res.send({
    status: true,
    ...data,
  });
};

/**
 * Get contact's  action data  with type and limit (exception activity type),
 * after (FE: load the individual main data tab in contact detail page)
 * @param {*} type
 * @param {*} limit
 * @param {*} skip
 * @param {*} after
 * @param {*} sortQuery
 * @returns: Promise
 */

const getContactActionContentList = async (req, res) => {
  const contact = req.params.id;
  const { currentUser } = req;
  const {
    type,
    limit,
    after,
    skip = 0,
    sortQuery,
    parentFollowUps,
    status = -1,
  } = req.body;
  try {
    const data = await ContactHelper.getContactDetailData(
      currentUser._id,
      contact,
      type,
      limit,
      after,
      skip,
      sortQuery,
      parentFollowUps,
      status
    );

    return res.send({
      status: true,
      data,
    });
  } catch (error) {
    console.log('error', error);
  }
};

/**
 * Get total count for contact's  action data  with type (exception activity type),
 * @param {*} type
 * @returns: Promise
 */

const getTotalCountContactAction = async (req, res) => {
  const contact = req.params.id;
  const { currentUser } = req;
  const { type, status = -1 } = req.body;
  try {
    const data = await ContactHelper.getTotalCountContactAction(
      currentUser._id,
      contact,
      type,
      status
    );

    return res.send({
      status: true,
      data,
    });
  } catch (error) {
    console.log('error', error);
  }
};

/**
 * Get contact's  activity  detail value
 * @param {*} type
 * @param {*} id
 * @returns: Promise
 */

const getContactActivityDetail = async (req, res) => {
  const { type, id } = req.body;
  const contactId = req.params.id;
  try {
    const data = await ContactHelper.getActivityDetails(contactId, type, id);
    return res.send({
      status: true,
      data,
    });
  } catch (error) {
    console.log('error', error);
  }
};

const getActivities = async (req, res) => {
  const { currentUser } = req;
  const { count } = req.body;

  const textSelectPath = {
    user: 1,
    deal: 1,
    phone: 1,
    content: 1,
    from: 1,
    type: 1,
    status: 1,
    has_shared: 1,
    shared_text: 1,
    video_tracker: 1,
    pdf_tracker: 1,
    image_tracker: 1,
    service_type: 1,
    created_at: 1,
    updated_at: 1,
  };

  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  }

  const contactId = req.params.id;

  textSelectPath['send_status.' + contactId] = 1;

  const _contact = await Contact.findOne({
    _id: contactId,
    $or: [
      { user: currentUser._id },
      { shared_members: currentUser._id },
      { pending_users: currentUser._id },
    ],
  }).catch((err) => {
    console.log('contact found err', err.message);
  });

  if (_contact) {
    // Contact Activity List
    let _activity_list;
    if (count) {
      _activity_list = await Activity.find({
        contacts: req.params.id,
        status: { $ne: 'pending' },
      })
        .sort({ updated_at: -1 })
        .limit(count)
        .populate([
          {
            path: 'video_trackers',
            select: '-_id -user -contact',
            model: VideoTracker,
          },
          {
            path: 'image_trackers',
            select: '-_id -user -contact',
            model: ImageTracker,
          },
          {
            path: 'pdf_trackers',
            select: '-_id -user -contact',
            model: PDFTracker,
          },
          { path: 'email_trackers', select: '-_id -user -contact' },
          { path: 'user', select: '_id user_name email picture_profile' },
          { path: 'team', select: '_id name picture members is_internal' },
          {
            path: 'assigned_id',
            select: '_id user_name connected_email email cell_phone',
          },
        ]);
    } else {
      _activity_list = await Activity.find({
        contacts: req.params.id,
        status: { $ne: 'pending' },
      })
        .sort({ updated_at: 1 })
        .populate([
          {
            path: 'video_trackers',
            select: '-_id -user -contact',
            model: VideoTracker,
          },
          {
            path: 'image_trackers',
            select: '-_id -user -contact',
            model: ImageTracker,
          },
          {
            path: 'pdf_trackers',
            select: '-_id -user -contact',
            model: PDFTracker,
          },
          { path: 'email_trackers', select: '-_id -user -contact' },
          { path: 'user', select: '_id user_name email picture_profile' },
          { path: 'team', select: '_id name picture members is_internal' },
          {
            path: 'assigned_id',
            select: '_id user_name connected_email email cell_phone',
          },
        ]);
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
    let deals = [];
    let users = [];
    let phone_logs = [];
    const userIds = [];
    const emailIds = [];
    const textIds = [];
    let automations = [];
    const automationIds = [];

    _activity_list.forEach((e) => {
      if (e['type'] === 'videos') {
        if (e['videos'] instanceof Array) {
          Array.prototype.push.apply(videoIds, e['videos']);
        } else {
          videoIds.push(e['videos']);
        }
      }
      if (e['type'] === 'images') {
        if (e['images'] instanceof Array) {
          Array.prototype.push.apply(imageIds, e['images']);
        } else {
          imageIds.push(e['images']);
        }
      }
      if (e['type'] === 'pdfs') {
        if (e['pdfs'] instanceof Array) {
          Array.prototype.push.apply(pdfIds, e['pdfs']);
        } else {
          pdfIds.push(e['pdfs']);
        }
      }
      if (e['type'] === 'users') {
        let detail_id = e['users'];
        if (detail_id instanceof Array) {
          detail_id = detail_id[0];
        }
        if (detail_id + '' === currentUser._id + '') {
          userIds.push(_contact.user);
        } else {
          userIds.push(detail_id);
        }
      }
      if (e['type'] === 'emails') {
        emailIds.push(e['emails']);
      }
      if (e['type'] === 'texts') {
        textIds.push(e['texts']);
      }
      if (e['type'] === 'automations') {
        if (e['automations']) {
          automationIds.push(e['automations']);
        }
      }
    });
    const videos = await Video.find({ _id: { $in: videoIds } });
    const pdfs = await PDF.find({ _id: { $in: pdfIds } });
    const images = await Image.find({ _id: { $in: imageIds } });
    Array.prototype.push.apply(materials, videos);
    Array.prototype.push.apply(materials, pdfs);
    Array.prototype.push.apply(materials, images);

    if (count) {
      const loadedIds = [];
      const noteIds = [];
      const emailIds = [];
      const textIds = [];
      const apptIds = [];
      const taskIds = [];
      const dealIds = [];
      const userIds = [];
      const phoneLogIds = [];

      for (let i = 0; i < _activity_list.length; i++) {
        if (
          [
            'notes',
            'emails',
            'texts',
            'appointments',
            'follow_ups',
            'deals',
            'users',
            'phone_logs',
            'automations',
          ].indexOf(_activity_list[i].type) !== -1
        ) {
          let detail_id = _activity_list[i][_activity_list[i].type];
          if (detail_id instanceof Array) {
            detail_id = detail_id[0];
          }
          if (loadedIds.indexOf(detail_id) === -1) {
            switch (_activity_list[i].type) {
              case 'notes':
                noteIds.push(detail_id);
                break;
              case 'emails':
                emailIds.push(detail_id);
                break;
              case 'texts':
                textIds.push(detail_id);
                break;
              case 'appointments':
                apptIds.push(detail_id);
                break;
              case 'follow_ups':
                taskIds.push(detail_id);
                break;
              case 'deals':
                if (_activity_list[i].content != 'removed deal') {
                  dealIds.push(detail_id);
                }
                break;
              case 'users':
                if (detail_id + '' === currentUser._id + '') {
                  userIds.push(_contact.user);
                } else {
                  userIds.push(detail_id);
                }
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
      notes = await Note.find({ _id: { $in: noteIds } }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      emails = await Email.find({ _id: { $in: emailIds } }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      texts = await Text.find({ _id: { $in: textIds } })
        .select(textSelectPath)
        .populate([
          { path: 'user', select: '_id user_name email picture_profile' },
        ]);
      appointments = await Appointment.find({ _id: { $in: apptIds } }).populate(
        [{ path: 'user', select: '_id user_name email picture_profile' }]
      );
      tasks = await FollowUp.find({
        due_date: { $exists: true },
        $or: [
          { _id: { $in: taskIds } },
          { parent_follow_up: { $in: taskIds, $exists: true } },
        ],
      }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      deals = await Deal.find({ _id: { $in: dealIds } }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      users = await User.find({ _id: { $in: userIds } }).select(
        '_id user_name email cell_phone picture_profile'
      );
      phone_logs = await PhoneLog.find({ _id: { $in: phoneLogIds } });
      automations = await Automation.find({ _id: { $in: automationIds } });
    } else {
      notes = await Note.find({ contact: contactId }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      emails = await Email.find({
        $or: [{ contacts: contactId }, { _id: { $in: emailIds } }],
      }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      texts = await Text.find({
        $or: [{ contacts: contactId }, { _id: { $in: textIds } }],
      })
        .select(textSelectPath)
        .populate([
          { path: 'user', select: '_id user_name email picture_profile' },
        ]);
      appointments = await Appointment.find({ contacts: contactId }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      tasks = await FollowUp.find({
        contact: contactId,
        due_date: { $exists: true },
      }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      deals = await Deal.find({ contacts: contactId }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
      users = await User.find({
        _id: { $in: userIds },
      }).select('_id user_name email cell_phone picture_profile');
      phone_logs = await PhoneLog.find({ contact: contactId });
      automations = await Automation.find({
        _id: { $in: automationIds },
      }).populate([
        { path: 'user', select: '_id user_name email picture_profile' },
      ]);
    }

    return res.send({
      status: true,
      data: {
        activity: _activity_list,
        details: {
          materials,
          notes,
          emails,
          texts,
          appointments,
          tasks,
          deals,
          users,
          phone_logs,
          automations,
        },
      },
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }
};

const loadNotes = (req, res) => {
  const { currentUser } = req;
  const contactId = req.params.id;

  Note.find({ contact: contactId })
    .then((notes) => {
      return res.send({
        status: true,
        data: notes,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const getTimeline = async (req, res) => {
  const { currentUser } = req;
  const { automationId } = req.body;

  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  }

  const contactId = req.params.id;

  const _contact = await Contact.findOne({
    _id: contactId,
  }).catch((err) => {
    console.log('contact found err', err.message);
  });

  if (_contact) {
    // Contact Running AutomationLines
    const contact_automation_lines = [];
    const c_automation_lines = await AutomationLine.find({
      contact: req.params.id,
      type: { $ne: 'deal' },
      automation: automationId || { $ne: null },
      status: 'running',
    }).select({ _id: 1, title: 1, action_count: 1, status: 1, type: 1 });

    for (const automation_line of c_automation_lines) {
      // Contact TimeLines
      const _contact_timelines = await TimeLine.find({
        automation_line: automation_line?._id,
      })
        .sort({ due_date: 1 })
        .catch((err) => {
          console.log('err', err);
        });
      if (_contact_timelines && _contact_timelines.length > 0) {
        const automation_line_object = {
          _id: automation_line?._id,
          title: automation_line?.title,
          action_count: automation_line?.action_count,
          status: automation_line?.status,
          type: automation_line?.type,
          timelines: _contact_timelines,
        };
        contact_automation_lines.push(automation_line_object);
      }
    }

    // Deal TimeLines
    const _deal_timelines = [];
    const _deals = await Deal.find({
      contacts: req.params.id,
    }).select({ _id: 1, title: 1 });

    if (_deals && _deals.length > 0) {
      for (const _deal of _deals) {
        const _deal_automation_lines = await AutomationLine.find({
          deal: _deal._id,
          type: { $ne: 'contact' },
          status: 'running',
          automation: automationId || { $ne: null },
        }).select({ _id: 1, title: 1, action_count: 1, status: 1, type: 1 });
        for (const _deal_automation_line of _deal_automation_lines) {
          const deal_timelines = await TimeLine.find({
            automation_line: _deal_automation_line?._id,
            type: 'deal',
            visible: true,
            assigned_contacts: req.params.id,
            $and: [
              { action: { $ne: null } },
              { 'action.type': { $ne: 'automation' } },
            ],
          });
          if (deal_timelines && deal_timelines.length > 0) {
            const automation_line_object = {
              _id: _deal_automation_line?._id,
              title: _deal_automation_line?.title,
              action_count: _deal_automation_line?.action_count,
              status: _deal_automation_line?.status,
              type: _deal_automation_line?.type,
              timelines: deal_timelines,
              deal: _deal._id,
              dealTitle: _deal.title,
            };
            _deal_timelines.push(automation_line_object);
          }
        }
      }
    }
    return res.send({
      status: true,
      data: {
        contact_automation_lines,
        deal_automation_lines: _deal_timelines,
      },
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }
};
const getTasks = (req, res) => {
  const { currentUser } = req;
  const contactId = req.params.id;

  const campaign_promise = new Promise((resolve, reject) => {
    CampaignJob.find({
      user: currentUser._id,
      status: 'active',
      contacts: contactId,
    })
      .populate({
        path: 'campaign',
        select: {
          _id: true,
          title: true,
          subject: true,
          content: true,
          newsletter: true,
        },
      })
      .then((data) => {
        resolve({ campaigns: data });
      })
      .catch((err) => {
        reject(err);
      });
  });
  const task_promise = new Promise((resolve, reject) => {
    Task.find({
      user: currentUser._id,
      status: { $in: ['active', 'draft'] },
      contacts: contactId,
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

  Promise.all([campaign_promise, task_promise])
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

/**
 * Remove contact from task
 * @param {*} req : body is json => { contact: contactId, task: taskId | campaignId, type: 'task' | 'campaign'}
 * @param {*} res
 */
const removeFromTask = async (req, res) => {
  const { currentUser } = req;
  const { contact, task, type } = req.body;

  if (type === 'campaign') {
    // pull the contact from campaign job and campaign
    const campaignJob = await CampaignJob.findOne({
      user: currentUser._id,
      _id: task,
      status: 'active',
    }).catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err,
      });
    });
    if (!campaignJob) {
      return res.status(400).send({
        status: false,
        error: 'not_found',
      });
    }
    const campaign = await Campaign.findOne({
      user: currentUser._id,
      _id: campaignJob.campaign,
    }).catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err,
      });
    });
    const pos = (campaignJob.contacts || []).findIndex(
      (e) => e + '' === contact
    );
    console.log('campaign job', campaignJob);
    if (pos !== -1) {
      if (campaignJob.contacts.length === 1) {
        CampaignJob.deleteOne({
          user: currentUser._id,
          _id: task,
        }).catch((err) => {});
      } else {
        campaignJob.contacts.splice(pos, 1);
        campaignJob.save();
      }
    }
    if (campaign) {
      const campaignPos = (campaign.contacts || []).findIndex(
        (e) => e + '' === contact
      );
      if (campaignPos !== -1) {
        if (campaign.contacts.length === 1) {
          Campaign.deleteOne({
            user: currentUser._id,
            _id: campaignJob.campaign,
          });
          CampaignJob.deleteMany({ user: currentUser._id });
        } else {
          campaign.contacts.splice(campaignPos, 1);
          campaign.save();
        }
      }
    }
  } else if (type === 'task') {
    const taskDoc = await Task.findOne({
      user: currentUser._id,
      _id: task,
      status: 'active',
    }).catch((err) => {
      sendErrorToSentry(currentUser, err);
      return res.status(500).send({
        status: false,
        error: err,
      });
    });
    if (!taskDoc) {
      return res.status(400).send({
        status: false,
        error: 'not_found',
      });
    }
    const pos = (taskDoc.contacts || []).findIndex((e) => e + '' === contact);
    if (pos !== -1) {
      if (taskDoc.contacts.length === 1) {
        Task.deleteOne({ user: currentUser._id, _id: task }).catch((err) => {});
      } else {
        taskDoc.contacts.splice(pos, 1);
        taskDoc.save();
      }
    }
  }
  return res.send({
    status: true,
    data: true,
  });
};

function getConflictContactQuery(fields) {
  const query = [];
  fields.forEach((field) => {
    const cond1 = {};
    const cond2 = {};
    cond1[`additional_field.${field}`] = { $ne: null };
    cond2[`additional_field.${field}`] = { $ne: '' };
    fields.forEach((field1) => {
      if (field !== field1) {
        const cond3 = {};
        const cond4 = {};
        cond3[`additional_field.${field1}`] = { $ne: null };
        cond4[`additional_field.${field1}`] = { $ne: '' };
        query.push({ $and: [cond1, cond2, cond3, cond4] });
      }
    });
  });

  return query;
}

const mergeAdditionalFields = async (req, res) => {
  try {
    const { currentUser } = req;
    const { mergeFields, mergeToField } = req.body;

    const sub_query = mergeFields
      .map((field) => {
        const exist = {};
        exist[`additional_field.${field}`] = { $exists: true };
        return exist;
      })
      .concat(); // sub query to get contacts need to be merged
    const sub_query_conflict = getConflictContactQuery([
      ...mergeFields,
      mergeToField,
    ]); // sub query to get conflict contacts

    const query = {
      user: currentUser.id,
      $or: sub_query,
    };
    const query_conflict = {
      user: currentUser.id,
      $or: sub_query_conflict,
    };

    const contacts = await Contact.find(query);
    const conflict_contacts = await Contact.find(query_conflict);
    const ids = conflict_contacts.map((contact) => contact._id + '');

    if (contacts && contacts.length) {
      for (const contact of contacts) {
        const index = ids.indexOf(contact._id + '');
        if (index === -1) {
          const set = {};
          const unset = [];

          let value = '';
          mergeFields.forEach((field) => {
            value = value || contact['additional_field'][field];
            if (field !== mergeToField) {
              unset.push(`additional_field.${field}`);
            }
          });
          set[`additional_field.${mergeToField}`] = value;
          const update = [{ $set: set }, { $unset: unset }];
          await Contact.updateOne({ _id: contact._id }, update);
        }
      }
    }
    return res.send({
      status: true,
      ids,
    });
  } catch (e) {
    console.log(e);
    return res.send({ status: false, error: e });
  }
};

const loadAdditionalFieldsConflictContactsPagination = async (req, res) => {
  try {
    const { currentUser } = req;
    const { ids } = req.body;

    const query = {
      user: currentUser.id,
      _id: { $in: ids },
    };
    const contacts = await Contact.find(query);

    if (contacts && contacts.length) {
      return res.send({
        status: true,
        contacts,
      });
    }
    return res.send({
      status: true,
      contacts: [],
    });
  } catch (e) {
    return res.send({ status: true, contacts: [] });
  }
};

const groupByFields = (req, res) => {
  const { currentUser } = req;
  const options = req.body;
  ContactHelper.groupByFields(currentUser, options).then((result) => {
    return res.send({
      status: true,
      data: result,
    });
  });
};

const groupByActivities = (req, res) => {
  const { currentUser } = req;
  const { options, range } = req.body;
  ContactHelper.groupByActivities(currentUser, options, range).then(
    (result) => {
      return res.send({
        status: true,
        data: result,
      });
    }
  );
};

const groupByRates = async (req, res) => {
  const { currentUser } = req;
  Contact.aggregate([
    { $match: { user: currentUser._id } },
    {
      $group: { _id: '$rate', count: { $sum: 1 } },
    },
  ])
    .then((data) => {
      return res.send({
        status: true,
        data,
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

const calculateRates = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('user setting loading is failed.', err.message);
    }
  );
  if (contacts && contacts.length === 1) {
    Contact.findOne({ _id: { $in: contacts } }).then((data) => {
      ContactHelper.giveRate(garbage, data).then(() => {
        return res.send({
          status: true,
        });
      });
    });
  } else {
    await ContactHelper.giveRateContacts(garbage, []);
    return res.send({
      status: true,
    });
  }
};

const unlockRate = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('user setting loading is failed.', err.message);
    }
  );
  await Contact.updateMany(
    { _id: { $in: contacts } },
    { $set: { rate_lock: false } }
  ).catch((err) => {
    console.log('Unlocked the contacts', err.message);
  });
  if (contacts && contacts.length === 1) {
    Contact.findOne({ _id: { $in: contacts } })
      .then((data) => {
        ContactHelper.giveRate(garbage, data)
          .then((rate) => {
            return res.send({
              status: true,
              data: rate,
            });
          })
          .catch((err) => {
            console.log('contact rating is failed', err);
          });
      })
      .catch((err) => {
        console.log('contact not found', err.message);
      });
  } else {
    await ContactHelper.giveRateContacts(garbage, contacts);
    return res.send({
      status: true,
    });
  }
};

const getSharePendingContacts = async (req, res) => {
  const { currentUser } = req;
  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }
  let query;
  const userId = mongoose.Types.ObjectId(currentUser.id);
  const teamList = await Team.find({ members: userId }).select({ _id: 1 });
  const teamListIds = teamList.map((e) => e._id);
  if (teamList.length) {
    query = {
      $or: [
        {
          shared_members: { $ne: userId },
          declined_users: { $ne: userId },
          shared_team: { $in: teamListIds },
          shared_all_member: true,
        },
        { pending_users: userId, type: 'share' },
      ],
    };
  } else {
    query = { pending_users: userId, type: 'share' };
  }
  const total = await Contact.countDocuments(query);
  const skip = parseInt(req.params.skip || '0');
  let contacts;
  const userProject = {
    user_name: 1,
    nick_name: 1,
    email: 1,
    cell_phone: 1,
    phone: 1,
    picture_profile: 1,
  };
  await Contact.aggregate([
    {
      $match: query,
    },
    {
      $sort: { [field]: dir },
    },
    {
      $skip: skip,
    },
    {
      $limit: count,
    },
    {
      $lookup: {
        from: 'activities',
        localField: 'last_activity',
        foreignField: '_id',
        as: 'last_activity',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'shared_members',
        foreignField: '_id',
        as: 'shared_members',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { ownerId: '$owner' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$ownerId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'owner',
      },
    },
  ])
    .collation({ locale: 'en' })
    .allowDiskUse(true)
    .exec((err, data) => {
      contacts = data;
      if (!contacts) {
        return res.status(200).json({
          status: true,
          data: {
            contacts: [],
            count: 0,
          },
        });
      }
      return res.send({
        status: true,
        data: {
          contacts,
          count: total,
        },
      });
    });
};

const getSharedContacts = async (req, res) => {
  const { currentUser } = req;
  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  const total = await Contact.countDocuments({
    shared_members: currentUser.id,
  });

  const skip = parseInt(req.params.skip || '0');
  const userId = mongoose.Types.ObjectId(currentUser.id);
  let contacts;
  const userProject = {
    user_name: 1,
    nick_name: 1,
    email: 1,
    cell_phone: 1,
    phone: 1,
    picture_profile: 1,
  };
  await Contact.aggregate([
    {
      $match: { shared_members: userId },
    },
    {
      $sort: { [field]: dir },
    },
    {
      $skip: skip,
    },
    {
      $limit: count,
    },
    {
      $lookup: {
        from: 'activities',
        localField: 'last_activity',
        foreignField: '_id',
        as: 'last_activity',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userId: '$user' },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$userId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'user',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'shared_members',
        foreignField: '_id',
        as: 'shared_members',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { ownerId: '$owner' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$ownerId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'owner',
      },
    },
  ])
    .collation({ locale: 'en' })
    .allowDiskUse(true)
    .exec((err, data) => {
      contacts = data;
      if (!contacts) {
        return res.status(400).json({
          status: false,
          error: 'Contacts doesn`t exist',
        });
      }
      return res.send({
        status: true,
        data: {
          contacts,
          count: total,
        },
      });
    });
};

const getPendingContactsCount = async (req, res) => {
  const { currentUser } = req;
  // move-pending
  const totalPendingContacts = await Contact.countDocuments({
    pending_users: currentUser._id,
    type: { $in: ['transfer', 'clone'] },
  });

  // shared-pending
  let queryForSharePendingContacts;
  const userId = mongoose.Types.ObjectId(currentUser.id);
  const teamList = await Team.find({ members: userId }).select({ _id: 1 });
  const teamListIds = teamList.map((e) => e._id);
  if (teamList.length) {
    queryForSharePendingContacts = {
      $or: [
        {
          shared_members: { $ne: userId },
          declined_users: { $ne: userId },
          shared_team: { $in: teamListIds },
          shared_all_member: true,
        },
        { pending_users: userId },
      ],
    };
  } else {
    queryForSharePendingContacts = { pending_users: userId };
  }
  const totalSharePendingContacts = await Contact.countDocuments(
    queryForSharePendingContacts
  );

  return res.send({
    status: true,
    data: {
      totalPendingContacts,
      totalSharePendingContacts,
    },
  });
};

const getPendingContacts = async (req, res) => {
  const { currentUser } = req;
  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  const total = await Contact.countDocuments({
    pending_users: currentUser._id,
    type: { $in: ['transfer', 'clone', 'avm'] },
  });

  console.log('total', total, currentUser._id);

  const skip = parseInt(req.params.skip || '0');
  let contacts;
  const userProject = {
    user_name: 1,
    nick_name: 1,
    email: 1,
    cell_phone: 1,
    phone: 1,
    picture_profile: 1,
  };
  await Contact.aggregate([
    {
      $match: {
        pending_users: currentUser._id,
        type: { $in: ['transfer', 'clone', 'avm'] },
      },
    },
    {
      $sort: { [field]: dir },
    },
    {
      $skip: skip,
    },
    {
      $limit: count,
    },
    {
      $lookup: {
        from: 'activities',
        localField: 'last_activity',
        foreignField: '_id',
        as: 'last_activity',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'shared_members',
        foreignField: '_id',
        as: 'shared_members',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userId: '$original_user' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'original_user',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userId: { $first: '$user' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
          {
            $project: userProject,
          },
        ],
        as: 'user',
      },
    },
  ])
    .collation({ locale: 'en' })
    .allowDiskUse(true)
    .exec((err, data) => {
      contacts = data;
      if (!contacts) {
        return res.status(200).json({
          status: true,
          data: {
            contacts: [],
            count: 0,
          },
        });
      }
      return res.send({
        status: true,
        data: {
          contacts,
          count: total,
        },
      });
    });
};

const acceptContactsSharing = async (req, res) => {
  const { currentUser } = req;
  const { contacts, aggree_custom_fields } = req.body;
  const activity_content = 'accepted shared contact';

  await Contact.find({ _id: { $in: contacts } })
    .then(async (contactsInfo) => {
      for (const contact of contactsInfo) {
        const activity = new Activity({
          user: contact.user,
          contacts: contact._id,
          content: activity_content,
          users: currentUser._id,
          type: 'users',
        });
        await activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        const user = await User.findOne({
          _id: contact.user,
        }).catch((err) => {
          console.log('user find err', err.message);
        });
        await Contact.updateOne(
          {
            _id: contact._id,
          },
          {
            $set: {
              last_activity: activity._id,
            },
            $push: {
              shared_members: currentUser._id,
            },
            $pull: {
              pending_users: currentUser._id,
            },
          }
        ).catch((err) => {
          console.log('contact update error', err.message);
        });

        const notification = new Notification({
          creator: currentUser._id,
          user: contact.user,
          contact: contact._id,
          criteria: 'accept_share_contact',
          content: `accepted the contact share in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });

        // Custom fields
        if (aggree_custom_fields) {
          pushAddtionalFields(contact, currentUser._id, user);
        }
      }
    })
    .catch((err) => {
      console.log('contact find error', err.message);
    });
  return res.send({
    status: true,
  });
};

const declineContactsSharing = async (req, res) => {
  const { currentUser } = req;
  const contacts = req.body.contacts || [];
  const activity_content = 'declined shared contact';

  await Contact.find({ _id: { $in: contacts } })
    .then(async (contactsInfo) => {
      for (const contact of contactsInfo) {
        const activity = new Activity({
          user: contact.user,
          contacts: contact._id,
          content: activity_content,
          users: currentUser._id,
          type: 'users',
        });
        await activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        await Contact.updateOne(
          {
            _id: contact._id,
          },
          {
            $set: {
              last_activity: activity._id,
            },
            $push: {
              declined_users: currentUser._id,
            },
            $pull: {
              pending_users: currentUser._id,
            },
          }
        ).catch((err) => {
          console.log('contact update error', err.message);
        });

        const notification = new Notification({
          creator: currentUser._id,
          user: contact?.user,
          contact: contact._id,
          criteria: 'decline_share_contact',
          content: `declined the contact share in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
    })
    .catch((err) => {
      console.log('contact find error', err.message);
    });

  return res.send({
    status: true,
  });
};

const acceptMoveContacts = async (req, res) => {
  const { currentUser } = req;
  const { acceptLists, customFields } = req.body;
  var transferingContacts = [];
  var cloningContacts = [];
  var avmContacts = [];
  let duplicatedContacts = [];
  const promise_array = [];

  const acceptIds = acceptLists['ids'];
  const acceptContacts = acceptLists['contacts'];

  acceptIds.forEach((e) => {
    const promise = new Promise(async (resolve) => {
      try {
        const _contact = await Contact.findOne({ _id: e.id }).catch((err) => {
          console.log('contact found err', err.message);
        });
        const _duplicate_contacts = await checkDuplicateContact(
          _contact,
          currentUser
        );
        if (_duplicate_contacts && _duplicate_contacts.length > 0) {
          duplicatedContacts = duplicatedContacts.concat(_duplicate_contacts);
          duplicatedContacts.push(_contact);
        } else {
          if (e.type === 'transfer') {
            transferingContacts.push(e.id);
          } else if (e.type === 'clone') {
            cloningContacts.push(e.id);
          } else if (e.type === 'avm') {
            avmContacts.push(e.id);
          }
        }
        resolve();
      } catch (err) {
        console.log('contact duplicate err', err);
      }
    });
    promise_array.push(promise);
  });

  acceptContacts.forEach((e) => {
    const promise = new Promise(async (resolve) => {
      try {
        const contactData = e;
        const _duplicate_contacts = await checkDuplicateContact(
          contactData,
          currentUser
        );
        if (_duplicate_contacts && _duplicate_contacts.length > 0) {
          duplicatedContacts = duplicatedContacts.concat(_duplicate_contacts);
          duplicatedContacts.push(contactData);
        } else {
          await acceptDuplicateContacts(contactData, currentUser.id);
        }
        resolve();
      } catch (err) {
        console.log('contact duplicate err', err);
      }
    });
    promise_array.push(promise);
  });

  Promise.all(promise_array).then(async () => {
    acceptTransferRequest(transferingContacts, currentUser.id, customFields);
    acceptCloneRequest(cloningContacts, currentUser.id, customFields);
    acceptAvmRequest(avmContacts, currentUser.id); // in my thought, it does not need the customFields, because there is no addtionalField on AVM contact.

    if (!duplicatedContacts.length) {
      return res.send({ status: true });
    }

    return res.send({
      status: false,
      acceptedContacts:
        transferingContacts.length +
        cloningContacts.length +
        avmContacts.length,
      duplicatedContacts,
    });
  });
};

const declineMoveContacts = async (req, res) => {
  const { currentUser } = req;
  const { declineLists } = req.body;

  var transferingContacts = [];
  var cloningContacts = [];
  var avmContacts = [];

  declineLists.forEach((e) => {
    if (e.type === 'transfer') {
      transferingContacts.push(e.id);
    } else if (e.type === 'clone') {
      cloningContacts.push(e.id);
    } else if (e.type === 'avm') {
      avmContacts.push(e.id);
    }
  });

  declineTransferRequest(transferingContacts, currentUser.id);
  declineCloneRequest(cloningContacts, currentUser.id);
  declineAvmRequest(avmContacts, currentUser.id);

  return res.send({ status: true });
};

const getCount = async (req, res) => {
  const { currentUser } = req;
  const total = await Contact.countDocuments({
    user: currentUser.id,
  });
  const compareDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const recent = await Contact.countDocuments({
    user: currentUser.id,
    created_at: { $gte: compareDate },
  });
  return res.send({
    status: true,
    data: { total, recent },
  });
};

const sharePendingAdvanceSearch = async (req, res) => {
  const { currentUser } = req;
  // Select or Fetch
  const action = req.params.action;

  const {
    teamOptions,
    analyticsConditions,
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    stagesCondition,
    assigneeCondition,

    includeLabel,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    includeStage,

    activityCondition,
    activityStart,
    activityEnd,

    customFieldCondition,
  } = req.body;

  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const skip = req.body.skip || 0;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  /**
   * Pre. Split the analytics search options to fieldCondition & activityCondition
   */
  const {
    fieldQuery,
    activityCondition: activityConditionQuery,
    automationOption,
  } = ContactHelper.getConditionsByAnalytics(analyticsConditions || []);

  /**
   * Pre. Additional Query for the select or loading option
   */
  const additionalQuery = [];
  if (action === 'select') {
    additionalQuery.push({
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
      },
    });
  } else {
    // Sort & Facet
    additionalQuery.push({
      $project: {
        _id: 1,
      },
    });
    additionalQuery.push({
      $sort: { [field]: dir },
    });
    additionalQuery.push({
      $facet: {
        count: [{ $count: 'total' }],
        data: [
          {
            $skip: skip,
          },
          {
            $limit: count,
          },
        ],
      },
    });
  }

  try {
    if (teamOptions && Object.keys(teamOptions).length) {
      const teamContactData = await teamMemberSearch(
        currentUser._id,
        teamOptions,
        {
          searchStr,
          labelCondition,
          countryCondition,
          regionCondition,
          cityCondition,
          zipcodeCondition,
          tagsCondition,
          brokerageCondition,
          sourceCondition,
          includeLabel,
          includeSource,
          includeTag,
          includeBrokerage,
          fieldQuery,
        },
        additionalQuery,
        action
      );
      return res.send(teamContactData);
    }
  } catch (e) {
    sendErrorToSentry(currentUser, e);
    return res.status(500).send({
      status: false,
      error: e.message,
    });
  }

  let query;
  const userId = mongoose.Types.ObjectId(currentUser.id);
  const teamList = await Team.find({ members: userId }).select({ _id: 1 });
  const teamListIds = teamList.map((e) => e._id);
  /* const query = {
    $or: [{ user: currentUser._id }],
    $and: [],
  }; */
  if (teamList.length) {
    query = {
      $or: [
        {
          shared_members: { $ne: userId },
          declined_users: { $ne: userId },
          shared_team: { $in: teamListIds },
          shared_all_member: true,
        },
        { pending_users: userId },
      ],
    };
  } else {
    query = { pending_users: userId };
  }
  // if (!(automationOption && automationOption.id)) {
  //   query['$or'].push({ shared_members: currentUser._id });
  // }
  /**
   * 1. Deal Stage Contact Ids Getting
   */
  let dealContactIds = [];
  if (stagesCondition && stagesCondition.length) {
    const deals = await Deal.find({
      deal_stage: { $in: stagesCondition },
      user: currentUser._id,
    });
    deals.forEach((e) => {
      dealContactIds = [...dealContactIds, ...e.contacts];
    });
    if (!dealContactIds.length) {
      return res.send({
        status: true,
        data: [],
      });
    }
  }

  /**
   * 2. Contact Ids getting by Activity & Analytics Activity Search
   * activityQuery = { $and: [ activityTimeQuery, { $or: activityTypeQueries }]}
   * */
  const activityQuery = {
    $and: [{ user: currentUser._id }],
  };
  // 2.1 Time Query Setting
  const activityTimeQuery = {};
  if (activityStart || activityEnd) {
    activityTimeQuery['created_at'] = {};
    if (activityStart) {
      const activityStartDate = new Date(
        `${activityStart.year}-${activityStart.month}-${activityStart.day}`
      );
      activityTimeQuery['created_at']['$gte'] = new Date(
        activityStartDate.getTime() +
          Math.abs(activityStartDate.getTimezoneOffset() * 60000)
      );
    }
    if (activityEnd) {
      let activityEndDate = new Date(
        `${activityEnd.year}-${activityEnd.month}-${activityEnd.day}`
      );
      activityEndDate = new Date(
        activityEndDate.getTime() +
          Math.abs(activityEndDate.getTimezoneOffset() * 60000)
      );
      activityEndDate.setDate(activityEndDate.getDate() + 1);
      activityTimeQuery['created_at']['$lte'] = activityEndDate;
    }
    activityQuery['$and'].push(activityTimeQuery);
  }
  // 2.2 Activity Type Query Setting
  const activityTypeQueries = [];
  const singleActivities = [];
  for (let i = 0; i < activityCondition.length; i++) {
    const condition = activityCondition[i];
    const type =
      // eslint-disable-next-line no-nested-ternary
      condition.type === 'watched_pdf'
        ? 'pdf_trackers'
        : condition.type === 'watched_image'
        ? 'image_trackers'
        : condition.type;
    if (type === 'clicked_link') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*clicked.*',
          $options: 'i',
        },
      });
    } else if (type === 'opened_email') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*opened.*',
          $options: 'i',
        },
      });
    } else if (condition.detail) {
      const DETAIL_TYPES = {
        videos: 'videos',
        pdfs: 'pdfs',
        images: 'images',
        video_trackers: 'videos',
        pdf_trackers: 'pdfs',
        image_trackers: 'images',
      };
      activityTypeQueries.push({
        type,
        [DETAIL_TYPES[type]]: {
          $in: [mongoose.Types.ObjectId(condition.detail)],
        },
      });
    } else {
      singleActivities.push(type);
    }
  }
  if (singleActivities.length) {
    activityTypeQueries.push({
      type: { $in: singleActivities },
    });
  }
  try {
    if (activityConditionQuery && Object.keys(activityConditionQuery).length) {
      activityTypeQueries.push(activityConditionQuery);
    }
  } catch (err) {
    console.log('analytics condition query');
  }
  if (activityTypeQueries.length) {
    activityQuery['$and'].push({ $or: activityTypeQueries });
    activityQuery['$and'].push({ contacts: { $exists: true } });
  }

  // 3. Analytics Automation Search

  // 4. Contact Data Field Search & Analytics Field & Rate Search
  const subQuery = generateAdvancedFilterQuery({
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    includeLabel,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    fieldQuery,
    assigneeCondition,
    customFieldCondition,
  });
  query['$and'] = subQuery;

  // Automation Option Query
  if (automationOption && automationOption.id) {
    if (automationOption.id === 'recent_off_automation') {
      const latestOffAutomation = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      subQuery.push({ automation_off: { $gte: latestOffAutomation } });
    } else if (
      automationOption.id === 'on_automation' ||
      automationOption.id === 'never_automated'
    ) {
      const automationContactIds = await onAutomationInfo(
        currentUser._id,
        'contact'
      );
      if (automationOption.id === 'on_automation') {
        if (!automationContactIds.length) {
          return res.send({
            status: true,
            data: [],
          });
        } else {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $in: automationContactIds } });
        }
      } else {
        subQuery.push({ automation_off: { $exists: false } });
        if (automationContactIds.length) {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $nin: automationContactIds } });
        }
      }
    }
  }

  if (!subQuery.length && !dealContactIds.length) {
    delete query['$and'];
  }

  if (dealContactIds.length) {
    if (includeStage) {
      activityQuery['$and'].push({ contacts: { $in: dealContactIds } });
      query['$and'].push({ _id: { $in: dealContactIds } });
    } else {
      activityQuery['$and'].push({ contacts: { $nin: dealContactIds } });
      query['$and'].push({ _id: { $nin: dealContactIds } });
    }
  }

  // 5. Exec search query
  let data = [];
  if (activityTypeQueries.length) {
    // Join Query
    data = await Activity.aggregate([
      {
        $match: activityQuery,
      },
      {
        $group: { _id: { contact: '$contacts' } },
      },
      {
        $lookup: {
          from: 'contacts',
          localField: '_id.contact',
          foreignField: '_id',
          as: 'contacts',
        },
      },
      { $unwind: '$contacts' },
      {
        $replaceRoot: {
          newRoot: '$contacts',
        },
      },
      {
        $match: query,
      },
      // ...additionalQuery,
    ]);
  } else {
    data = await Contact.aggregate([
      { $match: query } /* ...additionalQuery */,
    ]);
  }

  if (action === 'select') {
    return res.send({
      status: true,
      data,
    });
  }
  // Last Activity Join and Shared Members Join
  if (data && data.length) {
    const total = data.length;
    const ids = data.map((e) => e._id);
    const contacts = await Contact.find({
      _id: { $in: ids },
      pending_users: currentUser.id,
      type: 'share',
    })
      .populate([
        { path: 'last_activity', select: { content: 1, type: 1 } },
        { path: 'shared_members', select: { _id: 1, user_name: 1, email: 1 } },
        {
          path: 'user',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
        {
          path: 'owner',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
      ])
      .sort({ [field]: dir })
      .skip(skip)
      .limit(count);

    return res.send({
      status: true,
      data: contacts,
      total,
    });
  }
  return res.send({
    status: true,
    data: [],
  });
};

const sharedAdvanceSearch = async (req, res) => {
  const { currentUser } = req;
  // Select or Fetch
  const action = req.params.action;

  const {
    teamOptions,
    analyticsConditions,
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    stagesCondition,
    assigneeCondition,

    includeLabel,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    includeStage,

    activityCondition,
    activityStart,
    activityEnd,

    customFieldCondition,
  } = req.body;

  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const skip = req.body.skip || 0;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  /**
   * Pre. Split the analytics search options to fieldCondition & activityCondition
   */
  const {
    fieldQuery,
    activityCondition: activityConditionQuery,
    automationOption,
  } = ContactHelper.getConditionsByAnalytics(analyticsConditions || []);

  /**
   * Pre. Additional Query for the select or loading option
   */
  const additionalQuery = [];
  if (action === 'select') {
    additionalQuery.push({
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
      },
    });
  } else {
    // Sort & Facet
    additionalQuery.push({
      $project: {
        _id: 1,
      },
    });
    additionalQuery.push({
      $sort: { [field]: dir },
    });
    additionalQuery.push({
      $facet: {
        count: [{ $count: 'total' }],
        data: [
          {
            $skip: skip,
          },
          {
            $limit: count,
          },
        ],
      },
    });
  }

  try {
    if (teamOptions && Object.keys(teamOptions).length) {
      const teamContactData = await teamMemberSearch(
        currentUser._id,
        teamOptions,
        {
          searchStr,
          labelCondition,
          countryCondition,
          regionCondition,
          cityCondition,
          zipcodeCondition,
          tagsCondition,
          brokerageCondition,
          sourceCondition,
          includeLabel,
          includeSource,
          includeTag,
          includeBrokerage,
          fieldQuery,
        },
        additionalQuery,
        action
      );
      return res.send(teamContactData);
    }
  } catch (e) {
    sendErrorToSentry(currentUser, e);
    return res.status(500).send({
      status: false,
      error: e.message,
    });
  }

  const query = {
    shared_members: currentUser._id,
    $and: [],
  };
  // if (!(automationOption && automationOption.id)) {
  //   query['$or'].push({ shared_members: currentUser._id });
  // }

  /**
   * 1. Deal Stage Contact Ids Getting
   */
  let dealContactIds = [];
  if (stagesCondition && stagesCondition.length) {
    const deals = await Deal.find({
      deal_stage: { $in: stagesCondition },
      user: currentUser._id,
    });
    deals.forEach((e) => {
      dealContactIds = [...dealContactIds, ...e.contacts];
    });
    if (!dealContactIds.length) {
      return res.send({
        status: true,
        data: [],
      });
    }
  }

  /**
   * 2. Contact Ids getting by Activity & Analytics Activity Search
   * activityQuery = { $and: [ activityTimeQuery, { $or: activityTypeQueries }]}
   * */
  const activityQuery = {
    $and: [{ user: currentUser._id }],
  };
  // 2.1 Time Query Setting
  const activityTimeQuery = {};
  if (activityStart || activityEnd) {
    activityTimeQuery['created_at'] = {};
    if (activityStart) {
      const activityStartDate = new Date(
        `${activityStart.year}-${activityStart.month}-${activityStart.day}`
      );
      activityTimeQuery['created_at']['$gte'] = new Date(
        activityStartDate.getTime() +
          Math.abs(activityStartDate.getTimezoneOffset() * 60000)
      );
    }
    if (activityEnd) {
      let activityEndDate = new Date(
        `${activityEnd.year}-${activityEnd.month}-${activityEnd.day}`
      );
      activityEndDate = new Date(
        activityEndDate.getTime() +
          Math.abs(activityEndDate.getTimezoneOffset() * 60000)
      );
      activityEndDate.setDate(activityEndDate.getDate() + 1);
      activityTimeQuery['created_at']['$lte'] = activityEndDate;
    }
    activityQuery['$and'].push(activityTimeQuery);
  }
  // 2.2 Activity Type Query Setting
  const activityTypeQueries = [];
  const singleActivities = [];
  for (let i = 0; i < activityCondition.length; i++) {
    const condition = activityCondition[i];
    const type =
      // eslint-disable-next-line no-nested-ternary
      condition.type === 'watched_pdf'
        ? 'pdf_trackers'
        : condition.type === 'watched_image'
        ? 'image_trackers'
        : condition.type;
    if (type === 'clicked_link') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*clicked.*',
          $options: 'i',
        },
      });
    } else if (type === 'opened_email') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*opened.*',
          $options: 'i',
        },
      });
    } else if (condition.detail) {
      const DETAIL_TYPES = {
        videos: 'videos',
        pdfs: 'pdfs',
        images: 'images',
        video_trackers: 'videos',
        pdf_trackers: 'pdfs',
        image_trackers: 'images',
      };
      activityTypeQueries.push({
        type,
        [DETAIL_TYPES[type]]: {
          $in: [mongoose.Types.ObjectId(condition.detail)],
        },
      });
    } else {
      singleActivities.push(type);
    }
  }
  if (singleActivities.length) {
    activityTypeQueries.push({
      type: { $in: singleActivities },
    });
  }
  try {
    if (activityConditionQuery && Object.keys(activityConditionQuery).length) {
      activityTypeQueries.push(activityConditionQuery);
    }
  } catch (err) {
    console.log('analytics condition query');
  }
  if (activityTypeQueries.length) {
    activityQuery['$and'].push({ $or: activityTypeQueries });
    activityQuery['$and'].push({ contacts: { $exists: true } });
  }

  // 3. Analytics Automation Search

  // 4. Contact Data Field Search & Analytics Field & Rate Search
  const subQuery = generateAdvancedFilterQuery({
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    includeLabel,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    fieldQuery,
    assigneeCondition,
    customFieldCondition,
  });
  query['$and'] = subQuery;

  // Automation Option Query
  if (automationOption && automationOption.id) {
    if (automationOption.id === 'recent_off_automation') {
      const latestOffAutomation = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      subQuery.push({ automation_off: { $gte: latestOffAutomation } });
    } else if (
      automationOption.id === 'on_automation' ||
      automationOption.id === 'never_automated'
    ) {
      const automationContactIds = await onAutomationInfo(
        currentUser._id,
        'contact'
      );
      if (automationOption.id === 'on_automation') {
        if (!automationContactIds.length) {
          return res.send({
            status: true,
            data: [],
          });
        } else {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $in: automationContactIds } });
        }
      } else {
        subQuery.push({ automation_off: { $exists: false } });
        if (automationContactIds.length) {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $nin: automationContactIds } });
        }
      }
    }
  }

  if (!subQuery.length && !dealContactIds.length) {
    delete query['$and'];
  }

  if (dealContactIds.length) {
    if (includeStage) {
      activityQuery['$and'].push({ contacts: { $in: dealContactIds } });
      query['$and'].push({ _id: { $in: dealContactIds } });
    } else {
      activityQuery['$and'].push({ contacts: { $nin: dealContactIds } });
      query['$and'].push({ _id: { $nin: dealContactIds } });
    }
  }

  // 5. Exec search query
  let data = [];
  if (activityTypeQueries.length) {
    // Join Query
    data = await Activity.aggregate([
      {
        $match: activityQuery,
      },
      {
        $group: { _id: { contact: '$contacts' } },
      },
      {
        $lookup: {
          from: 'contacts',
          localField: '_id.contact',
          foreignField: '_id',
          as: 'contacts',
        },
      },
      { $unwind: '$contacts' },
      {
        $replaceRoot: {
          newRoot: '$contacts',
        },
      },
      {
        $match: query,
      },
      // ...additionalQuery,
    ]);
  } else {
    data = await Contact.aggregate([
      { $match: query } /* ...additionalQuery */,
    ]);
  }

  if (action === 'select') {
    return res.send({
      status: true,
      data,
    });
  }
  // Last Activity Join and Shared Members Join
  if (data && data.length) {
    const total = data.length;
    const ids = data.map((e) => e._id);
    const contacts = await Contact.find({
      _id: { $in: ids },
    })
      .populate([
        { path: 'last_activity', select: { content: 1, type: 1 } },
        { path: 'shared_members', select: { _id: 1, user_name: 1, email: 1 } },
        {
          path: 'user',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
        {
          path: 'owner',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
      ])
      .sort({ [field]: dir })
      .skip(skip)
      .limit(count);

    return res.send({
      status: true,
      data: contacts,
      total,
    });
  }
  return res.send({
    status: true,
    data: [],
  });
};

const pendingAdvanceSearch = async (req, res) => {
  const { currentUser } = req;
  // Select or Fetch
  const action = req.params.action;

  const {
    teamOptions,
    analyticsConditions,
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    stagesCondition,
    assigneeCondition,

    includeLabel,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    includeStage,

    activityCondition,
    activityStart,
    activityEnd,

    customFieldCondition,
  } = req.body;

  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const skip = req.body.skip || 0;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else if (field === 'name') {
    field = 'first_name';
  } else {
    field = 'created_at';
  }

  /**
   * Pre. Split the analytics search options to fieldCondition & activityCondition
   */
  const {
    fieldQuery,
    activityCondition: activityConditionQuery,
    automationOption,
  } = ContactHelper.getConditionsByAnalytics(analyticsConditions || []);

  /**
   * Pre. Additional Query for the select or loading option
   */
  const additionalQuery = [];
  if (action === 'select') {
    additionalQuery.push({
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        cell_phone: 1,
      },
    });
  } else {
    // Sort & Facet
    additionalQuery.push({
      $project: {
        _id: 1,
      },
    });
    additionalQuery.push({
      $sort: { [field]: dir },
    });
    additionalQuery.push({
      $facet: {
        count: [{ $count: 'total' }],
        data: [
          {
            $skip: skip,
          },
          {
            $limit: count,
          },
        ],
      },
    });
  }

  try {
    if (teamOptions && Object.keys(teamOptions).length) {
      const teamContactData = await teamMemberSearch(
        currentUser._id,
        teamOptions,
        {
          searchStr,
          labelCondition,
          countryCondition,
          regionCondition,
          cityCondition,
          zipcodeCondition,
          tagsCondition,
          brokerageCondition,
          sourceCondition,
          includeLabel,
          includeSource,
          includeTag,
          includeBrokerage,
          fieldQuery,
        },
        additionalQuery,
        action
      );
      return res.send(teamContactData);
    }
  } catch (e) {
    sendErrorToSentry(currentUser, e);
    return res.status(500).send({
      status: false,
      error: e.message,
    });
  }

  const query = {
    pending_users: currentUser._id,
    type: { $in: ['transfer', 'clone', 'avm'] },
    $and: [],
  };
  /* if (!(automationOption && automationOption.id)) {
    query['$or'].push({ shared_members: currentUser._id });
  } */

  /**
   * 1. Deal Stage Contact Ids Getting
   */
  let dealContactIds = [];
  if (stagesCondition && stagesCondition.length) {
    const deals = await Deal.find({
      deal_stage: { $in: stagesCondition },
      user: currentUser._id,
    });
    deals.forEach((e) => {
      dealContactIds = [...dealContactIds, ...e.contacts];
    });
    if (!dealContactIds.length) {
      return res.send({
        status: true,
        data: [],
      });
    }
  }

  /**
   * 2. Contact Ids getting by Activity & Analytics Activity Search
   * activityQuery = { $and: [ activityTimeQuery, { $or: activityTypeQueries }]}
   * */
  const activityQuery = {
    $and: [{ user: currentUser._id }],
  };
  // 2.1 Time Query Setting
  const activityTimeQuery = {};
  if (activityStart || activityEnd) {
    activityTimeQuery['created_at'] = {};
    if (activityStart) {
      const activityStartDate = new Date(
        `${activityStart.year}-${activityStart.month}-${activityStart.day}`
      );
      activityTimeQuery['created_at']['$gte'] = new Date(
        activityStartDate.getTime() +
          Math.abs(activityStartDate.getTimezoneOffset() * 60000)
      );
    }
    if (activityEnd) {
      let activityEndDate = new Date(
        `${activityEnd.year}-${activityEnd.month}-${activityEnd.day}`
      );
      activityEndDate = new Date(
        activityEndDate.getTime() +
          Math.abs(activityEndDate.getTimezoneOffset() * 60000)
      );
      activityEndDate.setDate(activityEndDate.getDate() + 1);
      activityTimeQuery['created_at']['$lte'] = activityEndDate;
    }
    activityQuery['$and'].push(activityTimeQuery);
  }
  // 2.2 Activity Type Query Setting
  const activityTypeQueries = [];
  const singleActivities = [];
  for (let i = 0; i < activityCondition.length; i++) {
    const condition = activityCondition[i];
    const type =
      // eslint-disable-next-line no-nested-ternary
      condition.type === 'watched_pdf'
        ? 'pdf_trackers'
        : condition.type === 'watched_image'
        ? 'image_trackers'
        : condition.type;
    if (type === 'clicked_link') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*clicked.*',
          $options: 'i',
        },
      });
    } else if (type === 'opened_email') {
      activityTypeQueries.push({
        type: 'email_trackers',
        content: {
          $regex: '.*opened.*',
          $options: 'i',
        },
      });
    } else if (condition.detail) {
      const DETAIL_TYPES = {
        videos: 'videos',
        pdfs: 'pdfs',
        images: 'images',
        video_trackers: 'videos',
        pdf_trackers: 'pdfs',
        image_trackers: 'images',
      };
      activityTypeQueries.push({
        type,
        [DETAIL_TYPES[type]]: {
          $in: [mongoose.Types.ObjectId(condition.detail)],
        },
      });
    } else {
      singleActivities.push(type);
    }
  }
  if (singleActivities.length) {
    activityTypeQueries.push({
      type: { $in: singleActivities },
    });
  }
  try {
    if (activityConditionQuery && Object.keys(activityConditionQuery).length) {
      activityTypeQueries.push(activityConditionQuery);
    }
  } catch (err) {
    console.log('analytics condition query');
  }
  if (activityTypeQueries.length) {
    activityQuery['$and'].push({ $or: activityTypeQueries });
    activityQuery['$and'].push({ contacts: { $exists: true } });
  }

  // 3. Analytics Automation Search

  // 4. Contact Data Field Search & Analytics Field & Rate Search
  const subQuery = generateAdvancedFilterQuery({
    searchStr,
    labelCondition,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    brokerageCondition,
    sourceCondition,
    includeLabel,
    includeSource,
    includeTag,
    orTag,
    includeBrokerage,
    fieldQuery,
    assigneeCondition,
    customFieldCondition,
  });
  query['$and'] = subQuery;

  // Automation Option Query
  if (automationOption && automationOption.id) {
    if (automationOption.id === 'recent_off_automation') {
      const latestOffAutomation = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      subQuery.push({ automation_off: { $gte: latestOffAutomation } });
    } else if (
      automationOption.id === 'on_automation' ||
      automationOption.id === 'never_automated'
    ) {
      const automationContactIds = await onAutomationInfo(
        currentUser._id,
        'contact'
      );
      if (automationOption.id === 'on_automation') {
        if (!automationContactIds.length) {
          return res.send({
            status: true,
            data: [],
          });
        } else {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $in: automationContactIds } });
        }
      } else {
        subQuery.push({ automation_off: { $exists: false } });
        if (automationContactIds.length) {
          if (activityQuery) {
            activityQuery['$and'].push({
              contacts: { $in: automationContactIds },
            });
          }
          subQuery.push({ _id: { $nin: automationContactIds } });
        }
      }
    }
  }

  if (!subQuery.length && !dealContactIds.length) {
    delete query['$and'];
  }

  if (dealContactIds.length) {
    if (includeStage) {
      activityQuery['$and'].push({ contacts: { $in: dealContactIds } });
      query['$and'].push({ _id: { $in: dealContactIds } });
    } else {
      activityQuery['$and'].push({ contacts: { $nin: dealContactIds } });
      query['$and'].push({ _id: { $nin: dealContactIds } });
    }
  }

  // 5. Exec search query
  let data = [];
  if (activityTypeQueries.length) {
    // Join Query
    data = await Activity.aggregate([
      {
        $match: activityQuery,
      },
      {
        $group: { _id: { contact: '$contacts' } },
      },
      {
        $lookup: {
          from: 'contacts',
          localField: '_id.contact',
          foreignField: '_id',
          as: 'contacts',
        },
      },
      { $unwind: '$contacts' },
      {
        $replaceRoot: {
          newRoot: '$contacts',
        },
      },
      {
        $match: query,
      },
      // ...additionalQuery,
    ]);
  } else {
    data = await Contact.aggregate([
      { $match: query } /* ...additionalQuery */,
    ]);
  }

  if (action === 'select') {
    return res.send({
      status: true,
      data,
    });
  }
  // Last Activity Join and Shared Members Join

  if (data && data.length) {
    const total = data.length;
    const ids = data.map((e) => e._id);
    const contacts = await Contact.find({
      _id: { $in: ids },
    })
      .populate([
        { path: 'last_activity', select: { content: 1, type: 1 } },
        { path: 'shared_members', select: { _id: 1, user_name: 1, email: 1 } },
        {
          path: 'user',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
        {
          path: 'owner',
          select: { _id: 1, user_name: 1, email: 1, picture_profile: 1 },
        },
      ])
      .sort({ [field]: dir })
      .skip(skip)
      .limit(count);

    return res.send({
      status: true,
      data: contacts,
      total,
    });
  }
  return res.send({
    status: true,
    data: [],
  });
};

const getAllSharePendingContacts = async (req, res) => {
  const { currentUser } = req;
  let query;
  const userId = mongoose.Types.ObjectId(currentUser.id);
  const teamList = await Team.find({ members: userId }).select({ _id: 1 });
  const teamListIds = teamList.map((e) => e._id);
  if (teamList.length) {
    query = {
      $or: [
        {
          shared_members: { $ne: userId },
          declined_users: { $ne: userId },
          shared_team: { $in: teamListIds },
          shared_all_member: true,
        },
        { pending_users: userId },
      ],
    };
  } else {
    query = { pending_users: userId };
  }

  const contacts = await Contact.find(query).select({
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    cell_phone: 1,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const getAllSharedContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    shared_members: currentUser.id,
  }).select({
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    cell_phone: 1,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const getAllPendingContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    pending_users: currentUser._id,
    type: { $in: ['transfer', 'clone', 'avm'] },
  }).select({
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    cell_phone: 1,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const loadConversations = async (req, res) => {
  const { currentUser } = req;
  const { skip, type } = req.body;
  let matchQuery;
  if (type === 'active') {
    matchQuery = {
      type: { $in: [1, 2] },
      user: currentUser._id,
    };
  } else if (type === 'first') {
    matchQuery = {
      user: currentUser._id,
      should_contact: true,
      action_score: { $exists: true },
    };
  } else {
    matchQuery = {
      type: 3,
      user: currentUser._id,
    };
  }

  SphereRelationship.aggregate([
    {
      $match: matchQuery,
    },
    { $sort: { action_score: -1, bucket_score: -1, _id: 1 } },
    ...(skip ? [{ $skip: skip }] : []),
    { $limit: 10 },
    {
      $lookup: {
        from: 'contacts',
        localField: 'contact_id',
        foreignField: '_id',
        as: 'contact',
      },
    },
    {
      $unwind: {
        path: '$contact',
        preserveNullAndEmptyArrays: true,
      },
    },
  ])
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      throw err;
    });
};

/**
 * Assign the bucket to the contacts
 * @param {*} req: currentUser, body: { ids: [contact_id], bucket: bucket_id }
 * @param {*} res: { status: true | false }
 * Quiz: when reassign the bucket to the contacts, should_contact field should be reset? or no?
 */
const assignBucket = (req, res) => {
  const { currentUser } = req;
  const { ids, bucket, score } = req.body;

  const current = new Date();
  SphereRelationship.updateMany(
    { contact_id: { $in: ids } },
    {
      $set: {
        sphere_bucket_id: bucket,
        ...{ action_score: score },
        ...(bucket
          ? {
              should_contact: true,
              contacted_at: current,
            }
          : {}),
        user: currentUser._id,
      },
      ...(!bucket ? { $unset: { action_score: true } } : {}),
    },
    { upsert: true }
  ).then((_) => {
    return res.send({
      status: true,
    });
  });
};

const markAsCompleted = (req, res) => {
  const { currentUser } = req;
  const { id } = req.body; // actions can be added for more complicated options

  const current = new Date();
  // const updateQuery = actions.reduce((data, action) => {
  //   return { ...data, [action + 'ed_at']: current };
  // }, {});

  SphereRelationship.updateOne(
    {
      user: currentUser._id,
      contact_id: id,
    },
    {
      $set: { contacted_at: current },
      $unset: { should_contact: true, type: true },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      throw err;
    });
};

const getAllIds = async (req, res) => {
  const { currentUser } = req;

  Contact.aggregate([
    {
      $match: {
        user: currentUser._id,
        'pending_users.0': { $exists: false },
      },
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $lookup: {
        from: 'sphere_relationships',
        localField: '_id',
        foreignField: 'contact_id',
        as: 'sphere_relationship',
      },
    },
    {
      $unwind: {
        path: '$sphere_relationship',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        sphere_bucket_id: '$sphere_relationship.sphere_bucket_id',
      },
    },
    {
      $project: {
        _id: 1,
        sphere_bucket_id: 1,
      },
    },
  ])
    .collation({ locale: 'en' })
    .exec((err, data) => {
      const contacts = data;
      if (!contacts) {
        return res.status(400).json({
          status: false,
          error: 'Contacts doesn`t exist',
        });
      }
      const last_sphere = contacts.find((e) => {
        return e.sphere_bucket_id !== null && !e.sphere_bucket_id;
      });
      return res.send({
        status: true,
        data: {
          contacts,
          sphere: last_sphere,
        },
      });
    });
};

const loadByIds = async (req, res) => {
  const { currentUser } = req;
  const { ids } = req.body;
  const oids = [];
  ids.forEach((id) => {
    oids.push(mongoose.Types.ObjectId(id));
  });
  const contacts = await Contact.aggregate([
    {
      $match: {
        user: currentUser._id,
        _id: { $in: oids },
      },
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $lookup: {
        from: 'sphere_relationships',
        localField: '_id',
        foreignField: 'contact_id',
        as: 'sphere_relationship',
      },
    },
    {
      $unwind: {
        path: '$sphere_relationship',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        sphere_bucket_id: '$sphere_relationship.sphere_bucket_id',
        action_score: '$sphere_relationship.action_score',
      },
    },
    {
      $project: {
        _id: 1,
        first_name: 1,
        last_name: 1,
        tags: 1,
        label: 1,
        email: 1,
        cell_phone: 1,
        state: 1,
        city: 1,
        address: 1,
        sphere_bucket_id: 1,
        action_score: 1,
      },
    },
  ]);

  return res.send({
    status: true,
    data: contacts,
  });
};

const setPrimaryEmail = async (req, res) => {
  const { currentUser } = req;
  const { contact, email } = req.body;

  if (!email) {
    return res.status(400).json({
      status: false,
      error: "Email can't be empty!",
    });
  }

  const _contact = await Contact.findById(contact);

  if (!_contact) {
    return res.status(400).json({
      status: false,
      error: 'No Contact found',
    });
  }

  const duplicated = await Contact.findOne({
    _id: { $ne: _contact._id },
    user: currentUser.id,
    email,
  });

  if (duplicated) {
    return res.status(400).json({
      status: false,
      error: 'Primary email is duplicated.',
    });
  }

  await Contact.updateOne({ _id: _contact._id }, { $set: { email } }).catch(
    (error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    }
  );

  if (_contact.emails && _contact.emails.length > 0) {
    await Contact.updateOne(
      { _id: _contact._id },
      { $set: { 'emails.$[].isPrimary': false } }
    ).catch((error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });

    const index = _contact.emails.findIndex((e) => e.value === email);

    if (index >= 0) {
      await Contact.updateOne(
        { _id: _contact._id, 'emails.value': email },
        { $set: { 'emails.$.isPrimary': true } }
      ).catch((error) => {
        console.log('Error', error);
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
    } else {
      await Contact.updateOne(
        { _id: _contact._id },
        { $push: { emails: { value: email, isPrimary: true, type: '' } } }
      ).catch((error) => {
        console.log('Error', error);
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
    }
  } else {
    await Contact.updateOne(
      { _id: _contact._id },
      { $push: { emails: { value: email, isPrimary: true, type: '' } } }
    ).catch((error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
  }

  const updatedContact = await Contact.findById(contact);

  return res.send({
    status: true,
    data: { ...updatedContact._doc },
  });
};

const setPrimaryPhoneNumber = async (req, res) => {
  const { currentUser } = req;
  const { contact, phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      status: false,
      error: "PhoneNumber can't be empty!",
    });
  }

  const _contact = await Contact.findById(contact);

  if (!_contact) {
    return res.status(400).json({
      status: false,
      error: 'No Contact found',
    });
  }

  const duplicated = await Contact.findOne({
    _id: { $ne: _contact._id },
    user: currentUser.id,
    cell_phone: phoneNumber,
  });

  if (duplicated) {
    return res.status(400).json({
      status: false,
      error: 'Primary phoneNumber is duplicated.',
    });
  }

  await Contact.updateOne(
    { _id: _contact._id },
    { $set: { cell_phone: phoneNumber } }
  ).catch((error) => {
    console.log('Error', error);
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  });

  if (_contact.phones && _contact.phones.length > 0) {
    await Contact.updateOne(
      { _id: _contact._id },
      { $set: { 'phones.$[].isPrimary': false } }
    ).catch((error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });

    const index = _contact.phones.findIndex((e) => e.value === phoneNumber);

    if (index >= 0) {
      await Contact.updateOne(
        { _id: _contact._id, 'phones.value': phoneNumber },
        { $set: { 'phones.$.isPrimary': true } }
      ).catch((error) => {
        console.log('Error', error);
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
    } else {
      await Contact.updateOne(
        { _id: _contact._id },
        { $push: { phones: { value: phoneNumber, isPrimary: true, type: '' } } }
      ).catch((error) => {
        console.log('Error', error);
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
    }
  } else {
    await Contact.updateOne(
      { _id: _contact._id },
      { $push: { phones: { value: phoneNumber, isPrimary: true, type: '' } } }
    ).catch((error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
  }

  const updatedContact = await Contact.findById(contact);

  return res.send({
    status: true,
    data: { ...updatedContact._doc },
  });
};

const setPrimaryAddress = async (req, res) => {
  const { currentUser } = req;
  const { contact, address } = req.body;

  if (!address) {
    return res.status(400).json({
      status: false,
      error: "Address can't be empty!",
    });
  }

  const { city, street, state, zip, country, _id } = address;

  const _contact = await Contact.findById(contact);

  if (!_contact) {
    return res.status(400).json({
      status: false,
      error: 'No Contact found',
    });
  }

  await Contact.updateOne(
    { _id: _contact._id },
    { $set: { city, state, country, zip, address: street } }
  ).catch((error) => {
    console.log('Error', error);
    return res.status(400).json({
      status: false,
      error: error.message,
    });
  });

  if (_contact.addresses && _contact.addresses.length > 0) {
    await Contact.updateOne(
      { _id: _contact._id },
      { $set: { 'addresses.$[].isPrimary': false } }
    ).catch((error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });

    const index = _contact.addresses.findIndex((e) => e._id.toString() === _id);

    if (index >= 0) {
      await Contact.updateOne(
        {
          _id: _contact._id,
          'addresses._id': _id,
        },
        { $set: { 'addresses.$.isPrimary': true } }
      ).catch((error) => {
        console.log('Error', error);
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
    } else {
      await Contact.updateOne(
        { _id: _contact._id },
        {
          $push: {
            addresses: { street, city, zip, country, state, isPrimary: true },
          },
        }
      ).catch((error) => {
        console.log('Error', error);
        return res.status(400).json({
          status: false,
          error: error.message,
        });
      });
    }
  } else {
    await Contact.updateOne(
      { _id: _contact._id },
      {
        $push: {
          addresses: { street, city, zip, country, state, isPrimary: true },
        },
      }
    ).catch((error) => {
      console.log('Error', error);
      return res.status(400).json({
        status: false,
        error: error.message,
      });
    });
  }

  const updatedContact = await Contact.findById(contact);

  return res.send({
    status: true,
    data: { ...updatedContact._doc },
  });
};

const loadProperties = async (req, res) => {
  const { currentUser } = req;
  const contactId = req.params.id;

  const propertyList = await Event.aggregate([
    {
      $match: {
        user: currentUser._id,
        contactId: mongoose.Types.ObjectId(contactId),
        'property.url': { $exists: true },
      },
    },
    {
      $group: {
        _id: '$property.url',
        count: { $sum: 1 },
        property: { $last: '$property' },
      },
    },
  ]).catch((err) => {});

  const properties = propertyList.map((e) => e.property);

  return res.send({
    status: true,
    data: properties,
  });
};

const getStatus = async (req, res) => {
  const { contacts } = req.body;
  const assignedContacts = await Contact.find({ _id: { $in: contacts } })
    .populate('last_activity', 'label')
    .catch((err) => {
      console.log('Error', err);
      return res.status(400).json({
        status: false,
        error: err.message,
      });
    });

  return res.send({
    status: true,
    data: assignedContacts,
  });
};

module.exports = {
  getAll,
  getAllByLastActivity,
  getByLastActivity,
  getBrokerages,
  getSources,
  getCities,
  create,
  search,
  advanceSearch,
  searchEasy,
  additionalFields,
  additionalFieldSearch,
  remove,
  bulkRemove,
  update,
  bulkEditLabel,
  bulkUpdate,
  importCSV,
  importCSVChunk,
  importContacts,
  overwriteCSV,
  duplicateCSV,
  exportCSV,
  getById,
  getByIds,
  getNthContact,
  leadContact,
  loadFollows,
  loadTimelines,
  selectAllContacts,
  getAllContacts,
  checkEmail,
  checkPhone,
  loadDuplication,
  bulkCreate,
  verifyEmail,
  verifyPhone,
  resubscribe,
  filter,
  interestContact,
  interestSubmitContact,
  shareContacts,
  stopShare,
  mergeContact,
  updateContact,
  loadByEmails,
  getActivities,
  loadNotes,
  getDetail,
  getTimeline,
  getTasks,
  removeFromTask,
  mergeAdditionalFields,
  loadAdditionalFieldsConflictContactsPagination,
  groupByFields,
  groupByActivities,
  groupByRates,
  calculateRates,
  unlockRate,
  generateAdvancedFilterQuery,
  getSharePendingContacts,
  getSharedContacts,
  getPendingContacts,
  acceptMoveContacts,
  declineMoveContacts,
  getCount,
  sharePendingAdvanceSearch,
  sharedAdvanceSearch,
  pendingAdvanceSearch,
  getAllSharePendingContacts,
  getAllSharedContacts,
  getAllPendingContacts,
  getPendingContactsCount,
  loadConversations,
  markAsCompleted,
  assignBucket,
  getAllIds,
  loadByIds,
  loadGroupActivities,
  getContactActionContentList,
  getContactActivityDetail,
  createContactByUcraft,
  loadProperties,
  acceptContactsSharing,
  declineContactsSharing,
  getStatus,
  setPrimaryEmail,
  setPrimaryPhoneNumber,
  setPrimaryAddress,
  getTotalCountContactAction,
  uploadContactsChunk,
  getContactList,
  getContactsTotalCount,
};
