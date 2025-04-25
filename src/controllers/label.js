const mongoose = require('mongoose');
const Label = require('../models/label');
const Contact = require('../models/contact');
const system_settings = require('../configs/system_settings');

const create = async (req, res) => {
  const { currentUser } = req;
  const { name } = req.body;

  const existingLabel = await Label.findOne({
    user: currentUser.id,
    name: { $regex: new RegExp(`^${name}$`, 'i') },
  });

  if (existingLabel) {
    return res.status(400).send({
      status: false,
      error: 'This label already exists',
    });
  }

  const label = new Label({
    ...req.body,
    name,
    user: currentUser.id,
  });

  try {
    const newLabel = await label.save();
    return res.send({ status: true, data: newLabel });
  } catch (err) {
    let message = err.message || '';
    if (message.includes('duplicate key error')) {
      message = 'Label with this name is created already';
    }
    res.status(500).json({
      status: false,
      error: message || 'Label creating failed.',
    });
  }
};

const bulkCreate = async (req, res) => {
  const { currentUser } = req;

  const { labels } = req.body;
  const promise_array = [];

  if (labels.length > system_settings.LABEL_LIMIT) {
    return res.status(400).json({
      status: false,
      error: 'Label max limit',
    });
  }

  for (let i = 0; i < labels.length; i++) {
    let promise;
    const queryConditions = [{ user: currentUser.id }];

    if (currentUser.source !== 'vortex') {
      queryConditions.push({ role: 'admin' });
    }

    const _label = await Label.findOne({
      name: { $regex: new RegExp(`^${labels[i]}$`, 'i') },
      $or: queryConditions,
    });

    if (!_label) {
      const label = new Label({
        name: labels[i],
        user: currentUser.id,
      });

      promise = new Promise(async (resolve) => {
        const new_label = await label.save().catch((err) => {
          console.log('label save err', err.message);
        });
        resolve(new_label);
      });
    } else {
      promise = new Promise((resolve) => {
        resolve(_label);
      });
    }
    promise_array.push(promise);
  }

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

const getAll = async (req, res) => {
  const { currentUser } = req;

  const _label_list = await Label.find({
    user: currentUser.id,
  }).sort({ priority: -1 });

  let _label_admin = [];
  if (currentUser.source !== 'vortex') {
    _label_admin = await Label.find({
      role: 'admin',
    }).sort({ priority: 1 });
  }

  Array.prototype.push.apply(_label_list, _label_admin);

  if (!_label_list) {
    return res.status(400).json({
      status: false,
      error: 'Label doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: _label_list,
  });
};

const getSharedAll = async (req, res) => {
  const { currentUser } = req;

  const _contacts = await Contact.find({
    shared_members: currentUser.id,
    user: { $nin: currentUser.id },
  });

  const _users = _contacts.map((e) => e.user[0]);

  const _label_list = await Label.find({ user: { $in: _users } });

  res.send({
    status: true,
    data: _label_list,
  });
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;

  const existingLabel = await Label.findOne({
    user: currentUser.id,
    name: { $regex: new RegExp(`^${data.name}$`, 'i') },
  });

  if (existingLabel) {
    return res.status(400).send({
      status: false,
      error: 'This label already exists',
    });
  }

  Label.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    { $set: data }
  )
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      let message = err.message || '';
      if (message.includes('duplicate key error')) {
        message = 'Name is taken already';
      }
      res.status(500).json({
        status: false,
        error: message || 'Label Update Error',
      });
    });
};

const remove = async (req, res) => {
  const { currentUser } = req;

  await Label.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  await Contact.updateMany(
    {
      user: mongoose.Types.ObjectId(currentUser.id),
      label: req.params.id,
    },
    {
      $unset: { label: true },
    }
  );

  return res.send({ status: true });
};

const removeLabels = async (req, res) => {
  const { currentUser } = req;
  const { labels } = req.body;
  const query = {
    user: mongoose.Types.ObjectId(currentUser.id),
    _id: { $in: labels },
  };
  await Label.deleteMany(query, { multi: true });

  await Contact.updateMany(
    {
      user: mongoose.Types.ObjectId(currentUser.id),
      label: { $in: labels },
    },
    {
      $unset: { label: true },
    }
  );

  return res.send({ status: true });
};

const mergeLabels = async (req, res) => {
  const { currentUser } = req;
  const { mergeLabels, mergeTo } = req.body;
  const query = {
    user: mongoose.Types.ObjectId(currentUser.id),
    _id: { $in: mergeLabels },
  };
  await Label.deleteMany(query, { multi: true });

  await Contact.updateMany(
    {
      user: mongoose.Types.ObjectId(currentUser.id),
      label: { $in: mergeLabels },
    },
    { label: mergeTo },
    { multi: true }
  );

  return res.send({ status: true });
};

const changeOrder = async (req, res) => {
  const { data } = req.body;
  const { currentUser } = req;

  for (let i = 0; i < data.length; i++) {
    await Label.updateOne(
      { _id: data[i]._id, user: currentUser._id },
      { $set: { priority: i } }
    );
  }

  return res.send({
    status: true,
  });
};

const getLabelDetails = async (req, res) => {
  const { currentUser } = req;
  const { label, page, pageSize, searchStr } = req.body;
  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const data = await Contact.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        label: mongoose.Types.ObjectId(label),
        $or: [
          {
            first_name: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            last_name: {
              $regex: search,
              $options: 'i',
            },
          },
        ],
      },
    },
    {
      $skip: (page - 1) * pageSize,
    },
    {
      $limit: pageSize,
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $project: { first_name: 1, last_name: 1, _id: 1 },
    },
  ]);
  const total = await Contact.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        label: mongoose.Types.ObjectId(label),
        $or: [
          {
            first_name: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            last_name: {
              $regex: search,
              $options: 'i',
            },
          },
        ],
      },
    },
  ]);

  res.send({
    status: true,
    data,
    total: total.length,
  });
};

const loadLabels = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    {
      $group: {
        _id: '$label',
        count: { $sum: 1 },
      },
    },
  ]);

  // Add 'No tags' tag to last element.( set id to -1 )
  return res.send({
    status: true,
    data,
  });
};

const getContactLabel = async (req, res) => {
  const { currentUser } = req;
  const _label_list = await Label.find({
    user: currentUser.id,
  }).sort({ priority: -1 });

  let _label_admin = [];

  if (currentUser.source !== 'vortex') {
    _label_admin = await Label.find({
      role: 'admin',
    }).sort({ priority: 1 });
  }

  Array.prototype.push.apply(_label_list, _label_admin);

  if (!_label_list) {
    return res.status(400).json({
      status: false,
      error: 'Label doesn`t exist of contact',
    });
  } else {
    res.send({
      status: true,
      data: _label_list,
    });
  }
};

const loadLabelsWithContacts = async (req, res) => {
  const { currentUser } = req;

  const matchConditions = [{ user: mongoose.Types.ObjectId(currentUser.id) }];

  if (currentUser.source !== 'vortex') {
    matchConditions.push({ role: 'admin' });
  }

  const labels = await Label.aggregate([
    {
      $match: {
        $or: matchConditions,
      },
    },
    {
      $sort: { role: 1 },
    },
  ]);
  const labelIds = labels.map((e) => e._id);
  const contacts = await Contact.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
        label: { $in: labelIds },
      },
    },
    {
      $group: {
        _id: '$label',
        count: { $sum: 1 },
      },
    },
  ]);
  labels.forEach((label) => {
    const index = contacts.findIndex(
      (e) => e._id.toString() === label._id.toString()
    );
    if (index !== -1) {
      label['contacts'] = contacts[index].count;
    } else {
      label['contacts'] = 0;
    }
  });

  return res.send({ status: true, data: labels });
};

module.exports = {
  create,
  bulkCreate,
  getAll,
  update,
  remove,
  removeLabels,
  mergeLabels,
  changeOrder,
  getLabelDetails,
  loadLabels,
  getSharedAll,
  getContactLabel,
  loadLabelsWithContacts,
};
