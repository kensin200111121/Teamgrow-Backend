const request = require('request-promise');
const Contact = require('../models/contact');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const PipeLine = require('../models/pipe_line');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Automation = require('../models/automation');
const Note = require('../models/note');
const FollowUp = require('../models/follow_up');
const Activity = require('../models/activity');
const Outbound = require('../models/outbound');
const outbound_sample_data = require('../constants/outbound');
const { outbound_constants } = require('../constants/variable');

const outboundCallhookApi = async (userid, action, callbackGetData, params) => {
  const { type, lead } = params;
  const outbounds = await Outbound.find({
    user: userid,
    action,
  }).catch();
  if (outbounds.length > 0) {
    const data = await callbackGetData(params);
    for (let i = 0; i < outbounds.length; i++) {
      const outbound = outbounds[i];
      if (action === outbound_constants.LEAD_SOURCE) {
        if (
          outbound.data?.type !== outbound_sample_data.LEAD_SOURCE_TYPE.ALL &&
          outbound.data?.type !== type
        )
          continue;
        else if (
          outbound.data?.lead !== '0' && // All
          outbound.data?.lead !== lead
        )
          continue;
      }
      if (outbound.hookapi) {
        outbound_call_api(outbound.hookapi, data);
      }
    }
  }
};

const getRemoveContactOutboundRecentData = async (userid) => {
  const contact = await Contact.findOne({ user: userid }).catch((err) =>
    console.log(err.messages)
  );
  if (!contact) return outbound_sample_data.CONTACT_REMOVE;
  const data = {
    num: 1,
    contacts:
      contact._id +
      ',' +
      contact.first_name +
      ',' +
      contact.last_name +
      ',' +
      contact.email +
      ',' +
      contact.cell_phone,
    removed_date: new Date(),
  };
  return data;
};

const getRemoveContactOutboundData = async (params) => {
  const { contacts } = params;
  let contact = '';
  for (var i = 0; i < contacts.length; i++) {
    if (i !== 0) contact += ',';
    contact +=
      '[' +
      contacts[i]._id +
      ',' +
      contacts[i].first_name +
      ',' +
      contacts[i].last_name +
      ',' +
      contacts[i].email +
      ',' +
      contacts[i].cell_phone +
      ']';
  }
  const data = {
    num: contacts.length,
    contacts: contact,
    removed_date: new Date(),
  };
  return data;
};

const getContactOutboundRecentData = async (userid, data) => {
  const obj = { user: userid };
  if (data) {
    const { type } = data;
    if (type?.indexOf('lead') === 0) {
      obj['source'] = type;
    }
  }

  const contact = await Contact.findOne(obj).catch((err) =>
    console.log(err.message)
  );
  if (!contact) return outbound_sample_data.CONTACT;

  return getContactOutboundData({ _id: contact._id });
};
const getContactOutboundData = async (params) => {
  const { _id } = params;
  const contact = await Contact.findOne({ _id })
    .populate('label')
    .catch((err) => console.log(err.message));
  let additional_field = JSON.stringify(contact.additional_field)?.replace(
    '{',
    '['
  );
  additional_field = additional_field?.replace('}', ']');
  const data = {
    id: contact._id,
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    address: contact.address,
    city: contact.city,
    state: contact.state,
    zip: contact.zip,
    cell_phone: contact.cell_phone,
    country: contact.country,
    source: contact.source,
    company: contact.brokerage,
    label: contact.label
      ? 'name: ' +
        contact.label.name +
        ',color: ' +
        contact.label.color.toString()
      : '',
    tags: contact.tags,
    secondary_email: contact.secondary_email,
    secondary_phone: contact.secondary_phone,
    website: contact.website,
    additional_field,
    created_at: contact.created_at,
  };
  return data;
};

const getDealOutboundRecentData = async (userid) => {
  const deal = await Deal.findOne({ user: userid }).catch((err) =>
    console.log(err.message)
  );

  if (!deal) return outbound_sample_data.DEAL_ADD;
  return getAddDealOutboundData({ _id: deal._id });
};
const getAddDealOutboundData = async (params) => {
  const { _id } = params;
  const deal = await Deal.findOne({
    _id,
  })
    .populate('user')
    .populate('contacts')
    .populate('deal_stage')
    .catch((err) => console.log(err.message));
  let contact = '';
  for (var i = 0; i < deal.contacts?.length; i++) {
    if (i !== 0) contact += ',';
    contact +=
      '[' +
      deal.contacts[i]._id +
      ',' +
      deal.contacts[i].first_name +
      ',' +
      deal.contacts[i].last_name +
      ',' +
      deal.contacts[i].email +
      ',' +
      deal.contacts[i].cell_phone +
      ']';
  }

  let pipe_line = '';
  if (deal.deal_stage && deal.deal_stage.pipe_line) {
    const pipe = await PipeLine.findOne({
      _id: deal.deal_stage.pipe_line,
    }).catch();
    pipe_line = pipe.title;
  }

  const data = {
    id: deal._id,
    title: deal.title,
    user: deal.user ? deal.user.user_name : '',
    contact,
    pipe_line,
    deal_stage: deal.deal_stage ? deal.deal_stage.title : '',
    additional_field: deal.additional_field,
    create_at: deal.created_at,
  };
  return data;
};

const getMoveDealOutboundRecentData = async (userid) => {
  const deal = await Deal.findOne({ user: userid })
    .populate('deal_stage')
    .catch((err) => console.log(err.message));

  if (!deal) return outbound_sample_data.DEAL_MOVE;
  return getMoveDealOutboundData({
    deal_id: deal._id,
    deal_stage_id: deal.deal_stage._id,
  });
};

const getMoveDealOutboundData = async (params) => {
  const { deal_id, deal_stage_id } = params;

  const deal = await Deal.findOne({
    _id: deal_id,
  })
    .populate('user')
    .populate('contacts')
    .populate('deal_stage')
    .catch();

  const deal_stage = await DealStage.findOne({
    _id: deal_stage_id,
  })
    .populate('pipe_line')
    .catch();
  let contact = '';
  for (var i = 0; i < deal.contacts.length; i++) {
    if (i !== 0) contact += ',';
    contact +=
      '[' +
      deal.contacts[i]._id +
      ',' +
      deal.contacts[i].first_name +
      ',' +
      deal.contacts[i].last_name +
      ',' +
      deal.contacts[i].email +
      ',' +
      deal.contacts[i].cell_phone +
      ']';
  }

  const data = {
    id: deal._id,
    title: deal.title,
    user: deal.user ? deal.user.user_name : '',
    contact,
    pipe_line: deal_stage.pipe_line ? deal_stage.pipe_line.title : '',
    deal_source: deal.deal_stage ? deal.deal_stage.title : '',
    deal_target: deal_stage.title,
    create_at: deal.created_at,
  };
  return data;
};

const getSendMaterialOutbounRecentdData = async (userid) => {
  const activity = await Activity.findOne({
    user: userid,
    type: 'videos',
    contacts: { $exists: true },
    videos: { $exists: true },
  })
    .populate('contacts')
    .populate('videos')
    .catch((err) => console.log(err.message));

  if (!activity || activity.length === 0)
    return outbound_sample_data.MATERIAL_SEND;
  const data = {
    subject: activity.subject,
    contact:
      activity.contacts._id +
      ',' +
      activity.contacts.first_name +
      ',' +
      activity.contacts.last_name +
      ',' +
      activity.contacts.email +
      ',' +
      activity.contacts.cell_phone,

    video: activity.videos[0]._id + ',' + activity.videos[0].title,
    pdf: '',
    image: '',
    create_at: activity.create_at,
  };
  return data;
};

const getSendMaterialOutboundData = async (params) => {
  const { subject, contact_ids, video_ids, pdf_ids, image_ids, create_at } =
    params;

  const contacts = await Contact.find({
    _id: { $in: contact_ids },
  }).catch();
  let contact = '';
  let i = 0;
  for (i = 0; i < contacts.length; i++) {
    if (i !== 0) contact += ',';
    contact +=
      '[' +
      contacts[i]._id +
      ',' +
      contacts[i].first_name +
      ',' +
      contacts[i].last_name +
      ',' +
      contacts[i].email +
      ',' +
      contacts[i].cell_phone +
      ']';
  }

  const videos = await Video.find({
    _id: { $in: video_ids },
  }).catch();
  let video = '';
  for (i = 0; i < videos.length; i++) {
    if (i !== 0) video += ',';
    video += '[' + videos[i]._id + ',VIDEO,' + videos[i].title + ']';
  }

  const pdfs = await PDF.find({
    _id: { $in: pdf_ids },
  }).catch();
  var pdf = '';
  for (i = 0; i < pdfs.length; i++) {
    if (i !== 0) pdf += ',';
    pdf += '[' + pdfs[i]._id + ',PDF,' + pdfs[i].title + ']';
  }

  const images = await Image.find({
    _id: { $in: image_ids },
  }).catch();
  let image = '';
  for (i = 0; i < images.length; i++) {
    if (i !== 0) image += ',';
    image += '[' + images[i]._id + ',IMAGE,' + images[i].title + ']';
  }

  const data = {
    subject,
    contact,
    video,
    pdf,
    image,
    create_at,
  };
  return data;
};

const getWatchMaterialOutboundRecentData = async (userid) => {
  const activity = await Activity.findOne({
    user: userid,
    type: 'video_trackers',
    contacts: { $exists: true },
    videos: { $exists: true },
  })
    .populate('contacts')
    .populate('videos')
    .catch((err) => console.log(err.message));

  if (!activity) return outbound_sample_data.MATERIAL_WATCH;
  const data = {
    contact:
      activity.contacts._id +
      ',' +
      activity.contacts.first_name +
      ',' +
      activity.contacts.last_name +
      ',' +
      activity.contacts.email +
      ',' +
      activity.contacts.cell_phone,
    material_id: activity.videos[0]._id,
    material_type: 'VIDEO',
    material_title: activity.videos[0].title,
    material_amount: 100,
    create_at: activity.create_at,
  };
  return data;
};
const getWatchMaterialOutboundData = async (params) => {
  const { contactId, material, create_at } = params;

  const contact = await Contact.findOne({ _id: contactId });

  const data = {
    contact:
      contact._id +
      ',' +
      contact.first_name +
      ',' +
      contact.last_name +
      ',' +
      contact.email +
      ',' +
      contact.cell_phone,
    material_id: material.id,
    material_type: material.type,
    material_title: material.title,
    material_amount: material.amount,
    create_at,
  };
  return data;
};

const getAssignedAutomationOutboundRecentData = async (userid) => {
  const activity = await Activity.findOne({
    user: userid,
    type: 'automations',
    contacts: { $exists: true },
    automations: { $exists: true },
  })
    .populate('contacts')
    .populate('automations')
    .catch((err) => console.log(err.message));

  if (!activity) return outbound_sample_data.AUTOMATION_ASSIGNED;

  const data = {
    id: activity.automations._id,
    title: activity.automations.title,
    type: activity.automations.type,
    contact:
      activity.contacts._id +
      ',' +
      activity.contacts.first_name +
      ',' +
      activity.contacts.last_name +
      ',' +
      activity.contacts.email +
      ',' +
      activity.contacts.cell_phone,
    deal: '',
    create_at: new Date(),
  };
  return data;
};
const getAssignedAutomationOutboundData = async (params) => {
  const { automation_id, contact_ids, deal_ids, create_at } = params;

  let contact = '';
  let deal = '';
  let i = 0;
  let j = 0;
  if (contact_ids) {
    const contacts = await Contact.find({
      _id: { $in: contact_ids },
    }).catch();

    for (i = 0; i < contacts.length; i++) {
      if (i !== 0) contact += ',';
      contact +=
        '[' +
        contacts[i]._id +
        ',' +
        contacts[i].first_name +
        ',' +
        contacts[i].last_name +
        ',' +
        contacts[i].email +
        ',' +
        contacts[i].cell_phone +
        ']';
    }
  } else {
    const deals = await Deal.find({
      _id: { $in: deal_ids },
    })
      .populate('contacts')
      .catch();
    for (i = 0; i < deals.length; i++) {
      if (i !== 0) deal += ',';

      let deal_contact = '';
      for (j = 0; j < deals[i].contacts.length; j++) {
        if (j !== 0) deal_contact += ',';
        deal_contact +=
          '[' +
          deals[i].contacts[j]._id +
          ',' +
          deals[i].contacts[j].first_name +
          ',' +
          deals[i].contacts[j].last_name +
          ',' +
          deals[i].contacts[j].email +
          ',' +
          deals[i].contacts[j].cell_phone +
          ']';
      }
      deal +=
        '[' + deals[i]._id + ',' + deals[i].title + ',' + deal_contact + ']';
    }
  }

  const automation = await Automation.findOne({ _id: automation_id });
  const data = {
    id: automation._id,
    title: automation.title,
    type: automation.type,
    deal,
    contact,
    create_at,
  };
  return data;
};

const getNoteOutboundRecentData = async (userid) => {
  const note = await Note.findOne({
    user: userid,
    contacts: { $exists: true },
  }).catch((err) => console.log(err.message));

  if (!note) return outbound_sample_data.NOTE;
  return getNoteOutboundData({ id: note._id });
};

const getNoteOutboundData = async (params) => {
  const { id } = params;
  const note = await Note.findOne({ _id: id }).populate('contact').catch();
  let contact = '';
  let i = 0;
  for (i = 0; i < note.contact.length; i++) {
    if (i !== 0) contact += ',';
    contact +=
      '[' +
      note.contact[i]._id +
      ',' +
      note.contact[i].first_name +
      ',' +
      note.contact[i].last_name +
      ',' +
      note.contact[i].email +
      ',' +
      note.contact[i].cell_phone +
      ']';
  }

  const data = {
    id,
    title: note.title,
    content: note.content,
    contact,
    create_at: note.created_at,
  };
  return data;
};

const getFollowupOutboundRecentData = async (userid) => {
  const followup = await FollowUp.findOne({
    user: userid,
    contacts: { $exists: true },
  }).catch((err) => console.log(err.message));

  if (!followup) return outbound_sample_data.FOLLOWUP;
  return getFollowupOutboundData({ _id: followup._id });
};

const getFollowupOutboundData = async (params) => {
  const { _id } = params;
  const followup = await FollowUp.findOne({ _id })
    .populate('contact')
    .catch((err) => console.log(err.message));
  const contact = followup.contact
    ? '[' +
      followup.contact._id +
      ',' +
      followup.contact.first_name +
      ',' +
      followup.contact.last_name +
      ',' +
      followup.contact.email +
      ',' +
      followup.contact.cell_phone +
      ']'
    : '';

  const data = {
    id: _id,
    contact,
    type: followup.type,
    content: followup.content,
    due_date: followup.due_date,
    set_recurrence: followup.set_recurrence,
    recurrence_mode: followup.recurrence_mode,
    create_at: followup.created_at,
  };
  return data;
};

const getRemoveFollowupOutboundRecentData = async (userid) => {
  const followup = await FollowUp.findOne({
    user: userid,
    contacts: { $exists: true },
  })
    .populate('contact')
    .catch((err) => console.log(err.message));

  if (!followup) return outbound_sample_data.FOLLOWUP_REMOVE;

  const contact =
    '[' +
    followup.contact._id +
    ',' +
    followup.contact.first_name +
    ',' +
    followup.contact.last_name +
    ',' +
    followup.contact.email +
    ',' +
    followup.contact.cell_phone +
    ']';

  const removed_task =
    followup.type +
    ',' +
    followup.content +
    ',' +
    contact +
    ',' +
    followup.due_date +
    ',' +
    followup.set_recurrence +
    ',' +
    followup.recurrence_mode +
    ',' +
    followup.created_at;

  const data = {
    num: 1,
    removed_task,
    removed_date: new Date(),
  };
  return data;
};

const getRemoveFollowupOutboundData = async (params) => {
  const { ids } = params;

  const followups = await FollowUp.find({
    _id: { $in: ids },
  })
    .populate('contact')
    .catch();
  let followup = '';
  for (var i = 0; i < followups.length; i++) {
    if (i !== 0) followup += ',';
    const contact =
      '[' +
      followups[i].contact._id +
      ',' +
      followups[i].contact.first_name +
      ',' +
      followups[i].contact.last_name +
      ',' +
      followups[i].contact.email +
      ',' +
      followups[i].contact.cell_phone +
      ']';

    followup +=
      '[' +
      followups[i].type +
      ',' +
      followups[i].content +
      ',' +
      contact +
      ',' +
      followups[i].due_date +
      ',' +
      followups[i].set_recurrence +
      ',' +
      followups[i].recurrence_mode +
      ',' +
      followups[i].created_at;
  }
  const data = {
    num: followups.length,
    removed_task: followup,
    removed_date: new Date(),
  };
  return data;
};

const outbound_call_api = (outbound_url, data) => {
  var options = {
    method: 'POST',
    url: outbound_url,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data,
    json: true,
  };

  request(options, function (error, response, data) {
    if (error) console.log('outbound_call_api: ', error.message);
  }).catch((error) => {
    console.log('outbound_call_api: ', error.message);
  });
};

module.exports = {
  getContactOutboundData,
  getContactOutboundRecentData,
  getRemoveContactOutboundRecentData,
  getRemoveContactOutboundData,
  getDealOutboundRecentData,
  getAddDealOutboundData,
  getMoveDealOutboundRecentData,
  getMoveDealOutboundData,
  getSendMaterialOutbounRecentdData,
  getSendMaterialOutboundData,
  getWatchMaterialOutboundRecentData,
  getWatchMaterialOutboundData,
  getAssignedAutomationOutboundRecentData,
  getAssignedAutomationOutboundData,
  getNoteOutboundRecentData,
  getNoteOutboundData,
  getFollowupOutboundRecentData,
  getFollowupOutboundData,
  getRemoveFollowupOutboundRecentData,
  getRemoveFollowupOutboundData,
  outbound_call_api,
  outboundCallhookApi,
};
