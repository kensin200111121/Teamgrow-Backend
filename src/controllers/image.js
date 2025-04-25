const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');
const EmailTemplate = require('../models/email_template');
const Automation = require('../models/automation');
const api = require('../configs/api');
const urls = require('../constants/urls');
const ImageTracker = require('../models/image_tracker');
const Image = require('../models/image');
const Folder = require('../models/folder');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const User = require('../models/user');
const Team = require('../models/team');
const Garbage = require('../models/garbage');
const garbageHelper = require('../helpers/garbage');
const { checkMaterialCount } = require('../helpers/material');
const { userProfileOutputGuard } = require('../helpers/user');
const { replaceToken } = require('../helpers/utility');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const { uploadBase64Image, removeFile } = require('../helpers/fileUpload');

const create = async (req, res) => {
  const { currentUser } = req;

  await checkMaterialCount(currentUser, res);

  if (req.files) {
    const files = req.files;
    const url = [];
    const key = [];
    for (let i = 0; i < files.length; i++) {
      url.push(files[i].location);
      key.push(files[i].key);
    }

    const { _id } = req.body;
    if (_id) {
      await Image.updateOne(
        {
          _id,
          user: currentUser.id,
        },
        {
          $set: {
            type: files[0].mimetype,
            url,
            key,
          },
        }
      );

      const image = await Image.findOne({
        _id,
        user: currentUser.id,
      });
      res.send({
        status: true,
        data: image,
      });
    } else {
      const image = new Image({
        user: req.currentUser.id,
        type: files[0].mimetype,
        url,
        key,
        role: 'user',
        created_at: new Date(),
      });
      image.save().then(async (data) => {
        await Folder.updateOne(
          {
            user: currentUser._id,
            rootFolder: true,
          },
          { $addToSet: { images: { $each: [data['_id']] } } }
        );
        return res.send({
          status: true,
          data,
        });
      });
    }
  }
};

const updateDetail = async (req, res) => {
  const { currentUser } = req;

  const image = await Image.findOne({
    user: currentUser.id,
    _id: req.params.id,
  });

  if (!image) {
    const fileToRemove = req.files.map((e) => e.key);
    deleteFiles(fileToRemove);
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }

  const editData = { ...req.body };
  let data = {};
  if (req.body.data) {
    data = JSON.parse(req.body.data);
  }
  delete editData.preview;

  if (req.files?.length) {
    const keys = data['keys'] || [];
    const urls = data['urls'] || [];
    const files = req.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const newKeyIndex = keys.indexOf(file.originalname);
      if (newKeyIndex >= 0) {
        // replace with originalname and key
        keys.splice(newKeyIndex, 1, file.key);
      } else {
        keys.push(file.key);
      }
      const newUrlIndex = urls.indexOf(file.originalname);
      if (newUrlIndex >= 0) {
        // replace with originalname and location
        urls.splice(newUrlIndex, 1, file.location);
      } else {
        urls.push(file.location);
      }
    }

    image['type'] = files[0].mimetype;
    image['url'] = urls;
    image['key'] = keys;
    image['version'] += 1;
  }

  if (req.body.preview && req.body.preview.startsWith('data:image')) {
    // base 64 image
    const today = new Date();
    const year = today.getYear();
    const month = today.getMonth();

    const preview_image = await uploadBase64Image(
      req.body.preview,
      'preview' + year + '/' + month
    );
    image['preview'] = preview_image;
  }

  for (const key in editData) {
    image[key] = editData[key];
  }

  if (editData['folder']) {
    await Folder.updateOne(
      { _id: editData['folder'], user: currentUser._id },
      { $addToSet: { images: { $each: [image['_id']] } } }
    );
  }

  if (data['remove'] && data['remove'].length) {
    deleteFiles(data['remove'], true);
  }

  image.save().then((data) => {
    return res.send({
      status: true,
      data,
    });
  });
};

/**
 * Remove the unneccessary files
 * @param {*} files: File Key Array
 * @param {*} shouldCheck
 */
const deleteFiles = (files, shouldCheck = false) => {
  if (shouldCheck) {
    files.forEach((e) => {
      Image.findOne({ key: { $elemMatch: { $in: [e] } } }).then((image) => {
        if (!image) {
          deleteS3Object(e);
        }
      });
    });
  } else {
    files.forEach((e) => {
      deleteS3Object(e);
    });
  }
};

/**
 * Delete bucket file
 * @param {*} key: string
 */
const deleteS3Object = (key) => {
  removeFile(key, function (err, data) {
    console.log('err', err);
  });
};

const get = async (req, res) => {
  const image = await Image.findOne({ _id: req.params.id }).catch((err) => {
    console.log('err', err);
  });
  const user = await User.findOne({ _id: image.user })
    .select({
      email: 1,
      user_name: 1,
      profile_picture: 1,
    })
    .catch((err) => {
      console.log('err', err);
    });
  if (!image) {
    return res.status(400).json({
      status: false,
      error: 'Image doesn`t exist',
    });
  }
  const myJSON = JSON.stringify(image);
  const data = JSON.parse(myJSON);
  Object.assign(data, { user });

  res.send({
    status: true,
    data,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const _image_list = await Image.find({
    user: currentUser.id,
    del: false,
  }).sort({ created_at: 1 });

  const company = currentUser.company || 'eXp Realty';
  const _image_admin = await Image.find({
    role: 'admin',
    del: false,
    company,
  }).sort({
    created_at: 1,
  });
  Array.prototype.push.apply(_image_list, _image_admin);

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  }).populate('images');

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      Array.prototype.push.apply(_image_list, team.images);
    }
  }

  if (!_image_list) {
    return res.status(400).json({
      status: false,
      error: 'Image doesn`t exist',
    });
  }
  const data = [];

  for (let i = 0; i < _image_list.length; i++) {
    // const _pdf_detail = await PDFTracker.aggregate([
    //     {
    //       $lookup:
    //         {
    //         from:  'pdfs',
    //         localField: 'pdf',
    //         foreignField: '_id',
    //         as: "pdf_detail"
    //         }
    //     },
    //     {
    //       $match: {
    //                 "pdf": _pdf_list[i]._id,
    //                 "user": currentUser._id
    //               }
    //     }
    // ])

    const view = await ImageTracker.countDocuments({
      image: _image_list[i]._id,
      user: currentUser._id,
    });

    const myJSON = JSON.stringify(_image_list[i]);
    const _image = JSON.parse(myJSON);
    const image_detail = await Object.assign(_image, { views: view });
    data.push(image_detail);
  }

  res.send({
    status: true,
    data,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  try {
    const image = await Image.findOne({
      _id: req.params.id,
      user: currentUser.id,
    });
    if (image) {
      const urls = image.url;
      const error_message = [];
      const automations = await Automation.find({
        user: currentUser.id,
        'meta.images': image.id,
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
          { image_ids: image.id },
          {
            content: {
              $regex: urls.MAIN_DOMAIN + '/image/' + image.id,
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
        images: image.id,
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
          smartCodes[key].image_ids &&
          smartCodes[key].image_ids.includes(image.id)
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
                id: image.id,
                title: image.title,
                type: 'image',
                thumbnail: image.thumbnail,
                preview: image.preview,
              },
              error_message,
            },
          ],
        });
      }

      // if (image['shared_image']) {
      //   Image.updateOne(
      //     {
      //       _id: image.shared_image,
      //       user: currentUser.id,
      //     },
      //     {
      //       $unset: { shared_image: true },
      //       $set: { has_shared: false },
      //     }
      //   ).catch((err) => {
      //     console.log('default image remove err', err.message);
      //   });
      // } else {
      //   if (image.key) {
      //     const keys = image.key;

      //     for (let i = 0; i < keys.length; i++) {
      //       const key = keys[i];
      //       s3.deleteObject(
      //         {
      //           Bucket: api.AWS.AWS_S3_BUCKET_NAME,
      //           Key: key,
      //         },
      //         function (err, data) {
      //           console.log('err', err);
      //         }
      //       );
      //     }
      //   } else {
      //     for (let i = 0; i < urls.length; i++) {
      //       const url = urls[i];
      //       s3.deleteObject(
      //         {
      //           Bucket: api.AWS.AWS_S3_BUCKET_NAME,
      //           Key: url.slice(44),
      //         },
      //         function (err, data) {
      //           console.log('err', err);
      //         }
      //       );
      //     }
      //   }
      // }

      if (image.role === 'team') {
        Team.updateOne(
          { images: req.params.id },
          {
            $pull: { images: { $in: [req.params.id] } },
          }
        ).catch((err) => {
          console.log('team update err', err);
        });
      }
      /* Remove Image from s3 if it is not duplicated. */
      // Image.updateOne({ _id: image.id }, { $set: { del: true } })
      // .then(async () => {
      //   if (image.key) {
      //     const keys = image.key;
      //     for (let key_index = 0; key_index < keys.length; key_index++) {
      //       const key = keys[key_index];
      //       let hasSameImage = false;
      //       const sameImages = await Image.find({
      //         del: false,
      //         key: {$in : [key]},
      //       }).catch((err) => {
      //         console.log('same image getting error');
      //       });
      //       if (sameImages && sameImages.length) {
      //         hasSameImage = true;
      //       }
      //       if (!hasSameImage) {
      //         console.log(key);
      //         s3.deleteObject(
      //           {
      //             Bucket: api.AWS.AWS_S3_BUCKET_NAME,
      //             Key: key,
      //           },
      //           function (err, data) {
      //             console.log('err', err);
      //           }
      //         );
      //       }
      //     }
      //   }
      // })
      // .catch((err) => {
      //   console.log('image update err', err.message);
      // });
      image['del'] = true;
      image.save();

      res.send({
        status: true,
      });
    } else {
      res.status(400).send({
        status: false,
        error: 'invalid permission',
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).send({
      status: false,
      error: 'internal_server_error',
    });
  }
};

const createSmsContent = async (req, res) => {
  const { currentUser } = req;
  const { content, images, contacts } = req.body;

  const _contact = await Contact.findOne({ _id: contacts[0] }).catch((err) => {
    console.log('err', err);
  });
  let image_titles = '';
  let image_descriptions = '';
  let image_objects = '';
  let image_content = content;
  let activity;
  let assignee;
  if (_contact.owner) {
    assignee = await User.findOne({
      _id: _contact.owner,
    });
  }
  for (let j = 0; j < images.length; j++) {
    const image = images[j];

    if (!image_content) {
      image_content = '';
    }
    const tokenData = {
      currentUser,
      contact: _contact,
      assignee,
    };
    image_content = replaceToken(image_content, tokenData);

    const _activity = new Activity({
      content: 'sent image using sms',
      contacts: contacts[0],
      user: currentUser.id,
      type: 'images',
      images: image._id,
      created_at: new Date(),
      updated_at: new Date(),
      description: image_content,
    });

    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });
    const material_view_image_link =
      currentUser.source === 'vortex'
        ? urls.VORTEX_MATERIAL_VIEW_IMAGE_URL
        : urls.MATERIAL_VIEW_IMAGE_URL;
    const image_link = material_view_image_link + activity.id;

    if (j < images.length - 1) {
      image_titles = image_titles + image.title + ', ';
      image_descriptions += `${image.description}, `;
    } else {
      image_titles += image.title;
      image_descriptions += image.description;
    }
    const image_object = `\n${image.title}:\n${image_link}\n`;
    image_objects += image_object;
  }

  if (image_content.search(/{image_object}/gi) !== -1) {
    image_content = image_content.replace(/{image_object}/gi, image_objects);
  } else {
    console.log('image_objects', image_objects);
    image_content += image_objects;
  }

  if (image_content.search(/{image_title}/gi) !== -1) {
    image_content = image_content.replace(/{image_title}/gi, image_titles);
  }

  if (image_content.search(/{image_description}/gi) !== -1) {
    image_content = image_content.replace(
      /{image_description}/gi,
      image_descriptions
    );
  }

  return res.send({
    status: true,
    data: image_content,
  });
};

const getEasyLoad = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const images = await Image.find({
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
    data: images,
  });
};

const createImage = async (req, res) => {
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
      console.error('Upload Preview Image', error);
    }
  } else {
    preview = req.body.preview;
  }

  const image = new Image({
    ...req.body,
    preview,
    user: currentUser.id,
  });

  if (req.body.shared_image) {
    Image.updateOne(
      {
        _id: req.body.shared_image,
      },
      {
        $set: {
          has_shared: true,
          shared_image: image.id,
        },
      }
    ).catch((err) => {
      console.log('image update err', err.message);
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

    if (garbage['edited_image']) {
      garbage['edited_image'].push(req.body.default_image);
    } else {
      garbage['edited_image'] = [req.body.default_image];
    }
  }

  const _image = await image
    .save()
    .then()
    .catch((err) => {
      console.log('err', err);
    });

  const response = { ..._image._doc };
  if (req.body.folder) {
    const updateResult = await Folder.updateOne(
      { _id: req.body['folder'], user: currentUser._id },
      { $addToSet: { images: { $each: [image['_id']] } } }
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
      { $addToSet: { images: { $each: [image['_id']] } } }
    );
  }

  return res.send({
    status: true,
    data: response,
  });
};

const downloadImage = async (req, res) => {
  const { currentUser } = req;
  const image = await Image.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!image) {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }

  if (!image.url) {
    return res.status(400).json({
      status: false,
      error: 'URL not found',
    });
  }
  const options = {
    Bucket: api.AWS.AWS_S3_BUCKET_NAME,
    Key: image.url.slice(44),
  };

  const getObjectCommand = new GetObjectCommand(options);
  console.log('imgea url', image.url);
  try {
    res.attachment(image.url.slice(44));
    const fileStream = await s3.send(getObjectCommand);
    fileStream.Body.pipe(res);
  } catch (err) {
    console.log('err', err);
  }
};

const getAnalytics = async (req, res) => {
  const { currentUser } = req;

  const image = await Image.findOne({ _id: req.params.id });
  const sent_activity = await Activity.find({
    images: req.params.id,
    user: currentUser.id,
    type: 'images',
    $or: [{ emails: { $exists: true } }, { texts: { $exists: true } }],
  }).populate('contacts');

  const watched_activity = await ImageTracker.find({
    image: req.params.id,
    user: currentUser.id,
  }).populate({ path: 'contact', model: Contact });

  const watched_contacts = await ImageTracker.aggregate([
    {
      $match: {
        image: mongoose.Types.ObjectId(req.params.id),
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
    images: req.params.id,
    user: currentUser.id,
    type: 'images',
    content: 'generated link',
  })
    .populate('contacts')
    .populate({ path: 'image_trackers', model: ImageTracker });
  return res.send({
    status: true,
    data: {
      image,
      sent_activity,
      watched_activity,
      watched_contacts: contacts_detail,
      track_activity,
    },
  });
};

module.exports = {
  create,
  createImage,
  updateDetail,
  get,
  getEasyLoad,
  getAll,
  getAnalytics,
  createSmsContent,
  remove,
  downloadImage,
};
