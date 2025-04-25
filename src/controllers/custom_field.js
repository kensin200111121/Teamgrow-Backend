const mongoose = require('mongoose');
const CustomField = require('../models/custom_field');
const Contact = require('../models/contact');
const Deal = require('../models/deal');

const create = async (req, res) => {
  const { currentUser } = req;
  const { name } = req.body;

  const custom_fd = new CustomField({
    ...req.body,
    user: currentUser.id,
  });

  try {
    const existingField = await CustomField.findOne({
      user: currentUser.id,
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
    res.status(500).json({
      status: false,
      error: message || 'Custom Field creating failed.',
    });
  }
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const { kind } = req.params;

  const _fields = await CustomField.find({
    user: currentUser.id,
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

  const currentField = await CustomField.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });
  if (currentField) {
    const query = {
      user: currentUser.id,
      [`additional_field.${currentField.name}`]: { $exists: true },
    };

    const Model = currentField.kind === 'contact' ? Contact : Deal;
    const updateOps = {
      $rename: {
        [`additional_field.${currentField.name}`]: `additional_field.${data.name}`,
      },
    };

    await Model.updateMany(query, updateOps).catch((ex) => {
      console.log('custom-field updating has errors: ', ex.message);
    });

    CustomField.updateOne(
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
          error: message || 'Custom Field Update Error',
        });
      });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;

  await CustomField.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
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
  const query = {
    user: mongoose.Types.ObjectId(currentUser.id),
    _id: { $in: fields },
  };
  await CustomField.deleteMany(query, { multi: true });

  // await CustomField.updateMany(
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
