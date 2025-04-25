const { create, update, remove, load } = require('../helpers/promo_code');

const createCode = (req, res, next) => {
  const data = req.body;

  create(data)
    .then((code) => {
      res.send({
        status: true,
        data: code,
      });
    })
    .catch((err) => {
      next(err);
    });
};

const deleteCode = (req, res, next) => {
  const { id } = req.params;

  remove(id)
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      next(err);
    });
};

const updateCode = (req, res, next) => {
  const { id, data } = req.body;

  update(id, data)
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      next(err);
    });
};

const loadAll = async (req, res) => {
  const codes = await load();
  return res.send({
    status: true,
    data: codes,
  });
};

module.exports = {
  createCode,
  deleteCode,
  updateCode,
  loadAll,
};
