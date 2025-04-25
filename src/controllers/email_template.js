const mongoose = require('mongoose');
const { S3Client } = require('@aws-sdk/client-s3');
const EmailTemplate = require('../models/email_template');
const Garbage = require('../models/garbage');
const Team = require('../models/team');
const Folder = require('../models/folder');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const User = require('../models/user');
const { getTextMaterials } = require('../helpers/utility');
const _ = require('lodash');
const { PACKAGE } = require('../constants/package');
const api = require('../configs/api');

const {
  getAllFolders,
  getPrevFolder,
  getParentFolder,
} = require('../helpers/folder');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const get = async (req, res) => {
  const { id } = req.params;
  let video_ids = [];
  let pdf_ids = [];
  let image_ids = [];
  const template = await EmailTemplate.findOne({ _id: id }).catch(() => {});
  if (!template) {
    return res.status(400).json({
      status: false,
      error: 'Template doesn`t exist',
    });
  }
  if (template.type === 'email') {
    video_ids = template.video_ids || [];
    pdf_ids = template.pdf_ids || [];
    image_ids = template.image_ids || [];
  } else {
    const { videoIds, pdfIds, imageIds } = getTextMaterials(template.content);
    video_ids = videoIds;
    pdf_ids = pdfIds;
    image_ids = imageIds;
  }
  const videos = await Video.find({ _id: { $in: video_ids } }).catch(() => {});
  const pdfs = await PDF.find({ _id: { $in: pdf_ids } }).catch(() => {});
  const images = await Image.find({ _id: { $in: image_ids } }).catch(() => {});

  const data = { ...template._doc };
  data.video_ids = videos;
  data.pdf_ids = pdfs;
  data.image_ids = images;

  res.send({
    status: true,
    data,
  });
};

const getTemplates = async (req, res) => {
  const { currentUser } = req;
  const { page } = req.params;
  const team_templates = [];
  const teams = await Team.find({ members: currentUser.id });

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      if (team.email_templates) {
        Array.prototype.push.apply(team_templates, team.email_templates);
      }
    }
  }

  const templates = await EmailTemplate.find({
    $or: [
      { user: currentUser.id },
      { role: 'admin' },
      { _id: { $in: team_templates } },
    ],
  })
    .skip((page - 1) * 10)
    .limit(10);

  const total = await EmailTemplate.countDocuments({
    $or: [{ user: currentUser.id }, { role: 'admin' }],
  });
  return res.json({
    status: true,
    data: templates,
    total,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;

  const company = currentUser.company || 'eXp Realty';

  const email_templates = await EmailTemplate.find({
    user: currentUser.id,
  });

  const _template_admin = await EmailTemplate.find({
    role: 'admin',
    company,
  });

  Array.prototype.push.apply(email_templates, _template_admin);

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  }).populate('email_templates');

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      Array.prototype.push.apply(email_templates, team.email_templates);
    }
  }

  if (!email_templates) {
    return res.status(400).json({
      status: false,
      error: 'Templates doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: email_templates,
  });
};

const loadLibrary = async (req, res) => {
  const { currentUser } = req;
  const { folder, team_id } = req.body;
  let { search } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }

  let root_folder;
  let team_folders;
  let prevId = '';
  let template_list = [];
  let folder_list = [];

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  });
  let team;
  if (!folder || folder === 'root') {
    const teamIds = [];
    teams.forEach((e) => {
      teamIds.push(e._id);
    });
    team_folders = await Folder.find({
      role: 'team',
      del: false,
      team: { $in: teamIds },
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const admin_folder = await Folder.findOne({
      rootFolder: true,
      role: 'admin',
      del: false,
    });
    root_folder = {
      ...admin_folder._doc,
    };
    const companyFolders = await Folder.find(
      {
        _id: { $in: root_folder.folders },
        company: currentUser.company,
      },
      { _id: 1 }
    ).catch((err) => {});
    const companyFolderIds = (companyFolders || []).map((e) => e._id);
    root_folder.folders = companyFolderIds;
    team_folders.forEach((e) => {
      root_folder.folders.push(e._id);
    });
  } else {
    root_folder = await Folder.findById(folder);
    if (root_folder.team || team_id) {
      team = await Team.findById(team_id).select({
        _id: 1,
        name: 1,
        folders: 1,
      });
    }
    prevId = await getPrevFolder(team, root_folder);
  }

  const template_query = {
    _id: { $in: root_folder.templates },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    $or: [{ type: 'template' }, { team: { $exists: true }, role: 'team' }],
    del: { $ne: true },
  };

  if (search) {
    folder_list = await getAllFolders(
      'template',
      root_folder.folders,
      root_folder.folders
    );

    let templateIds = root_folder.templates;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_list.length; i++) {
      templateIds = [...templateIds, ...folder_list[i].templates];
      folderIds = [...folderIds, ...folder_list[i].folders];
    }
    template_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    template_query['_id'] = { $in: templateIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
  template_list = await EmailTemplate.find(template_query)
    .select('-content')
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const templateIds = template_list.map((_template) => _template._id);
  const templatesInfo = await EmailTemplate.aggregate([
    { $match: { original_id: { $in: templateIds }, del: { $ne: true } } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const templateDownloadCount = {};
  templatesInfo.forEach((e) => {
    templateDownloadCount[e._id] = e.count;
  });

  const materialOwnerIds = [];
  folder_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  template_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  const _material_owners = await User.find({
    _id: { $in: materialOwnerIds },
  }).select('_id user_name');
  const _material_owner_objects = {};
  _material_owners.forEach((e) => {
    _material_owner_objects[e._id] = e;
  });

  const folders = (folder_list || []).map((e) => {
    return {
      ...e._doc,
      isFolder: true,
      item_type: 'folder',
      owner: _material_owner_objects[e.user],
      team_info: team,
    };
  });

  const template_detail_list = [];
  for (let i = 0; i < template_list.length; i++) {
    let template_detail = template_list[i]._doc || template_list[i];
    template_detail = {
      ...template_detail,
      item_type: template_detail.type,
      downloads: templateDownloadCount[template_detail._id] || 0,
      owner: _material_owner_objects[template_detail.user],
      team_info: team,
    };
    template_detail_list.push(template_detail);
  }
  const templates = [...folders, ...template_detail_list];

  return res.send({
    status: true,
    data: {
      results: templates,
      prevFolder: prevId,
      team,
    },
  });
};
const createVideo = async (currentUser, videoP) => {
  let count = 0;
  let max_upload_count = 0;
  if (!currentUser.material_info['is_enabled']) {
    return;
  }
  if (currentUser.material_info['is_limit']) {
    const userVideoCount = await Video.countDocuments({
      user: currentUser.id,
      uploaded: false,
      del: false,
    });
    const userPDFCount = await PDF.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const userImageCount = await Image.countDocuments({
      user: currentUser.id,
      del: false,
    });
    count = userVideoCount + userPDFCount + userImageCount;
    max_upload_count =
      currentUser.material_info.upload_max_count ||
      PACKAGE.PRO.material_info.upload_max_count;
  }
  if (currentUser.material_info['is_limit'] && max_upload_count <= count) {
    console.log('limited', max_upload_count, count);
    return;
  }
  const video = new Video({
    ...videoP,
    converted: 'completed',
    user: currentUser.id,
    created_at: new Date(),
  });
  const _video = await video.save().catch((err) => {
    console.log('err', err);
  });
  const response = { ..._video._doc };
  return response;
};

const createPDF = async (currentUser, pdfP) => {
  let count = 0;
  let max_upload_count = 0;
  if (!currentUser.material_info['is_enabled']) {
    return;
  }
  if (currentUser.material_info['is_limit']) {
    const userVideoCount = await Video.countDocuments({
      user: currentUser.id,
      uploaded: false,
      del: false,
    });
    const userPDFCount = await PDF.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const userImageCount = await Image.countDocuments({
      user: currentUser.id,
      del: false,
    });
    count = userVideoCount + userPDFCount + userImageCount;
    max_upload_count =
      currentUser.material_info.upload_max_count ||
      PACKAGE.PRO.material_info.upload_max_count;
  }
  if (currentUser.material_info['is_limit'] && max_upload_count <= count) {
    return;
  }
  if (pdfP.capture_form) {
    if (typeof pdfP.capture_form === 'string') {
      const capture_form = {};
      capture_form[pdfP['capture_form']] = 0;
      pdfP['capture_form'] = capture_form;
    } else if (Array.isArray(pdfP.capture_form)) {
      const capture_form = {};
      pdfP.capture_form.forEach((e) => {
        capture_form[e] = 0;
      });
      pdfP.capture_form = capture_form;
    }
  }
  const pdf = new PDF({
    ...pdfP,
    user: currentUser.id,
  });
  const _pdf = await pdf.save().catch((err) => {
    console.log('err', err);
  });
  const response = { ..._pdf._doc };
  return response;
};

const createImage = async (currentUser, imageP) => {
  let count = 0;
  let max_upload_count = 0;
  if (!currentUser.material_info['is_enabled']) {
    return;
  }
  if (currentUser.material_info['is_limit']) {
    const userVideoCount = await Video.countDocuments({
      user: currentUser.id,
      uploaded: false,
      del: false,
    });
    const userPDFCount = await PDF.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const userImageCount = await Image.countDocuments({
      user: currentUser.id,
      del: false,
    });
    count = userVideoCount + userPDFCount + userImageCount;
    max_upload_count =
      currentUser.material_info.upload_max_count ||
      PACKAGE.PRO.material_info.upload_max_count;
  }
  if (currentUser.material_info['is_limit'] && max_upload_count <= count) {
    return;
  }
  if (imageP.capture_form) {
    if (typeof imageP.capture_form === 'string') {
      const capture_form = {};
      capture_form[imageP['capture_form']] = 0;
      imageP['capture_form'] = capture_form;
    } else if (Array.isArray(imageP.capture_form)) {
      const capture_form = {};
      imageP.capture_form.forEach((e) => {
        capture_form[e] = 0;
      });
      imageP.capture_form = capture_form;
    }
  }
  const image = new Image({
    ...imageP,
    user: currentUser.id,
  });
  const _image = await image.save().catch((err) => {
    console.log('err', err);
  });
  const response = { ..._image._doc };
  return response;
};

const createTemplate = async (req, res) => {
  const { currentUser } = req;

  let old_video_ids = req.body.video_ids;
  let old_pdf_ids = req.body.pdf_ids;
  let old_image_ids = req.body.image_ids;
  let new_content = req.body.content;
  const is_sharable = req.body.is_sharable;
  if (req.body.type === 'text') {
    const { videoIds, pdfIds, imageIds } = getTextMaterials(req.body.content);
    old_video_ids = videoIds;
    old_pdf_ids = pdfIds;
    old_image_ids = imageIds;
  }
  const new_video_ids = [];
  const new_pdf_ids = [];
  const new_image_ids = [];

  if (old_video_ids) {
    for (let i = 0; i < old_video_ids.length; i++) {
      let video = await Video.findOne({
        original_id: old_video_ids[i],
        user: currentUser.id,
        del: false,
      }).catch((err) => {
        console.log('err', err.message);
      });
      if (!video) {
        let tmpVideo = await Video.findOne({
          _id: old_video_ids[i],
        }).catch((err) => {
          console.log('err', err.message);
        });
        tmpVideo.original_id = tmpVideo._id;
        tmpVideo.is_sharable = is_sharable;
        tmpVideo.is_download = is_sharable;
        tmpVideo = _.omit(tmpVideo._doc, [
          '_id',
          'company',
          'is_draft',
          'role',
        ]);
        video = await createVideo(currentUser, tmpVideo);
      }
      if (video) {
        new_video_ids.push(video._id);
        new_content = new_content.replace(old_video_ids[i], video._id);
      }
    }
  }
  if (old_pdf_ids) {
    for (let i = 0; i < old_pdf_ids.length; i++) {
      let pdf = await PDF.findOne({
        original_id: old_pdf_ids[i],
        user: currentUser.id,
        del: false,
      }).catch((err) => {
        console.log('err', err.message);
      });
      if (!pdf) {
        let tmpPdf = await PDF.findOne({
          _id: old_pdf_ids[i],
        }).catch((err) => {
          console.log('err', err.message);
        });
        tmpPdf.original_id = tmpPdf._id;
        tmpPdf.is_sharable = is_sharable;
        tmpPdf.is_download = is_sharable;
        tmpPdf = _.omit(tmpPdf._doc, ['_id', 'company', 'is_draft', 'role']);
        pdf = await createPDF(currentUser, tmpPdf);
      }
      if (pdf) {
        new_pdf_ids.push(pdf._id);
        new_content = new_content.replace(old_pdf_ids[i], pdf._id);
      }
    }
  }
  if (old_image_ids) {
    for (let i = 0; i < old_image_ids.length; i++) {
      let image = await Image.findOne({
        original_id: old_image_ids[i],
        user: currentUser.id,
        del: false,
      }).catch((err) => {
        console.log('err', err.message);
      });
      if (!image) {
        let tmpImage = await Image.findOne({
          _id: old_image_ids[i],
        }).catch((err) => {
          console.log('err', err.message);
        });
        tmpImage.original_id = tmpImage._id;
        tmpImage.is_sharable = is_sharable;
        tmpImage.is_download = is_sharable;
        tmpImage = _.omit(tmpImage._doc, [
          '_id',
          'company',
          'is_draft',
          'role',
        ]);
        image = await createImage(currentUser, tmpImage);
      }
      if (image) {
        new_image_ids.push(image._id);
        new_content = new_content.replace(old_image_ids[i], image._id);
      }
    }
  }

  const template = new EmailTemplate({
    ...req.body,
    user: currentUser.id,
    video_ids: new_video_ids,
    pdf_ids: new_pdf_ids,
    image_ids: new_image_ids,
    content: new_content,
    updated_at: new Date(),
    created_at: new Date(),
  });

  template
    .save()
    .then(async (_t) => {
      if (req.body.folder) {
        await Folder.updateOne(
          { _id: req.body['folder'], user: currentUser._id, type: 'template' },
          { $addToSet: { templates: { $each: [_t._id] } } }
        ).catch((err) => {
          console.log('folder update is failed');
        });
      }

      return res.send({
        status: true,
        data: _t,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        error: err.message || JSON.stringify(err),
      });
    });
};

const create = async (req, res) => {
  const { currentUser } = req;
  // const errors = validationResult(req)
  // if (!errors.isEmpty()) {
  //   return res.status(400).json({
  //     status: false,
  //     error: errors.array()
  //   })
  // }

  const template = new EmailTemplate({
    ...req.body,
    user: currentUser.id,
    updated_at: new Date(),
    created_at: new Date(),
    _id: undefined,
  });

  template
    .save()
    .then(async (_t) => {
      if (req.body.folder) {
        await Folder.updateOne(
          { _id: req.body['folder'], user: currentUser._id, type: 'template' },
          { $addToSet: { templates: { $each: [_t._id] } } }
        ).catch((err) => {
          console.log('folder update is failed');
        });
      } else {
        await Folder.updateOne(
          { user: currentUser._id, rootFolder: true },
          { $addToSet: { templates: { $each: [_t._id] } } }
        ).catch((err) => {
          console.log('folder update is failed');
        });
      }

      return res.send({
        status: true,
        data: _t,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        error: err.message || JSON.stringify(err),
      });
    });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;
  EmailTemplate.find({ _id: id, user: currentUser.id })
    .updateOne({ $set: { ...req.body } })
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Update Error',
      });
    });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const { currentUser } = req;
  const errors = [];
  const email_template = await EmailTemplate.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!email_template) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission.',
    });
  }

  const error_message = [];
  const teams = await Team.find({
    email_templates: email_template.id,
  });

  if (teams.length > 0) {
    error_message.push({
      reason: 'shared teams',
      teams,
    });
  }

  if (error_message.length > 0) {
    errors.push({
      id: email_template.id,
      title: email_template.title,
      error_message,
    });
  }

  // if (email_template.role === 'team') {
  //   Team.updateOne(
  //     { email_templates: req.params.id },
  //     {
  //       $pull: { email_templates: { $in: [req.params.id] } },
  //     }
  //   ).catch((err) => {
  //     console.log('template update err', err.message);
  //   });
  // }

  if (errors.length > 0) {
    return res.json({
      status: true,
      failed: errors,
    });
  } else {
    const garbage = await Garbage.findOne({ user: currentUser.id });
    if (garbage) {
      if (garbage.canned_message) {
        const canned_message = garbage.canned_message;
        if (
          canned_message.sms &&
          canned_message.sms.toString() === req.params.id
        ) {
          await Garbage.updateOne(
            {
              user: currentUser.id,
            },
            {
              $unset: { 'canned_message.sms': 1 },
            }
          ).catch((err) => {
            console.log('default text template remove err', err.message);
          });
        }
        if (
          canned_message.email &&
          canned_message.email.toString() === req.params.id
        ) {
          await Garbage.updateOne(
            {
              user: currentUser.id,
            },
            {
              $unset: { 'canned_message.email': 1 },
            }
          ).catch((err) => {
            console.log('default email template remove err', err.message);
          });
        }
      }
    }

    EmailTemplate.deleteOne({ _id: id, user: currentUser.id })
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message || 'Remove Template Error',
        });
      });
  }
};

const bulkRemove = async (req, res) => {
  const { folder, ids, folders } = req.body;
  const { currentUser } = req;
  const promise_array = [];

  let allFolders = [];
  let allTemplates = ids || [];
  if ((folders || []).length) {
    allFolders = await getAllFolders('template', folders, folders);
  }
  allFolders.forEach((e) => {
    allTemplates = [...allTemplates, ...e.templates];
  });

  const garbage = await Garbage.findOne({ user: currentUser.id });
  for (let i = 0; i < allTemplates.length; i++) {
    const promise = new Promise(async (resolve) => {
      const email_template = await EmailTemplate.findOne({
        _id: allTemplates[i],
        user: currentUser.id,
      });

      if (email_template) {
        await Team.updateOne(
          { email_templates: allTemplates[i] },
          {
            $pull: { email_templates: { $in: [allTemplates[i]] } },
          }
        ).catch((err) => {
          console.log('err', err.message);
        });

        if (garbage) {
          if (garbage.canned_message) {
            if (
              garbage.canned_message.email &&
              garbage.canned_message.email.toString() === allTemplates[i]
            ) {
              await Garbage.updateOne(
                {
                  user: currentUser.id,
                },
                {
                  $unset: { 'canned_message.email': 1 },
                }
              ).catch((err) => {
                console.log('default email template remove err', err.message);
              });
            } else if (
              garbage.canned_message.sms &&
              garbage.canned_message.sms.toString() === allTemplates[i]
            ) {
              await Garbage.updateOne(
                {
                  user: currentUser.id,
                },
                {
                  $unset: { 'canned_message.sms': 1 },
                }
              ).catch((err) => {
                console.log('default text template remove err', err.message);
              });
            }
          }
        }

        await EmailTemplate.deleteOne({
          _id: allTemplates[i],
          user: currentUser.id,
        });
        resolve();
      } else {
        resolve();
      }
    });
    promise_array.push(promise);
  }

  Promise.all(promise_array)
    .then(async () => {
      if (allFolders.length) {
        await Folder.deleteMany({ _id: { $in: allFolders } });
      }
      if (folder) {
        await Folder.updateOne(
          {
            _id: folder,
          },
          {
            $pull: { templates: { $in: allTemplates } },
          }
        );
      } else {
        await Folder.updateOne(
          {
            rootFolder: true,
            user: currentUser.id,
          },
          {
            $pull: { templates: { $in: allTemplates } },
          }
        );
      }
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('template bulk remove err', err.message);
      res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const search = async (req, res) => {
  const { currentUser } = req;
  const str = req.query.q;
  const option = { ...req.body };

  const team_templates = [];
  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  });

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      if (team.email_templates) {
        Array.prototype.push.apply(team_templates, team.email_templates);
      }
    }
  }

  const templates = await EmailTemplate.find({
    $and: [
      option,
      {
        $or: [
          { title: { $regex: `.*${str}.*`, $options: 'i' } },
          { subject: { $regex: `.*${str}.*`, $options: 'i' } },
          { content: { $regex: `.*${str}.*`, $options: 'i' } },
        ],
      },
      {
        $or: [
          { user: currentUser.id },
          { role: 'admin' },
          { _id: { $in: team_templates } },
        ],
      },
    ],
  });

  return res.send({
    status: true,
    data: templates,
  });
};
const ownSearch = async (req, res) => {
  const { currentUser } = req;
  const str = req.query.q;
  const option = { ...req.body };

  const templates = await EmailTemplate.find({
    $and: [
      option,
      {
        $or: [
          { title: { $regex: `.*${str}.*`, $options: 'i' } },
          { subject: { $regex: `.*${str}.*`, $options: 'i' } },
          { content: { $regex: `.*${str}.*`, $options: 'i' } },
        ],
      },
      {
        $or: [{ user: currentUser.id }, { role: 'admin' }],
      },
    ],
  });

  return res.send({
    status: true,
    data: templates,
  });
};

const load = async (req, res) => {
  const { currentUser } = req;

  const templates = await EmailTemplate.find({
    user: currentUser.id,
  });

  const folderArr = await Folder.find({
    user: currentUser._id,
    type: 'template',
  });
  const folders = (folderArr || []).map((e) => {
    return { ...e._doc, isFolder: true };
  });

  return res.json({
    status: true,
    data: [...folders, ...templates],
  });
};

const getParentFolderId = async (req, res) => {
  const { currentUser } = req;
  const { itemId, itemType } = req.body;

  let searchType;
  if (itemType === 'folder') searchType = 'folders';
  else searchType = 'templates';

  const folder_info = await getParentFolder(currentUser.id, itemId, searchType);
  if (folder_info) {
    return res.json({
      status: true,
      data: {
        folderId: folder_info._id,
        rootFolder: folder_info.rootFolder,
      },
    });
  }
  return res.json({
    status: false,
    data: {},
  });
};

const loadOwn = async (req, res) => {
  const { currentUser } = req;
  const { folder } = req.body;
  let { search, loadType, teamOptions } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  if (!loadType) {
    loadType = '';
  }
  if (!teamOptions) {
    teamOptions = [];
  }
  let team_templates = [];
  let team_folders = [];
  if (teamOptions.length) {
    const teams = await Team.find({
      _id: { $in: teamOptions },
    });
    teams.forEach((e) => {
      team_templates = [...team_templates, ...e.email_templates];
      team_folders = [...team_folders, ...e.folders];
    });
  }

  let root_folder;
  let prevId = '';
  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      user: currentUser.id,
      rootFolder: true,
      del: false,
    });
  } else {
    root_folder = await Folder.findOne({
      _id: folder,
      user: currentUser.id,
    });
  }

  if (!root_folder) {
    return res.send({
      status: true,
      data: {
        results: [],
        prevFolder: prevId,
      },
    });
  }
  const prev_folder = await Folder.findOne({
    folders: { $in: root_folder.id },
    role: { $ne: 'team' },
  });
  if (prev_folder && !prev_folder.rootFolder) {
    prevId = prev_folder.id;
  }

  const template_query = {
    del: { $ne: true },
    _id: { $in: root_folder.templates },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'template',
    del: false,
  };
  let template_list = [];
  let folder_list = [];

  if (search || teamOptions.length) {
    folder_list = await getAllFolders(
      'template',
      root_folder.folders,
      root_folder.folders
    );
    let templateIds = root_folder.templates;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_list.length; i++) {
      templateIds = [...templateIds, ...folder_list[i].templates];
      folderIds = [...folderIds, ...folder_list[i].folders];
    }
    if (search) {
      template_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
      folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    }
    if (teamOptions.length) {
      template_query['$or'] = [
        { _id: { $in: team_templates } },
        { team_id: { $in: teamOptions } },
      ];
      folder_query['$or'] = [
        { _id: { $in: team_folders } },
        { team_id: { $in: teamOptions } },
      ];
    }
    template_query['_id'] = { $in: templateIds };
    folder_query['_id'] = { $in: folderIds };
  }
  template_list = await EmailTemplate.find(template_query)
    .select('-content')
    .populate({
      path: 'team_id',
      select: '_id name',
    });
  folder_list = await Folder.find(folder_query).populate({
    path: 'team_id',
    select: '_id name',
  });

  let templates = [];
  let folders = [];
  if (!loadType) {
    const templateIds = template_list.map((e) => e._id + '');
    const folderIds = folder_list.map((e) => e._id + '');
    const teams = await Team.find({
      $or: [
        { email_templates: { $elemMatch: { $in: templateIds } } },
        { folders: { $elemMatch: { $in: folderIds } } },
      ],
    });
    const teamDics = [];
    teams.forEach((_team) => {
      const teamInfo = { _id: _team._id, name: _team.name };
      _team.email_templates.forEach((e) => {
        if (templateIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
      _team.folders.forEach((e) => {
        if (folderIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
    });
    const sharedWithDic = _.groupBy(teamDics, (e) => Object.keys(e)[0]);

    templates = (template_list || []).map((e) => {
      return {
        ...e._doc,
        item_type: e.type,
        shared_with: sharedWithDic[e._id],
      };
    });
    folders = (folder_list || []).map((e) => {
      return {
        ...e._doc,
        item_type: 'folder',
        shared_with: sharedWithDic[e._id],
      };
    });
  } else {
    templates = (template_list || []).map((e) => {
      return { ...e._doc, item_type: e.type };
    });
    folders = (folder_list || []).map((e) => {
      return {
        ...e._doc,
        item_type: 'folder',
      };
    });
  }

  return res.json({
    status: true,
    data: {
      results: [...folders, ...templates],
      prevFolder: prevId,
      currentFolder: root_folder,
    },
  });
};

const getEasyLoad = async (req, res) => {
  const { currentUser } = req;
  const email_templates = await EmailTemplate.find({
    $or: [
      {
        user: mongoose.Types.ObjectId(currentUser.id),
      },
      {
        role: 'admin',
      },
      {
        shared_members: currentUser.id,
      },
    ],
  });

  return res.send({
    status: true,
    data: email_templates,
  });
};

const removeFolder = async (req, res) => {
  const { currentUser } = req;
  const { _id, mode, target } = req.body;

  const folder = await Folder.findOne({ _id, user: currentUser._id }).catch(
    (err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  );

  if (!folder) {
    return res.status(400).send({
      status: false,
      error: 'Not found folder',
    });
  }

  if (mode === 'remove-all') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        const { templates } = oldFolderData;
        EmailTemplate.deleteMany({
          user: currentUser._id,
          _id: { $in: templates },
        });
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else if (mode === 'move-other') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                templates: { $each: oldFolderData.templates },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }

  if (mode === 'only-folder') {
    // Skip
    Folder.deleteOne({ _id })
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};
const removeFolders = async (req, res) => {
  const { currentUser } = req;
  const { folder, ids, mode, target } = req.body;

  const folder_list = await getAllFolders('template', ids, ids);

  let templates = [];
  let folders = [];
  for (let i = 0; i < folder_list.length; i++) {
    const e = folder_list[i];
    templates = [...templates, ...e.templates];
    folders = [...folders, ...e.folders];
  }
  if (mode === 'remove-all') {
    bulkRemove(
      {
        currentUser,
        body: { folder, folders: ids },
      },
      res
    );
  } else if (mode === 'move-other') {
    await Folder.deleteMany({
      _id: { $in: ids },
      user: currentUser._id,
    })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                templates: { $each: templates },
                folders: { $each: folders },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $addToSet: {
                templates: { $each: templates },
                folders: { $each: folders },
              },
            }
          );
        }
        if (folder) {
          await Folder.updateOne(
            { _id: folder },
            {
              $pull: {
                folders: { $in: ids },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $pull: {
                folders: { $in: ids },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};
const downloadFolder = async (req, res) => {
  const { currentUser } = req;
  const { folders, is_sharable } = req.body;

  const folderDocs = await getAllFolders('template', folders, folders);

  const promises = [];
  (folderDocs || []).forEach((_folder) => {
    const createPromise = new Promise((resolve, reject) => {
      const newFolder = { ..._folder._doc };
      newFolder.original_id = _folder._id;
      delete newFolder.role;
      delete newFolder._id;
      delete newFolder.templates;
      newFolder.user = currentUser._id;
      newFolder.is_sharable = is_sharable;
      new Folder(newFolder)
        .save()
        .then(async (_newFolder) => {
          const templatePromises = [];

          const _folderDocs = await Folder.find({
            _id: { $in: _folder.folders },
            type: 'template',
            user: { $ne: currentUser._id },
          }).catch((err) => {
            console.log('folder load', err);
          });
          (_folderDocs || []).forEach((infolder) => {
            const folderPromise = new Promise((resolve, reject) => {
              const newInfolder = { ...infolder._doc };
              newInfolder.original_id = infolder._id;
              delete newInfolder.role;
              delete newInfolder._id;
              newInfolder.user = currentUser._id;
              new Folder(newInfolder)
                .save()
                .then((_newInfolder) => {
                  resolve({ id: _newInfolder._id, type: 'folder' });
                })
                .catch(() => {
                  reject();
                });
            });
            templatePromises.push(folderPromise);
          });
          const templateDocs = await EmailTemplate.find({
            _id: { $in: _folder.templates },
            user: { $ne: currentUser._id },
          }).catch((err) => {
            console.log('template load', err);
          });
          (templateDocs || []).forEach((_template) => {
            const templatePromise = new Promise((resolve, reject) => {
              const newTemplate = { ..._template._doc };
              newTemplate.original_id = _template._id;
              delete newTemplate.role;
              delete newTemplate._id;
              newTemplate.user = currentUser._id;
              newTemplate.is_sharable = is_sharable;
              new EmailTemplate(newTemplate)
                .save()
                .then((_newTemplate) => {
                  resolve({ id: _newTemplate._id, type: 'template' });
                })
                .catch(() => {
                  reject();
                });
            });
            templatePromises.push(templatePromise);
          });
          Promise.all(templatePromises).then(async (templates) => {
            const _templates = templates.filter(
              (item) => item.type === 'template'
            );
            const templateIds = _templates.map((item) => item.id);
            const _folders = templates.filter((item) => item.type === 'folder');
            const folderIds = _folders.map((item) => item.id);
            _newFolder.templates = templateIds;
            _newFolder.folders = folderIds;
            await _newFolder.save().catch(() => {
              console.log('automations register failed');
            });
            if (folders.includes(_newFolder.original_id?.toString())) {
              resolve({ id: _newFolder._id });
            } else {
              resolve();
            }
          });
        })
        .catch(() => {
          reject();
        });
    });
    promises.push(createPromise);
  });

  Promise.all(promises).then(async (data) => {
    const ids = [];
    data.forEach((e) => {
      if (e && e.id) {
        ids.push(e.id);
      }
    });
    await Folder.updateOne(
      { user: currentUser.id, rootFolder: true },
      {
        $addToSet: { folders: { $each: ids } },
      }
    );
    return res.send({
      status: true,
    });
  });
};

const bulkDownload = async (req, res) => {
  const { currentUser } = req;
  const { templates } = req.body;
  const promises = [];
  templates.forEach((template) => {
    const createPromise = new Promise(async (resolve, reject) => {
      let old_video_ids = template.video_ids;
      let old_pdf_ids = template.pdf_ids;
      let old_image_ids = template.image_ids;
      let new_content = template.content;
      const is_sharable = template.is_sharable;
      if (template.type === 'text') {
        const { videoIds, pdfIds, imageIds } = getTextMaterials(
          template.content
        );
        old_video_ids = videoIds;
        old_pdf_ids = pdfIds;
        old_image_ids = imageIds;
      }
      const new_video_ids = [];
      const new_pdf_ids = [];
      const new_image_ids = [];

      if (old_video_ids) {
        for (let i = 0; i < old_video_ids.length; i++) {
          let video = await Video.findOne({
            original_id: old_video_ids[i],
            user: currentUser.id,
            del: false,
          }).catch((err) => {
            console.log('err', err.message);
          });
          if (!video) {
            let tmpVideo = await Video.findOne({
              _id: old_video_ids[i],
            }).catch((err) => {
              console.log('err', err.message);
            });
            tmpVideo.original_id = tmpVideo._id;
            tmpVideo.is_sharable = is_sharable;
            tmpVideo.is_download = is_sharable;
            tmpVideo = _.omit(tmpVideo._doc, [
              '_id',
              'company',
              'is_draft',
              'role',
            ]);
            video = await createVideo(currentUser, tmpVideo);
          }
          if (video) {
            new_video_ids.push(video._id);
            new_content = new_content.replace(old_video_ids[i], video._id);
          }
        }
      }
      if (old_pdf_ids) {
        for (let i = 0; i < old_pdf_ids.length; i++) {
          let pdf = await PDF.findOne({
            original_id: old_pdf_ids[i],
            user: currentUser.id,
            del: false,
          }).catch((err) => {
            console.log('err', err.message);
          });
          if (!pdf) {
            let tmpPdf = await PDF.findOne({
              _id: old_pdf_ids[i],
            }).catch((err) => {
              console.log('err', err.message);
            });
            tmpPdf.original_id = tmpPdf._id;
            tmpPdf.is_sharable = is_sharable;
            tmpPdf.is_download = is_sharable;
            tmpPdf = _.omit(tmpPdf._doc, [
              '_id',
              'company',
              'is_draft',
              'role',
            ]);
            pdf = await createPDF(currentUser, tmpPdf);
          }
          if (pdf) {
            new_pdf_ids.push(pdf._id);
            new_content = new_content.replace(old_pdf_ids[i], pdf._id);
          }
        }
      }
      if (old_image_ids) {
        for (let i = 0; i < old_image_ids.length; i++) {
          let image = await Image.findOne({
            original_id: old_image_ids[i],
            user: currentUser.id,
            del: false,
          }).catch((err) => {
            console.log('err', err.message);
          });
          if (!image) {
            let tmpImage = await Image.findOne({
              _id: old_image_ids[i],
            }).catch((err) => {
              console.log('err', err.message);
            });
            tmpImage.original_id = tmpImage._id;
            tmpImage.is_sharable = is_sharable;
            tmpImage.is_download = is_sharable;
            tmpImage = _.omit(tmpImage._doc, [
              '_id',
              'company',
              'is_draft',
              'role',
            ]);
            image = await createImage(currentUser, tmpImage);
          }
          if (image) {
            new_image_ids.push(image._id);
            new_content = new_content.replace(old_image_ids[i], image._id);
          }
        }
      }
      const new_template = new EmailTemplate({
        ...template,
        user: currentUser.id,
        video_ids: new_video_ids,
        pdf_ids: new_pdf_ids,
        image_ids: new_image_ids,
        content: new_content,
        updated_at: new Date(),
        created_at: new Date(),
      });
      await new_template
        .save()
        .then(async (_t) => {
          if (template.folder) {
            await Folder.updateOne(
              {
                _id: template['folder'],
                user: currentUser._id,
                type: 'template',
              },
              { $addToSet: { templates: { $each: [_t._id] } } }
            ).catch((err) => {
              console.log('folder update is failed');
            });
          } else {
            await Folder.updateOne(
              {
                user: currentUser._id,
                rootFolder: true,
              },
              { $addToSet: { templates: { $each: [_t._id] } } }
            ).catch((err) => {
              console.log('folder update is failed');
            });
          }
          resolve(_t._id);
        })
        .catch((err) => {
          reject();
        });
    });
    promises.push(createPromise);
  });
  Promise.all(promises).then(() => {
    return res.send({
      status: true,
    });
  });
};

const moveFile = async (req, res) => {
  const { currentUser } = req;
  const { files, target, source } = req.body;
  if (source) {
    await Folder.updateOne(
      { _id: source, user: currentUser._id },
      {
        $pull: {
          templates: { $in: files },
        },
      }
    );
  }
  if (target) {
    await Folder.updateOne(
      { _id: target, user: currentUser._id },
      {
        $addToSet: {
          templates: { $each: files },
        },
      }
    );
  }
  return res.send({
    status: true,
  });
};

module.exports = {
  create,
  createTemplate,
  get,
  getAll,
  getEasyLoad,
  loadLibrary,
  update,
  remove,
  getTemplates,
  bulkRemove,
  search,
  load,
  loadOwn,
  ownSearch,
  removeFolder,
  removeFolders,
  moveFile,
  downloadFolder,
  bulkDownload,
  getParentFolderId,
};
