const mongoose = require('mongoose');
const Contact = require('../models/contact');
const Garbage = require('../models/garbage');
const Automation = require('../models/automation');
const Label = require('../models/label');
const EmailTemplate = require('../models/email_template');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const EventType = require('../models/event_type');
const LeadForm = require('../models/lead_form');
const garbageHelper = require('../helpers/garbage');
const { sendEmail } = require('../helpers/email');

const jwt = require('jsonwebtoken');
const api = require('../configs/api');
const { encrypt } = require('../helpers/utility');
const {
  LEAD_SOURCE_TYPE,
  LEAD_SOURCE_TYPE_LIST,
} = require('../constants/outbound');

const getContact = (req, res) => {
  const { currentUser } = req;
  Contact.findOne({
    _id: req.body.id,
    user: currentUser.id,
  })
    .then((contact) => {
      if (contact) {
        return res.send({
          status: true,
          data: contact,
        });
      } else {
        return res.send({
          status: false,
          error: 'Invalid permission',
        });
      }
    })
    .catch((err) => {
      return res.send({
        status: false,
        error: 'Internal server error',
      });
    });
};

const createApiJwtToken = (req, res) => {
  const { currentUser } = req;
  const token = jwt.sign(
    { userId: currentUser.id, api_loggin: true },
    api.API_JWT_SECRET
  );
  Garbage.updateOne(
    { user: currentUser.id },
    {
      $set: { access_token: token },
    }
  ).catch((err) => {
    console.log('get contact error', err.message);
  });
  return res.send({
    status: true,
    token,
  });
};

const createApiCryptoToken = (req, res) => {
  const { currentUser } = req;
  const apiKey = encrypt(currentUser._id + '', api.API_CRYPTO_SECRET);
  Garbage.updateOne(
    { user: currentUser.id },
    {
      $set: { api_key: apiKey },
    }
  ).catch((err) => {
    console.log('get contact error', err.message);
  });
  return res.send({
    status: true,
    apiKey,
  });
};

const getAutomations = async (req, res) => {
  const { currentUser } = req;
  const automations = await Automation.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id), del: false },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: true,
      },
    },
  ]);

  return res.send(automations);
};

const getEmailTemplates = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const email_templates = await EmailTemplate.aggregate([
    {
      $match: {
        $or: [
          { user: mongoose.Types.ObjectId(currentUser.id) },
          {
            role: 'admin',
            company,
          },
          {
            shared_members: currentUser.id,
          },
        ],
      },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: true,
      },
    },
  ]);

  return res.send(email_templates);
};

const getVideos = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const videos = await Video.aggregate([
    {
      $match: {
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
      },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: true,
      },
    },
  ]);

  return res.send(videos);
};

const getPdfs = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const pdfs = await PDF.aggregate([
    {
      $match: {
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
      },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: true,
      },
    },
  ]);

  return res.send(pdfs);
};

const getImages = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const images = await Image.aggregate([
    {
      $match: {
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
      },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: true,
      },
    },
  ]);

  return res.send(images);
};

const getLabels = async (req, res) => {
  const { currentUser } = req;

  const labels = await Label.aggregate([
    {
      $match: {
        $or: [
          { user: mongoose.Types.ObjectId(currentUser.id) },
          {
            role: 'admin',
          },
        ],
      },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        name: true,
      },
    },
  ]);

  res.send(labels);
};
const getLeadSources = async (req, res) => {
  const { currentUser } = req;
  const { type } = req.query;
  let leadsources = [{ id: 0, title: 'All' }];
  const event_types = await EventType.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id), del: false },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: true,
      },
    },
  ]);
  const leadforms = await LeadForm.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    {
      $project: {
        _id: false,
        id: '$_id',
        title: '$name',
      },
    },
  ]);

  switch (type) {
    case LEAD_SOURCE_TYPE.ALL:
      leadsources = [...leadsources, ...event_types, ...leadforms];
      break;
    case LEAD_SOURCE_TYPE.LEADSCHEDULE:
      leadsources = [...leadsources, ...event_types];
      break;
    case LEAD_SOURCE_TYPE.LEADFORM:
      leadsources = [...leadsources, ...leadforms];
      break;
  }
  return res.send(leadsources);
};

const getLeadSourceTypes = async (req, res) => {
  return res.send(LEAD_SOURCE_TYPE_LIST);
};

const preprocessRequest = async (req, res, next) => {
  if (req.body.data) {
    Object.keys(req.body.data).forEach((key) => {
      if (req.body.data[key]) req.body[key] = req.body.data[key];
    });
    delete req.body.data;
  }
  next();
};

const searchContact = async (req, res, next) => {
  const { currentUser } = req;
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({
      status: false,
      error: 'empty email address',
    });
  }
  let contact;

  const nameMatch = email.match(/^([^@]*)@/);
  if (!nameMatch) {
    return res.status(400).send({
      status: false,
      error: 'Invalid email address',
    });
  }
  contact = await Contact.findOne({
    email: new RegExp(req.body.email, 'i'),
    user: currentUser.id,
  }).catch((err) => {
    return res.send('contact find err', err.message);
  });
  if (!contact) {
    const name = nameMatch ? nameMatch[1] : req.body.email;
    contact = new Contact({
      email: req.body.email,
      first_name: name,
      user: currentUser.id,
    });
    await contact.save().catch((err) => {
      console.log('new contact save err', err.message);
    });
  }

  req.body.contact = contact.id;
  req.body.contacts = [contact.id];
  req.params.id = contact.id;

  next();
};

const addNewTag = async (req, res) => {
  const { email, tag } = req.body;
  let tags = [];
  if (tag && typeof tag === 'string') tags = tag.split(',');
  else tags = [...tag];
  Contact.updateOne(
    { email },
    {
      $push: { tags: { $each: tags } },
    }
  ).catch((err) => {
    console.log('err', err);
  });
  return res.send({
    status: true,
  });
};

const sendVideo = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;
  const { template_id, video_id, contacts } = req.body;
  const email_template = await EmailTemplate.findOne({
    _id: template_id,
  });
  if (!email_template) {
    return res.status(400).send({
      status: false,
      error: 'Send error: not selected templete',
    });
  }
  const { content, subject } = email_template;

  const data = {
    user: currentUser.id,
    content,
    subject,
    video_ids: [video_id],
    contacts,
    is_guest: guest_loggin,
    guest,
  };

  sendEmail(data)
    .then((result) => {
      if (result[0] && result[0].status === true) {
        return res.send({
          status: true,
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'Send error',
        });
      }
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const sendPdf = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;
  const { template_id, pdf_id, contacts } = req.body;
  const email_template = await EmailTemplate.findOne({
    _id: template_id,
  });
  if (!email_template) {
    return res.status(400).send({
      status: false,
      error: 'Send error: not selected templete',
    });
  }
  const { content, subject } = email_template;

  const data = {
    user: currentUser.id,
    content,
    subject,
    pdf_ids: [pdf_id],
    contacts,
    is_guest: guest_loggin,
    guest,
  };

  sendEmail(data)
    .then((result) => {
      if (result[0] && result[0].status === true) {
        return res.send({
          status: true,
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'Send error',
        });
      }
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const sendImage = async (req, res) => {
  const { currentUser, guest_loggin, guest } = req;
  const { template_id, image_id, contacts } = req.body;
  const email_template = await EmailTemplate.findOne({
    _id: template_id,
  });
  if (!email_template) {
    return res.status(400).send({
      status: false,
      error: 'Send error: not selected templete',
    });
  }
  const { content, subject } = email_template;
  const data = {
    user: currentUser.id,
    content,
    subject,
    image_ids: [image_id],
    contacts,
    is_guest: guest_loggin,
    guest,
  };

  sendEmail(data)
    .then((result) => {
      if (result[0] && result[0].status === true) {
        return res.send({
          status: true,
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'Send error',
        });
      }
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

module.exports = {
  createApiJwtToken,
  createApiCryptoToken,
  getContact,
  addNewTag,
  getAutomations,
  getEmailTemplates,
  getLabels,
  getVideos,
  getPdfs,
  getImages,
  getLeadSources,
  getLeadSourceTypes,
  sendVideo,
  sendPdf,
  sendImage,
  searchContact,
  preprocessRequest,
};
