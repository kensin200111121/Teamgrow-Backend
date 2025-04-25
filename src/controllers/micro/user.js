const {
  suspendUser: suspendUserHelper,
  setPackage: setPackageHelper,
  activeUser: reactivateUserHelper,
} = require('../../helpers/user');

const updatePackage = async (req, res) => {
  const { currentUser } = req;
  const { level } = req.body;

  setPackageHelper({
    user: currentUser.id,
    level,
  })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('set package err', err.message);
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const suspendUser = async (req, res) => {
  const { currentUser } = req;
  await suspendUserHelper(currentUser._id).catch((error) => {
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  });
  return res.send({
    status: true,
  });
};

const reactivateUser = async (req, res) => {
  const { currentUser } = req;
  // set always subscription.is_suspended to true because there is no concept for Sleep on Vortex
  await reactivateUserHelper(currentUser._id, {
    'subscription.is_suspended': false,
  }).catch((error) => {
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  });
  return res.send({
    status: true,
  });
};

module.exports = {
  updatePackage,
  suspendUser,
  reactivateUser,
};
