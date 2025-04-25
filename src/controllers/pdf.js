const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');
const Garbage = require('../models/garbage');
const garbageHelper = require('../helpers/garbage');
const { uploadBase64Image, removeFile } = require('../helpers/fileUpload');
const { checkMaterialCount } = require('../helpers/material');
const api = require('../configs/api');
const urls = require('../constants/urls');
const PDFTracker = require('../models/pdf_tracker');
const PDF = require('../models/pdf');
const Folder = require('../models/folder');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const User = require('../models/user');
const Team = require('../models/team');
const EmailTemplate = require('../models/email_template');
const Automation = require('../models/automation');
const { userProfileOutputGuard } = require('../helpers/user');
const { replaceToken } = require('../helpers/utility');

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
    if (req.currentUser) {
      const pdf = new PDF({
        user: req.currentUser.id,
        type: req.file.mimetype,
        url: req.file.location,
        key: req.file.key,
        role: 'user',
        created_at: new Date(),
      });

      pdf.save().then(async (_pdf) => {
        await Folder.updateOne(
          {
            user: currentUser._id,
            rootFolder: true,
          },
          { $addToSet: { pdfs: { $each: [_pdf['_id']] } } }
        );
        res.send({
          status: true,
          data: _pdf,
        });
      });
    }
  }
};

const updateDetail = async (req, res) => {
  const { currentUser } = req;
  const pdf = await PDF.findOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('pdf found err', err.message);
  });

  const files = {};
  const fileKeys = {};
  for (const key in req.files) {
    if (req.files[key][0]) {
      files[key] = req.files[key][0];
      fileKeys[key] = req.files[key][0]['location'];
    }
  }
  if (!pdf) {
    // delete files
    deleteFiles(fileKeys);
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }

  const filesToRemove = {};
  if (files['pdf']) {
    filesToRemove['pdf'] = pdf.url;
    pdf['type'] = files['pdf'].mimetype;
    pdf['url'] = files['pdf'].location;
    pdf['key'] = files['pdf'].key;
    delete pdf['original_id'];
    pdf['version'] += 1;
  }

  if (files['preview']) {
    filesToRemove['preview'] = pdf.preview;
    pdf['preview'] = files['preview'].location;
  }

  if (files['site_image']) {
    filesToRemove['site_image'] = pdf.site_image;
    pdf['site_image'] = files['site_image'].location;
  }

  const editData = { ...req.body };
  delete editData.preview;

  if (req.body.preview && req.body.preview.startsWith('data:image')) {
    try {
      const today = new Date();
      const year = today.getYear();
      const month = today.getMonth();
      const preview_image = await uploadBase64Image(
        req.body.preview,
        'preview' + year + '/' + month
      );
      filesToRemove['preview'] = pdf.preview;
      pdf['preview'] = preview_image;
    } catch (error) {
      console.error('Upload PDF Preview Image', error);
    }
  }

  for (const key in editData) {
    pdf[key] = editData[key];
  }

  if (editData['folder']) {
    await Folder.updateOne(
      { _id: editData['folder'], user: currentUser._id },
      { $addToSet: { pdfs: { $each: [pdf['_id']] } } }
    );
  }

  pdf
    .save()
    .then((_pdf) => {
      console.log('_pdf', _pdf);
      deleteFiles(filesToRemove, true);
      return res.send({
        status: true,
        data: _pdf,
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

/**
 * Delete the unneccessary files
 * @param {*} files: {pdf: file location, preview: file location, site_image: file location}
 * @param {*} shouldCheck: boolean (decide to check)
 */
const deleteFiles = (files, shouldCheck = false) => {
  if (files['pdf']) {
    const key = new URL(files['pdf']).pathname;
    if (!shouldCheck) {
      // remove file
      deleteS3Object(key);
    }
    PDF.countDocuments({ url: files['pdf'], del: false }).then((count) => {
      if (!count) {
        // remove
        deleteS3Object(key);
      }
    });
  }
  if (files['preview']) {
    const key = new URL(files['preview']).pathname;
    if (!shouldCheck) {
      // remove file
      deleteS3Object(key);
    }
    PDF.countDocuments({ preview: files['preview'], del: false }).then(
      (count) => {
        if (!count) {
          // remove
          deleteS3Object(key);
        }
      }
    );
  }
  if (files['site_image']) {
    const key = new URL(files['site_image']).pathname;
    if (!shouldCheck) {
      // remove file
      deleteS3Object(key);
    }
    PDF.countDocuments({ site_image: files['site_image'], del: false }).then(
      (count) => {
        if (!count) {
          // remove
          deleteS3Object(key);
        }
      }
    );
  }
};

/**
 * Delete bucket file
 * @param {*} key: string
 */
const deleteS3Object = (key) => {
  return removeFile(key, function (err, data) {
    console.log('err', err);
  });
};

const get = async (req, res) => {
  const pdf = await PDF.findOne({ _id: req.params.id });
  const user = await User.findOne({ _id: pdf.user });
  if (!pdf) {
    return res.status(400).json({
      status: false,
      error: 'PDF doesn`t exist',
    });
  }
  const myJSON = JSON.stringify(pdf);
  const data = JSON.parse(myJSON);
  Object.assign(data, { user });

  res.send({
    status: true,
    data,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const garbage = await garbageHelper.get(currentUser);
  let editedPDFs = [];
  if (garbage && garbage['edited_pdf']) {
    editedPDFs = garbage['edited_pdf'];
  }

  const company = currentUser.company || 'eXp Realty';
  const _pdf_list = await PDF.find({ user: currentUser.id, del: false }).sort({
    created_at: 1,
  });
  const _pdf_admin = await PDF.find({
    role: 'admin',
    del: false,
    _id: { $nin: editedPDFs },
    company,
  }).sort({
    created_at: 1,
  });
  Array.prototype.push.apply(_pdf_list, _pdf_admin);

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  }).populate('pdfs');

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      Array.prototype.push.apply(_pdf_list, team.pdfs);
    }
  }

  if (!_pdf_list) {
    return res.status(400).json({
      status: false,
      error: 'PDF doesn`t exist',
    });
  }
  const _pdf_detail_list = [];

  for (let i = 0; i < _pdf_list.length; i++) {
    const _pdf_detail = await PDFTracker.aggregate([
      {
        $lookup: {
          from: 'pdfs',
          localField: 'pdf',
          foreignField: '_id',
          as: 'pdf_detail',
        },
      },
      {
        $match: {
          pdf: _pdf_list[i]._id,
          user: currentUser._id,
        },
      },
    ]);

    // const view = await PDFTracker.countDocuments({
    //   pdf: _pdf_list[i]._id,
    //   user: currentUser._id,
    // });

    const myJSON = JSON.stringify(_pdf_list[i]);
    const _pdf = JSON.parse(myJSON);
    const pdf_detail = await Object.assign(_pdf, { views: _pdf_detail.length });
    _pdf_detail_list.push(pdf_detail);
  }

  return res.send({
    status: true,
    data: _pdf_detail_list,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  try {
    const pdf = await PDF.findOne({ _id: req.params.id, user: currentUser.id });

    if (pdf) {
      const error_message = [];
      const automations = await Automation.find({
        user: currentUser.id,
        'meta.pdfs': pdf.id,
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
        return res.json({
          status: true,
          failed: [
            {
              material: {
                id: pdf.id,
                title: pdf.title,
                type: 'pdf',
                thumbnail: pdf.thumbnail,
                preview: pdf.preview,
              },
              error_message,
            },
          ],
        });
      }

      if (pdf.role === 'team') {
        Team.updateOne(
          { pdfs: req.params.id },
          {
            $pull: { pdfs: { $in: [req.params.id] } },
          }
        ).catch((err) => {
          console.log('err', err.message);
        });
      }

      PDF.updateOne(
        {
          _id: req.params.id,
        },
        {
          $set: { del: true },
        }
      )
        .then(async () => {
          let hasSamePdf = false;
          const samePdfs = await PDF.find({
            del: false,
            url: pdf['url'],
          }).catch((err) => {
            console.log('same video getting error');
          });
          if (samePdfs && samePdfs.length) {
            hasSamePdf = true;
          }
          if (!hasSamePdf) {
            removeFile(pdf.key, function (err, data) {
              console.log('err', err);
            });
          }
        })
        .catch((err) => {
          console.log('pdf update err', err.message);
        });

      return res.send({
        status: true,
      });
    } else {
      return res.status(400).send({
        status: false,
        error: 'invalid permission',
      });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).send({
      status: false,
      error: 'internal_server_error',
    });
  }
};

const getHistory = async (req, res) => {
  const { currentUser } = req;
  const _activity_list = await Activity.aggregate([
    {
      $lookup: {
        from: 'contacts',
        localField: 'contacts',
        foreignField: '_id',
        as: 'pdf_detail',
      },
    },
    {
      $match: { pdf: req.params.id, user: currentUser.id },
    },
  ]);
  for (let i = 0; i < _activity_list.length; i++) {
    const _pdf_tracker = PDFTracker.find({
      contact: _activity_list[i].contact,
      pdf: req.params.id,
      user: currentUser.id,
    });
    _activity_list[i].pdf_tracker = _pdf_tracker;
  }
  if (_activity_list) {
    res.send({
      status: true,
      data: {
        data: _activity_list,
      },
    });
  } else {
    res.status(404).send({
      status: false,
      error: 'Activity not found',
    });
  }
};

const createSmsContent = async (req, res) => {
  const { currentUser } = req;
  const { content, pdfs, contacts } = req.body;

  const _contact = await Contact.findOne({ _id: contacts[0] }).catch((err) => {
    console.log('err', err);
  });
  let pdf_titles = '';
  let pdf_descriptions = '';
  let pdf_objects = '';
  let pdf_content = content;
  let activity;
  let assignee;
  if (_contact.owner) {
    assignee = await User.findOne({
      _id: _contact.owner,
    });
  }
  for (let j = 0; j < pdfs.length; j++) {
    const pdf = pdfs[j];

    if (typeof pdf_content === 'undefined') {
      pdf_content = '';
    }
    const tokenData = {
      currentUser,
      contact: _contact,
      assignee,
    };

    pdf_content = replaceToken(pdf_content, tokenData);

    const _activity = new Activity({
      content: 'sent pdf using sms',
      contacts: contacts[0],
      user: currentUser.id,
      type: 'pdfs',
      pdfs: pdf._id,
      created_at: new Date(),
      updated_at: new Date(),
      description: pdf_content,
    });

    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });

    const material_view_pdf_link =
      currentUser.source === 'vortex'
        ? urls.VORTEX_MATERIAL_VIEW_PDF_URL
        : urls.MATERIAL_VIEW_PDF_URL;
    const pdf_link = material_view_pdf_link + activity.id;

    if (j < pdfs.length - 1) {
      pdf_titles = pdf_titles + pdf.title + ', ';
      pdf_descriptions += `${pdf.description}, `;
    } else {
      pdf_titles += pdf.title;
      pdf_descriptions += pdf.description;
    }
    const pdf_object = `\n${pdf.title}:\n${pdf_link}\n`;
    pdf_objects += pdf_object;
  }

  if (pdf_content.search(/{pdf_object}/gi) !== -1) {
    pdf_content = pdf_content.replace(/{pdf_object}/gi, pdf_objects);
  } else {
    pdf_content += pdf_objects;
  }

  if (pdf_content.search(/{pdf_title}/gi) !== -1) {
    pdf_content = pdf_content.replace(/{pdf_title}/gi, pdf_titles);
  }

  if (pdf_content.search(/{pdf_description}/gi) !== -1) {
    pdf_content = pdf_content.replace(/{pdf_description}/gi, pdf_descriptions);
  }

  return res.send({
    status: true,
    data: pdf_content,
  });
};

const getEasyLoad = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const pdfs = await PDF.find({
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
    data: pdfs,
  });
};

const createPDF = async (req, res) => {
  let preview;
  const { currentUser } = req;

  await checkMaterialCount(currentUser, res);

  if (req.body.preview && req.body.preview.indexOf('teamgrow.s3') === -1) {
    try {
      const today = new Date();
      const year = today.getYear();
      const month = today.getMonth();
      preview = await uploadBase64Image(
        req.body.preview,
        'preview' + year + '/' + month
      );
    } catch (error) {
      console.error('Upload PDF Preview Image', error);
    }
  } else {
    preview = req.body.preview;
  }

  const pdf = new PDF({
    ...req.body,
    preview,
    user: req.currentUser.id,
  });

  if (req.body.shared_pdf) {
    PDF.updateOne(
      {
        _id: req.body.shared_pdf,
      },
      {
        $set: {
          has_shared: true,
          shared_pdf: pdf.id,
        },
      }
    ).catch((err) => {
      console.log('pdf update err', err.message);
    });
  } else if (req.body.default_edited) {
    // Update Garbage
    const garbage = await garbageHelper.get(currentUser);
    if (!garbage) {
      return res.status(400).send({
        status: false,
        error: `Couldn't get the Garbage`,
      });
    }

    if (garbage['edited_pdf']) {
      garbage['edited_pdf'].push(req.body.default_pdf);
    } else {
      garbage['edited_pdf'] = [req.body.default_pdf];
    }
  }

  const _pdf = await pdf
    .save()
    .then()
    .catch((err) => {
      console.log('err', err);
    });

  const response = { ..._pdf._doc };
  if (req.body.folder) {
    const updateResult = await Folder.updateOne(
      { _id: req.body['folder'], user: currentUser._id },
      { $addToSet: { pdfs: { $each: [pdf['_id']] } } }
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
      { $addToSet: { pdfs: { $each: [pdf['_id']] } } }
    );
  }

  res.send({
    status: true,
    data: response,
  });
};

const downloadPDF = async (req, res) => {
  const { currentUser } = req;
  const pdf = await PDF.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!pdf) {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }

  if (!pdf.url) {
    return res.status(400).json({
      status: false,
      error: 'URL not found',
    });
  }
  const options = {
    Bucket: api.AWS.AWS_S3_BUCKET_NAME,
    Key: pdf.key || pdf.url.slice(44),
  };

  res.attachment(pdf.url.slice(44));
  const headObjectCommand = new HeadObjectCommand(options);
  s3.send(headObjectCommand, async (error, data) => {
    if (error) {
      return res.status(500).json({
        status: false,
        error,
      });
    }
    if (data) {
      const getObjectCommand = new GetObjectCommand();
      const fileStream = await s3.send(getObjectCommand);
      fileStream.Body.pipe(res);
    }
  });
};

const getAnalytics = async (req, res) => {
  const { currentUser } = req;

  const pdf = await PDF.findOne({ _id: req.params.id });
  const sent_activity = await Activity.find({
    pdfs: req.params.id,
    user: currentUser.id,
    type: 'pdfs',
    $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
  }).populate('contacts');

  const watched_activity = await PDFTracker.find({
    pdf: req.params.id,
    user: currentUser.id,
  }).populate({ path: 'contact', model: Contact });

  const watched_contacts = await PDFTracker.aggregate([
    {
      $match: {
        pdf: mongoose.Types.ObjectId(req.params.id),
        user: mongoose.Types.ObjectId(currentUser.id),
      },
    },
    {
      $group: {
        _id: { contact: '$contact' },
      },
    },
  ]);

  const contacts_detail = await Contact.populate(watched_contacts, {
    path: '_id.contact',
  });

  const track_activity = await Activity.find({
    pdfs: req.params.id,
    user: currentUser.id,
    type: 'pdfs',
    content: 'generated link',
  })
    .populate('contacts')
    .populate({ path: 'pdf_trackers', model: PDFTracker });

  return res.send({
    status: true,
    data: {
      pdf,
      sent_activity,
      watched_activity,
      watched_contacts: contacts_detail,
      track_activity,
    },
  });
};

module.exports = {
  create,
  createPDF,
  updateDetail,
  get,
  getEasyLoad,
  getAll,
  getAnalytics,
  createSmsContent,
  remove,
  getHistory,
  downloadPDF,
};
