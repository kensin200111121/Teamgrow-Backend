const Filter = require('../models/filter');
const Team = require('../models/team');

const create = async (req, res) => {
  const { currentUser } = req;
  const { type } = req.body;
  let teamId;
  if (type === 'team') {
    teamId = await findTeamId(currentUser);
    if (!teamId) {
      return res.status(400).send({
        status: false,
        error: 'Could not find team.',
      });
    }
  }
  const filter = new Filter({
    ...req.body,
    team: teamId,
    user: currentUser.id,
  });

  try {
    const newFilter = await filter.save();
    return res.send({ status: true, data: newFilter });
  } catch (err) {
    return res.status(500).send({
      status: false,
      error: err.message || 'Filter creating failed.',
    });
  }
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const team = await Team.findOne({
    members: currentUser.id,
    is_internal: true,
  }).catch((err) => {
    console.log('teams found error', err.message);
  });
  let query;
  if (team) {
    query = {
      $or: [{ user: currentUser.id }, { team: team._id, type: 'team' }],
    };
  } else {
    query = { user: currentUser.id };
  }
  const data = await Filter.find(query);

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Saved filter doesn`t exist',
    });
  } else {
    return res.send({
      status: true,
      data,
    });
  }
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;
  if (data?.type === 'team') {
    const teamId = await findTeamId(currentUser);
    if (!teamId) {
      return res.status(400).send({
        status: false,
        error: 'Could not find team.',
      });
    }
    data['team'] = teamId;
  } else {
    data['team'] = null;
  }
  Filter.updateOne(
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
        error: err.message || 'Filter Update Error',
      });
    });
};

const remove = (req, res) => {
  const { currentUser } = req;

  Filter.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Filter Delete Error',
      });
    });
};

const findTeamId = async (user) => {
  const team = await Team.findOne({
    owner: user.id,
    is_internal: true,
  }).catch((err) => {
    console.log('team found error', err.message);
  });
  return team._id;
};

module.exports = {
  create,
  getAll,
  update,
  remove,
};
