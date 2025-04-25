const Label = require('../models/label');
const User = require('../models/user');
const mongoose = require('mongoose');

const getAll = async (user) => {
  const _label_list = await Label.find({ user }).select({
    name: 1,
  });

  let _label_admin = [];

  const userObj = await User.findById(user).catch(() => {});
  if (userObj?.source !== 'vortex') {
    _label_admin = await Label.find({
      role: 'admin',
    }).select({ name: 1 });
  }

  Array.prototype.push.apply(_label_list, _label_admin);
  return _label_list;
};

const convertLabel = async (user, label_str, userSource) => {
  if (mongoose.Types.ObjectId.isValid(label_str)) {
    const label = await Label.findOne({ _id: label_str.toLowerCase() }).catch(
      () => {}
    );

    if (label) {
      if (label.role === 'admin' && userSource !== 'vortex') {
        return label._id;
      } else if (label.user + '' === user + '') {
        return label._id;
      } else {
        const userOwnLabel = await Label.findOne({
          user,
          name: label.name,
        }).catch(() => {});
        if (userOwnLabel) {
          return userOwnLabel._id;
        } else {
          const newLabel = await Label.create({
            user,
            name: label.name,
          }).catch(() => {});
          return newLabel?._id;
        }
      }
    }
    return;
  }

  const queryConditions = [{ user, name: new RegExp(label_str, 'i') }];

  if (userSource !== 'vortex') {
    queryConditions.push({ role: 'admin', name: new RegExp(label_str, 'i') });
  }

  const label = await Label.findOne({
    $or: queryConditions,
  }).catch((err) => {
    console.log('label find err', err.message);
  });

  if (label) {
    return label._id;
  } else {
    const newLabel = await Label.create({
      user,
      name: label_str,
    }).catch(() => {});
    return newLabel?._id;
  }
};

const getLabelName = (labelId) => {
  return new Promise((resolve) => {
    if (!labelId) resolve(null);
    Label.findOne({
      _id: mongoose.Types.ObjectId(labelId),
    })
      .then((res) => {
        if (res) resolve(res.name);
        else resolve(null);
      })
      .catch(() => {
        resolve(null);
      });
  });
};

const createDefaultLabels = async (userId) => {
  if (!userId) return;

  const defaultLabels = [
    { name: 'New', color: '#fbedc6', font_color: '#000', priority: 1 },
    { name: 'Warm', color: '#ffcb03', font_color: '#000', priority: 2 },
    { name: 'Hot', color: '#f94839', font_color: '#FFF', priority: 3 },
    { name: 'Cold', color: '#00f', font_color: '#FFF', priority: 4 },
    { name: 'Trash', color: '#6d6d6d', font_color: '#f1f1f1', priority: 5 },
    { name: 'Appt Set', color: '#FFF', font_color: '#00f', priority: 6 },
    { name: 'Appt Missed', color: '#FFF', font_color: '#ff0000', priority: 7 },
    { name: 'Lead', color: '#FFF', font_color: '#444', priority: 8 },
  ];

  try {
    const labels = defaultLabels.map((label) => ({
      ...label,
      user: userId,
    }));

    await Label.insertMany(labels);
  } catch (error) {
    console.error('Error creating default labels:', error.message);
  }
};

module.exports = {
  getAll,
  convertLabel,
  getLabelName,
  createDefaultLabels,
};
