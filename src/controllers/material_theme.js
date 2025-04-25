const MaterialTheme = require('../models/material_theme');
const Garbage = require('../models/garbage');
const {
  uploadBase64Image,
  downloadFile,
  uploadFile,
  removeFile,
} = require('../helpers/fileUpload');
const urls = require('../constants/urls');
const api = require('../configs/api');
const request = require('request-promise');

const get = async (req, res) => {
  const material_theme = await MaterialTheme.findOne({
    _id: req.params.id,
  }).catch((err) => {
    console.log('material theme err', err.message);
  });

  let json_content;
  if (material_theme.role !== 'admin') {
    const key = material_theme.json_content.slice(urls.STORAGE_BASE.length + 1);
    const data = await downloadFile(key);
    json_content = JSON.parse(Buffer.from(data).toString('utf8'));
  }

  const myJSON = JSON.stringify(material_theme);
  const data = JSON.parse(myJSON);
  return res.send({
    status: true,
    data: {
      ...data,
      json_content,
      project_id: api.UNLAYER.PROJECT_ID,
    },
  });
};

const getAll = (req, res) => {
  const { currentUser } = req;

  MaterialTheme.find({
    $or: [
      {
        user: currentUser.id,
      },
      { role: 'admin' },
    ],
  })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('material found error', err.message);
    });
};

const create = async (req, res) => {
  const { currentUser } = req;
  let thumbnail;
  let html_content;
  let json_content;
  if (req.body.thumbnail) {
    thumbnail = await uploadBase64Image(req.body.thumbnail, 'theme');
  }

  if (req.body.json_content) {
    const content = req.body.json_content;
    json_content = await uploadFile(content, 'json', 'theme');
    console.log('json_content', json_content);
  }

  if (req.body.html_content) {
    const content = req.body.html_content;
    html_content = await uploadFile(content, 'html', 'theme');
  }

  const material_template = new MaterialTheme({
    user: currentUser.id,
    ...req.body,
    thumbnail,
    html_content,
    json_content,
  });

  material_template.save().catch((err) => {
    console.log('material theme save err', err.message);
  });

  return res.send({
    status: true,
    data: material_template,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const editData = { ...req.body };
  const material_theme = MaterialTheme.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });
  if (!material_theme) {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }

  if (req.body.thumbnail) {
    editData['thumbnail'] = await uploadBase64Image(
      req.body.thumbnail,
      'theme'
    );
  }

  if (req.body.json_content) {
    const content = req.body.json_content;
    editData['json_content'] = await uploadFile(content, 'json', 'theme');
  }

  if (req.body.html_content) {
    const content = req.body.html_content;
    editData['html_content'] = await uploadFile(content, 'html', 'theme');
  }
  MaterialTheme.updateOne(
    { _id: req.params.id },
    {
      $set: {
        ...editData,
      },
    }
  ).catch((err) => {
    console.log('material theme update error', err.emssage);
  });
  return res.send({
    status: true,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const material_theme = await MaterialTheme.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });
  if (!material_theme) {
    return res.status(400).json({
      status: false,
      error: 'Invalid permission',
    });
  }
  if (material_theme.json_content) {
    const key = material_theme.json_content.slice(urls.STORAGE_BASE.length + 1);
    await removeFile(key, (err, data) => {
      console.error('File Remove Error: File ID=', err);
    });
  }
  if (material_theme.html_content) {
    const key = material_theme.html_content.slice(urls.STORAGE_BASE.length + 1);
    await removeFile(key, (err, data) => {
      console.error('File Remove Error: File ID=', err);
    });
  }
  MaterialTheme.deleteOne({ _id: req.params.id }).then(() => {
    return res.send({
      status: true,
    });
  });
};

const setVideo = async (req, res) => {
  const { currentUser } = req;
  const { videoId, themeId } = req.body;

  const garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('garbage find error', err.message);
    }
  );

  let material_themes = garbage.material_themes;
  if (material_themes) {
    material_themes[videoId] = themeId;
  } else {
    material_themes = { videoId: themeId };
  }

  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $set: {
        material_themes,
      },
    }
  ).catch((err) => {
    console.log('garbage material theme err', err.message);
  });

  return res.send({
    status: true,
  });
};

const getNewsletters = (req, res) => {
  const { currentUser } = req;

  MaterialTheme.find({
    type: 'newsletter',
    $or: [
      {
        user: currentUser.id,
      },
      { role: 'admin' },
    ],
  })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('material found error', err.message);
    });
};

const getTemplates = (req, res) => {
  const { page, perPage } = req.body;
  const authHeader = `Basic ${Buffer.from(`${api.UNLAYER.API_KEY}:`).toString(
    'base64'
  )}`;

  const options = {
    uri:
      'https://api.unlayer.com/v2/templates?includeDesign=0&page=' +
      page +
      '&perPage=' +
      perPage,
    method: 'GET',
    headers: {
      Authorization: authHeader,
    },
    json: true,
  };
  request(options)
    .then((response) => {
      return res.send({
        status: true,
        ...response,
      });
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      return res.status(400).send({
        status: false,
        error: error.error || error.message,
      });
    });
};

const getTemplate = (req, res) => {
  const { id } = req.body;

  const authHeader = `Basic ${Buffer.from(`${api.UNLAYER.API_KEY}:`).toString(
    'base64'
  )}`;

  const options = {
    uri: 'https://api.unlayer.com/v2/templates/' + id,
    method: 'GET',
    headers: {
      Authorization: authHeader,
    },
    json: true,
  };

  request(options)
    .then((response) => {
      return res.send({
        status: true,
        ...response,
      });
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      return res.status(400).send({
        status: false,
        error: error.error || error.message,
      });
    });
};
const bulkRemove = (req, res) => {
  const { currentUser } = req;
  const { data } = req.body;
  const promise_array = [];
  const errors = [];
  if (data) {
    for (let i = 0; i < data.length; i++) {
      const promise = new Promise(async (resolve) => {
        const id = data[i];
        const error_message = [];
        const material_theme = MaterialTheme.findOne({
          _id: id,
          user: currentUser.id,
        });
        if (!material_theme) {
          error_message.push({
            reason: 'Invalid permission',
          });
        } else {
          if (material_theme.json_content) {
            const key = material_theme.json_content.slice(
              urls.STORAGE_BASE.length + 1
            );
            removeFile(key, (err, data) => {
              error_message.push({
                reason: 'File Remove Error (json_content): File ID= ' + err,
              });
            });
          }
          if (material_theme.html_content) {
            const key = material_theme.html_content.slice(
              urls.STORAGE_BASE.length + 1
            );
            removeFile(key, (err, data) => {
              error_message.push({
                reason: 'File Remove Error (html_content): File ID= ' + err,
              });
            });
          }
          MaterialTheme.deleteOne({ _id: id, user: currentUser.id }).catch(
            (err) => {
              error_message.push({
                reason: err.message,
              });
            }
          );
          resolve();
          if (error_message.length > 0) {
            errors.push({
              theme_id: id,
              error_message,
            });
          }
        }
      });
      promise_array.push(promise);
    }
  }
  Promise.all(promise_array)
    .then(() => {
      return res.json({
        status: true,
        failed: errors,
      });
    })
    .catch((err) => {
      console.log('Theme bulk remove err', err.message);
      res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};
module.exports = {
  get,
  create,
  getAll,
  update,
  remove,
  setVideo,
  getNewsletters,
  getTemplates,
  getTemplate,
  bulkRemove,
};
