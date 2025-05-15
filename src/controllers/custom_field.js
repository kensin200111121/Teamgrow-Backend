const mongoose = require('mongoose');
const CustomField = require('../models/custom_field');
const Contact = require('../models/contact');
const Deal = require('../models/deal');

const create = async (req, res) => {
  const { currentUser } = req;
  const { name } = req.body;

  const filter = currentUser.organization
    ? { organization: currentUser.organization }
    : { user: currentUser._id };

  const customFieldData = {
    ...req.body,
    ...filter,
    user: currentUser._id,
  };

  const custom_fd = new CustomField(customFieldData);

  try {
    const existingField = await CustomField.findOne({
      ...filter,
      name: { $regex: `^${name}$`, $options: 'i' },
    });

    if (existingField) {
      return res.status(400).json({
        status: false,
        error: 'Custom Field with this name already exists',
      });
    }

    const newLabel = await custom_fd.save();
    return res.send({ status: true, data: newLabel });
  } catch (err) {
    let message = err.message || '';
    if (message.includes('duplicate key error')) {
      message = 'Custom Field with this name is created already';
    }
    return res.status(500).json({
      status: false,
      error: message || 'Custom Field creating failed.',
    });
  }
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const { kind } = req.params;

  const filter = currentUser.organization
    ? { organization: currentUser.organization }
    : { user: currentUser.id };

  const _fields = await CustomField.find({
    ...filter,
    kind,
  });

  return res.send({
    status: true,
    data: _fields,
  });
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;
  const { id } = req.params;

  const filter = currentUser.organization
    ? { organization: currentUser.organization }
    : { user: currentUser.id };

  try {
    const customField = await CustomField.findOne({
      _id: id,
      ...filter,
    });

    if (!customField) {
      return res.status(404).json({
        status: false,
        error: 'Custom Field not found',
      });
    }

    const additionalFilter = {
      ...filter,
      [`additional_field.${customField.name}`]: { $exists: true },
    };

    const Model = customField.kind === 'contact' ? Contact : Deal;
    const updateOps = {
      $rename: {
        [`additional_field.${customField.name}`]: `additional_field.${data.name}`,
      },
    };

    await Model.updateMany(additionalFilter, updateOps).catch((ex) => {
      console.log('custom-field updating has errors: ', ex.message);
    });

    await CustomField.updateOne({ _id: id, ...filter }, { $set: data });

    return res.send({ status: true });
  } catch (err) {
    let message = err.message || '';
    if (message.includes('duplicate key error')) {
      message = 'Name is taken already';
    }
    return res.status(500).json({
      status: false,
      error: message || 'Custom Field Update Error',
    });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;

  const filter = currentUser.organization
    ? { organization: currentUser.organization }
    : { user: currentUser.id };

  await CustomField.deleteOne({
    _id: id,
    ...filter,
  });

  // await Contact.updateMany(
  //   {
  //     user: mongoose.Types.ObjectId(currentUser.id),
  //     label: req.params.id,
  //   },
  //   {
  //     $unset: { label: true },
  //   }
  // );

  return res.send({ status: true });
};

const removeFields = async (req, res) => {
  const { currentUser } = req;
  const { fields } = req.body;

  const filter = currentUser.organization
    ? { organization: currentUser.organization }
    : { user: currentUser.id };

  await CustomField.deleteMany(
    {
      _id: { $in: fields },
      ...filter,
    },
    {
      multi: true,
    }
  );

  // await SomeModel.updateMany(
  //   {
  //     user: mongoose.Types.ObjectId(currentUser.id),
  //     label: { $in: fields },
  //   },
  //   {
  //     $unset: { status: true },
  //   }
  // );

  return res.send({ status: true });
};

module.exports = {
  create,
  getAll,
  update,
  remove,
  removeFields,
};
