const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('request-promise');
const { v1: uuidv1 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Page = require('../models/page');
const api = require('../configs/api');
const urls = require('../constants/urls');
const User = require('../models/user');
const Garbage = require('../models/garbage');
const { removeFile } = require('../helpers/fileUpload');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const loadDefault = async (req, res) => {
  const templates = await Page.find({ default: true }).catch((err) => {
    throw err;
  });
  if (templates) {
    return res.send({
      status: true,
      data: templates,
    });
  }
  return res.status(400).send({
    status: false,
    error: 'There are no templates',
  });
};

const create = async (req, res) => {
  const { currentUser } = req;
  const { meta, title } = req.body;
  if (meta && meta.base64_image) {
    const base64Data = new Buffer.from(
      meta.base64_image.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const type = meta.base64_image.split(';')[0].split('/')[1];
    const image_name = uuidv1();
    delete meta.base64_image;
    const key = `${image_name}.${type}`;
    const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
    const data = {
      Bucket: 'teamgrow',
      Key: key,
      Body: base64Data,
      ContentEncoding: 'base64',
      ACL: 'public-read',
      ContentType: `image/${type}`,
    };
    try {
      await s3.send(new PutObjectCommand(data));
      meta.image = location;
    } catch (error) {
      console.log(error);
    }
  }

  // Get the same title pages in this user
  let slug = title
    .toLowerCase() // Convert the string to lowercase letters
    .trim() // Remove whitespace from both sides of a string
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/&/g, '-y-') // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-'); // Replace multiple - with single -
  const samePages = await Page.find({
    title: { $regex: new RegExp(`^${title}$`, 'i') },
    user: currentUser.id,
  });
  console.log(samePages);
  if (samePages && samePages.length) {
    slug = `${slug}--${samePages.length}`;
  }

  const page = new Page({
    ...req.body,
    slug: `/${slug}`,
    user: currentUser.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  page
    .save()
    .then((_page) => {
      res.send({
        status: true,
        data: _page,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Page creating is failed.',
      });
    });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;
  const data = req.body;
  const { meta, title } = data;
  if (meta && meta.base64_image) {
    if (meta.image) {
      removeFile(
        meta.image,
        function (err, data) {
          console.log(err);
        },
        'teamgrow'
      );
    }

    const base64Data = new Buffer.from(
      meta.base64_image.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const type = meta.base64_image.split(';')[0].split('/')[1];
    const image_name = uuidv1();
    delete meta.base64_image;
    const key = `${image_name}.${type}`;
    const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
    const imageParam = {
      Bucket: 'teamgrow',
      Key: key,
      Body: base64Data,
      ContentEncoding: 'base64',
      ACL: 'public-read',
      ContentType: `image/${type}`,
    };
    try {
      await s3.send(new PutObjectCommand(imageParam));
      console.log('Location, key', location, key);
      meta.image = location;
    } catch (error) {
      console.log(error);
    }
  }

  let slug = title
    .toLowerCase() // Convert the string to lowercase letters
    .trim() // Remove whitespace from both sides of a string
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/&/g, '-y-') // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-'); // Replace multiple - with single -
  const samePages = await Page.find({
    title: { $regex: new RegExp(`^${title}$`, 'i') },
    user: currentUser.id,
    id: { $ne: id },
  });
  console.log(samePages);
  if (samePages && samePages.length) {
    slug = `${slug}--${samePages.length}`;
  }

  Page.updateOne({ _id: id }, { $set: { ...data, sslug: `/${slug}` } })
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message || 'Page Updating is failed.',
      });
    });
};

const read = (req, res) => {
  const { id } = req.params;

  Page.findOne({ _id: id })
    .then((data) => {
      res.send({
        satus: true,
        data,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Page reading is failed.',
      });
    });
};

const remove = async (req, res) => {
  await Page.deleteOne({ _id: req.params.id }).catch((err) => {
    res.status(400).send({
      status: false,
    });
  });

  res.send({
    status: false,
  });
};

const bulkRemove = async (req, res) => {
  const { ids } = req.body;
  await Page.delete({ _id: { $in: ids } }).catch((err) => {
    res.status(400).send({
      status: false,
    });
  });

  return res.send({
    status: false,
  });
};

const load = async (req, res) => {
  const { currentUser } = req;
  const { page } = req.params;

  const pages = await Page.find({ user: currentUser.id })
    .skip((page - 1) * 10)
    .limit(10)
    .catch((err) => {
      throw err;
    });
  const total = await Page.countDocuments({
    user: currentUser.id,
  });
  if (pages) {
    setTimeout(() => {
      return res.send({
        status: true,
        data: pages,
        total,
      });
    }, 4000);
  } else {
    return res.status(400).send({
      status: false,
      error: 'There are no Pages',
    });
  }
};

const duplicate = (req, res) => {};

const search = async (req, res) => {
  // const condition = req.body;
  // const { currentUser } = req;
  // Automation.find(
  // {$and: [
  //     {
  //         $or: [
  //             {'user': currentUser.id,},
  //             {'role': 'admin'}
  //           ]
  //         },
  //     {
  //         'title': { '$regex': '.*' + condition.search + '.*', '$options': 'i' }
  //     }
  // ]}).then((data) => {
  //     return res.send({
  //         status: true,
  //         data
  //     })
  // }).catch(err => {
  //         res.status(400).send({
  //             status: false
  //         })
  //     })
};

const display = async (req, res, next) => {
  const sub_domain = req.headers['x-subdomain'];
  if (sub_domain !== 'app') {
    const user = await User.findOne({ nick_name: sub_domain }).catch((err) => {
      console.log('err', err);
    });

    if (user) {
      const slug = req.originalUrl;
      const garbage = await Garbage.findOne({ user: user.id }).catch((err) => {
        console.log('err', err);
      });
      let page;
      if (slug === '/' && garbage.index_page) {
        page = await Page.findOne({ _id: garbage.index_page }).catch((err) => {
          console.log('err', err);
        });
        return res.render('page', {
          page,
          user,
        });
      }
      page = await Page.findOne({ slug, user: user.id }).catch((err) => {
        console.log('err', err);
      });
      if (page && user) {
        return res.render('page', {
          page,
          user,
        });
      }
      next();
    } else {
      next();
    }
  } else {
    next();
  }
};
/**
 * Load the templates list from the ucraft
 * @param {*} req
 * @param {*} res
 */
const loadTemplates = (req, res) => {
  request({
    method: 'GET',
    uri: `https://accounts.crmgrow.cloud/api/v1/templates`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  })
    .then((response) => {
      res.send({
        status: true,
        data: response,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

/**
 * Load the site list from the ucraft
 * @param {*} req
 * @param {*} res
 */
const loadSites = (req, res) => {
  const { token } = req.body;

  request({
    method: 'GET',
    uri: `https://accounts.crmgrow.cloud/api/v1/sites?token=${token}`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  })
    .then((response) => {
      res.send({
        status: true,
        data: response,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

/**
 * Create site in ucraft
 * @param {*} req
 * @param {*} res
 */
const createSite = (req, res) => {
  const { token, site, template, plan } = req.body;

  request({
    method: 'POST',
    uri: `https://accounts.crmgrow.cloud/api/v1/sites`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    data: {
      token,
      sitename: site,
      template_id: template,
      plan,
    },
    json: true,
  })
    .then((response) => {
      res.send({
        status: true,
        data: response,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

/**
 * Delete site from ucraft
 * @param {*} req
 * @param {*} res
 */
const deleteSite = (req, res) => {
  const { token } = req.body;
  const { id } = req.params;

  request({
    method: 'DELETE',
    uri: `https://accounts.crmgrow.cloud/api/v1/sites/${id}?token=${token}`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  })
    .then((response) => {
      res.send({
        status: true,
        data: response,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const loadLandingPages = async (req, res) => {
  const { currentUser } = req;

  const max_site_count = currentUser.landing_page_info.max_count || 1;
  const payload = {
    email: currentUser.email,
    userId: currentUser._id,
    projectID: currentUser._id,
    orgID: api.CONVRRT.ORG_ID,
    MAX_SITES_PER_PROJECT: max_site_count,
    isTest: process.env.NODE_ENV !== 'production',
  };
  const builder_token = jwt.sign(payload, api.API_JWT_SECRET);

  let ucrafts = await request({
    method: 'GET',
    uri: `https://accounts.crmgrow.cloud/api/v1/sites?token=${builder_token}`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  }).catch((err) => {
    console.log('error message on ucraft builder token', err.message);
  });

  ucrafts = ucrafts?.length ? ucrafts : [];

  ucrafts.forEach((e) => {
    e.siteUrl = 'https://' + e.site;
    e.thumbnail = 'https://' + e.site + '/p/websiteScreenshot';
  });
  // Convrrt Must be delete later.

  const convrrts = await request({
    method: 'GET',
    uri: `${urls.CONVRRT_DOMAIN}/api/v1/sites?limit=false&offset=0`,
    headers: {
      Authorization: `Bearer ${builder_token}`,
      'Content-Type': 'application/json',
    },
    json: true,
  }).catch((err) => {
    res.status(400).send({
      status: false,
      error: err.message,
    });
  });

  res.send({
    status: true,
    data: [...ucrafts, ...convrrts],
  });
};

module.exports = {
  create,
  read,
  update,
  display,
  remove,
  load,
  bulkRemove,
  search,
  duplicate,
  loadDefault,
  loadLandingPages,
  loadTemplates,
  loadSites,
  createSite,
  deleteSite,
};
