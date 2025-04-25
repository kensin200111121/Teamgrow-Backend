const BlackList = require('../../models/blacklist');

const create = async (req, res) => {
  const newItem = await BlackList.create({
    ...req.body,
  }).catch(() => {});

  try {
    return res.send({ status: true, data: newItem });
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

const load = async (req, res) => {
  const lists = await BlackList.find({}).catch(() => {});

  return res.send({
    status: true,
    data: lists,
  });
};

const remove = async (req, res) => {
  const { id } = req.params;

  await BlackList.deleteOne({ _id: id }).catch(() => {});

  return res.send({
    status: true,
  });
};

const checkBlocked = async (req, res) => {
  const isGlobalBlocked = BlackList.findOne({ value: '*' }).catch(() => {});

  return res.send({
    status: true,
    isBlocked: isGlobalBlocked,
  });
};

module.exports = {
  create,
  remove,
  load,
  checkBlocked,
};
