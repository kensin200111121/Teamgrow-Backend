const AgentFilter = require('../models/agent_filter');

const get = async (req, res) => {
  const { currentUser } = req;
  const data = await AgentFilter.find({ user: currentUser.id }).catch((err) => {
    console.log('agent filter list not found', err);
  });
  return res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const _filter = new AgentFilter({
    ...req.body,
    user: currentUser.id,
  });
  const filter = await _filter.save().catch((err) => {
    console.log('agent filter create failed', err);
  });
  return res.send({
    status: true,
    data: filter,
  });
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;

  AgentFilter.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    { $set: data }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message || 'Agent Filter Update Error',
      });
    });
};

const remove = async (req, res) => {
  const { currentUser } = req;

  AgentFilter.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  })
    .then(() => {
      return res.send({ status: true });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message || 'Agent Filter Delete Error',
      });
    });
};

module.exports = {
  get,
  create,
  update,
  remove,
};
