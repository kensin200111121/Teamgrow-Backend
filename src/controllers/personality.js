const mongoose = require('mongoose');
const Personality = require('../models/personality');

const load = async (req, res) => {
  const { currentUser } = req;

  Personality.find({
    $or: [{ user: currentUser.id }, { role: 'admin' }],
  })
    .then((personalities) => {
      res.send({
        status: true,
        data: personalities,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Personality reading is failed.',
      });
    });
};

const create = async (req, res) => {
  const { currentUser } = req;
  const person = new Personality({
    ...req.body,
    user: currentUser.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  try {
    const newPerson = await person.save();
    return res.send({ status: true, data: newPerson });
  } catch (err) {
    return res.status(500).send({
      status: false,
      error: err.message || 'Personality creating failed.',
    });
  }
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;
  Personality.updateOne(
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
      res.status(500).json({
        status: false,
        error: err.message || 'Personality Update Error',
      });
    });
};

const remove = async (req, res) => {
  const { currentUser } = req;

  await Personality.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  return res.send({ status: true });
};

module.exports = {
  load,
  create,
  update,
  remove,
};
