const SphereBucket = require('../models/sphere_bucket');

const create = (req, res) => {
  const { name, duration, score } = req.body;
  const user = req.currentUser?._id;

  const newBucket = new SphereBucket({
    user,
    name,
    duration,
    score,
  });

  newBucket
    .save()
    .then(() => {
      return res.send({
        status: true,
        data: newBucket,
      });
    })
    .catch((err) => {
      throw err;
    });
};

const update = (req, res) => {
  const { currentUser } = req;
  const { name, duration } = req.body;
  const id = req.params.id;
  SphereBucket.updateOne(
    { _id: id, user: currentUser._id },
    { $set: { name, duration } }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      throw err;
    });
};

const remove = (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  SphereBucket.findOne({
    _id: id,
    user: currentUser._id,
  })
    .then(async (data) => {
      if (!data) {
        throw new Error('not found bucket');
      }
      const score = data.score;
      await SphereBucket.updateMany(
        {
          user: currentUser._id,
          score: { $gt: score },
        },
        { $inc: { score: -1 } }
      ).catch(() => {});
      await SphereBucket.deleteOne({
        _id: id,
        user: currentUser._id,
      }).catch(() => {});
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      throw err;
    });
};

const load = (req, res) => {
  const { currentUser } = req;

  SphereBucket.find({
    user: currentUser._id,
  })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      throw err;
    });
};

const updateScores = async (req, res) => {
  const { currentUser } = req;
  const { prev, next, id } = req.body;
  let findQuery;
  let updateValue;

  if (next < prev) {
    findQuery = { score: { $gte: next, $lt: prev } };
    updateValue = 1;
  } else if (next > prev) {
    findQuery = { score: { $lte: next, $gt: prev } };
    updateValue = -1;
  } else {
    return res.send({});
  }

  await SphereBucket.updateMany(
    {
      user: currentUser._id,
      ...findQuery,
    },
    { $inc: { score: updateValue } }
  ).catch((err) => {
    throw err;
  });

  SphereBucket.updateOne(
    {
      user: currentUser._id,
      _id: id,
    },
    {
      $set: {
        score: next,
      },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      throw err;
    });
};

module.exports = {
  create,
  update,
  remove,
  load,
  updateScores,
};
