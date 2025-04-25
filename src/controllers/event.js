const { body } = require('express-validator');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const Event = require('../models/event');
const Filter = require('../models/filter');
const _ = require('lodash');
const { shareContactsToOrganization } = require('../helpers/contact');

const receiveLeadEvent = async (req, res) => {
  const { currentUser } = req;

  const {
    source,
    system,
    type,
    message,
    description,
    person,
    property,
    propertySearch,
    campaign,
    pageTitle,
    pageUrl,
    pageDuration,
    pageReferrer,
    ...additional
  } = req.body;

  const personId = req.body?.personId || req.body?.person?.id;

  const event = new Event({
    source,
    system,
    type,
    message,
    description,
    person,
    property,
    propertySearch,
    campaign,
    pageTitle,
    pageUrl,
    pageDuration,
    pageReferrer,
    additional,
    user: currentUser._id,
    personId,
  });

  let email = '';
  email = event.person?.emails.filter((e) => e.isPrimary)[0]?.value;
  if (!email) {
    email = event.person?.emails[0]?.value;
  }

  const existedContact = await Contact.findOne({
    user: currentUser._id,
    personId,
    $or: [{ user: currentUser._id, email }],
  });
  let contact_id = existedContact?._id;

  if (!existedContact) {
    let cell_phone = '';
    let secondary_email = '';
    let secondary_phone = '';

    if (event.person?.emails && event.person?.emails.length) {
      secondary_email =
        event.persons?.emails.filter((e) => e.value !== email)[0]?.value || '';
    }

    if (event.person?.phones && event.person?.phones.length) {
      cell_phone = event.person?.phones.filter((e) => e.isPrimary)[0]?.value;

      if (!cell_phone) {
        cell_phone = event.person?.phones[0].value;
      }
      secondary_phone =
        event.persons?.phones.filter((e) => e.value !== cell_phone)[0]?.value ||
        '';
    }
    const contact = new Contact({
      email,
      secondary_email,
      cell_phone,
      secondary_phone,
      first_name: event.person?.firstName,
      last_name: event.person?.lastName,
      created_at: new Date(),
      updated_at: new Date(),
      personId,
      type: 'agentFire',
      user: currentUser._id,
      tags: [...(person?.tags || []), 'AgentFire'],
      source: person?.source || '',
      additional_field: {
        agent: person?.assignedTo || '',
        sourceUrl: person?.sourceUrl || '',
      },
    });

    await contact.save().catch((error) => {
      return res.status(400).send({
        status: false,
        error,
      });
    });
    contact_id = contact._id;
    await shareContactsToOrganization(currentUser, contact_id).catch((err) =>
      console.log('share contacts to organization err', err.message)
    );
  } else {
    const tags = _.union(existedContact.tags, person?.tags || []);
    await Contact.updateOne(
      {
        _id: existedContact._id,
      },
      {
        $set: { tags },
      }
    ).catch((error) => {
      return res.status(400).send({
        status: false,
        error,
      });
    });
  }

  event.contactId = contact_id;

  await event.save().catch((error) => {
    return res.status(400).send({
      status: false,
      error,
    });
  });

  const activity = new Activity({
    type: 'events',
    events: event._id,
    content: type,
    user: currentUser._id,
    contacts: contact_id,
  });

  await activity.save().catch((error) => {
    return res.status(400).send({
      status: false,
      error,
    });
  });

  Contact.updateOne(
    { _id: contact_id },
    { $set: { last_activity: activity.id } }
  ).catch((err) => {
    console.log('contact update err', err.message);
  });

  return res.send({
    status: true,
  });
};

const loadLeadEvents = async (req, res) => {
  const { currentUser } = req;
  const { limit = 10, offset = 0, personId, type } = req.query || {};

  const query = { user: currentUser._id };
  if (type) {
    query[type] = type;
  }
  if (personId) {
    query[personId] = personId;
  }

  const total = await Event.countDocuments(query).catch((_) => {});

  const data = await Event.find(query)
    .skip(offset)
    .limit(limit)
    .catch((_) => {});

  return res.send({
    total,
    data,
  });
};

const setFilter = async (req, res) => {
  const { currentUser } = req;

  const content = {
    tagsCondition: ['AgentFire'],
  };

  const old = await Filter.findOne({
    user: currentUser.id,
    content,
  });

  if (old) {
    return res.send({ status: true });
  }

  const filter = new Filter({
    content,
    title: 'agentFire',
    user: currentUser.id,
  });

  await filter.save();

  return res.send({ status: true });
};

const getLeadEventDetail = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;

  Event.findOne({ user: currentUser._id, _id: id })
    .lean()
    .then((data) => {
      return res.send({
        ...data,
      });
    })
    .catch((_) => {});
};

module.exports = {
  receiveLeadEvent,
  loadLeadEvents,
  getLeadEventDetail,
  setFilter,
};
