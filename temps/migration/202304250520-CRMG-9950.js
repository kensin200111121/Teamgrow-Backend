const mongoose = require('mongoose');
const moment = require('moment-timezone');

const Payment = require('../src/models/payment');
const { ENV_PATH } = require('../config/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../config/database');
const User = require('../src/models/user');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrateUserPaymentCorrect();
    // removeDevAccounts();
    // setFreeDevAccounts();
    // unsetFreeUnknownAccounts();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateUserPaymentCorrect = async () => {
  const users = await User.find({
    del: false,
    $or: [{ is_free: { $exists: false } }, { is_free: false }],
  }); // is_free: true, { payment: { $ne: null } }

  //  console.log(users.length, ' users found!');
  for (let count = 0; count < users.length; count++) {
    const user = users[count];

    /*
    if (user.is_free) {
      console.log(
        // count,
        // ',',
        user._id,
        ',',
        user.user_name
        // ',',
        // user.email,
        // ',',
        // user.payment?.toString(),
        // ',',
        // 'free user'
      );
    } else
    */
    if (!user.payment) {
      console.log(
        // count,
        // ',',
        user._id.toString(),
        ',',
        user.user_name,
        ',',
        user.email,
        ',',
        moment(user.last_logged).format('MMMM Do, YYYY')
        // null,
        // ',',
        // 'no payment'
      );
    } else {
      const payment = await Payment.findOne({
        _id: mongoose.Types.ObjectId(user.payment),
      });
      if (!payment) {
        console.log(
          // count,
          // ',',
          user._id.toString(),
          ',',
          user.user_name,
          ',',
          user.email,
          ',',
          moment(user.last_logged).format('MMMM Do, YYYY')
          // ',',
          // user.payment.toString(),
          // ',',
          // 'invalid payment'
        );
        // await User.updateOne(
        //   { _id: mongoose.Types.ObjectId(user._id) },
        //   { $set: { payment: null } }
        // );
      } else {
        // console.log(
        //   count,
        //   ',',
        //   user._id.toString(),
        //   ',',
        //   user.email,
        //   ',',
        //   user.payment.toString(),
        //   ',',
        //   'valid payment'
        // );
      }
    }
  }

  console.log('migration successful!');
};

const removeDevAccounts = async () => {
  const free_users = [
    '60cb0d9cf8fae337cc2f559f',
    '60cb0dd6f8fae337cc2f55a2',
    '6116a13fefb6b24d0c8ad034',
    '6256a6210e481000163257b5',
    '625ec4e29da526001dd27c36',
    '6269f80236c28c001504d9e2',
    '62b357eb73fa6b00146c7126',
    '63174b257f331a0016b36ced',
    '635ffb0bda99d07f21bf00c2',
    '6317607a7f331a0016b5f7f7',
    '6345bbf033848300148ea3eb',
    '63f6578088827918d6d63a11',
    '63f6590e2ad3cf672a728ff0',
    '63f65b7f88827918d6d6675a',
    '642a8a691fbf968477c4492b',
    '642a8bf9965ce87db694ddd1',
    '644a392adbdd5e0b0a5b8872',
    '644a7e4175c4aa5fedff5b65',
    '6334ae5c41b0b8001c9f3411',
    '633c4b39e6e9d0001c6e4e20',
    '637938e414c91e00155801f8',
    '63c0527f04f9b200158f7fbf',
    '644aa6bf3db0bf372663bd7f',
    '64538318c9314101c5fd6bad',
    '62ad1d7bcd03550015ee83e2',
    '62d2df68f694290015bed5b8',
    '61db89fd51ae2d00178a3c91',
    '61e19a1a01da9f0016c35d68',
    '6213ee17bb32590017cce720',
    '61f61981b7c535001540a6f0',
    '6241d69ba9c5c20016d17c95',
    '624641d4ac504e0016e206eb',
    '63d2b7fac465fc001c6b9c4c',
    '62a87d551852580015a356f9',
  ];

  await User.deleteMany({
    _id: { $in: free_users },
  })
    .then((res) => {
      console.log('removed', res);
    })
    .catch((err) => {
      console.log('err', err);
    });
};

const setFreeDevAccounts = async () => {
  const dev_users = [
    '6153263f38ebfe00168bc10b',
    '63d23422b44470001cecb293',
    '63e46b33d1f1f30015f92472',
    '5fd97ad994cf273d68a016da',
    '64100107579745d3c1e304ca',
    '63b5a731c7d160001c6d6091',
    '63b5a74ac7d160001c6d613b',
    '631756687f331a0016b4a5e0',
    '63067deb86914e001593000c',
    '62a7422c130879001baac11c',
    '62a74241130879001baac155',
    '62a7425d130879001baac195',
    '627d0f14b1939d00157d7f2b',
    '627d0f31b1939d00157d8230',
    '642ade1ade83ef9e6d6612ea',
    '5f848d4c7d426039c3ba214a',
    '63d77a067b469e272471a03d',
    '62a17646e95b625115440cda',
    '642ced7a542a7fa2d70fd34e',
  ];

  await User.updateMany(
    { _id: { $in: dev_users } },
    {
      $set: { is_free: true },
    }
  )
    .then((res) => {
      console.log('set free', res);
    })
    .catch((err) => {
      console.log('err', err);
    });
};

const unsetFreeUnknownAccounts = async () => {
  const unknown_users = [
    '5ffe00f51ada026f6d12193e',
    '61e6f4cf14e9e50016f3029c',
    '620c0a688cf4d500173a1c7a',
    '62150c4a063a2d0016b5fa83',
    '62150de1063a2d0016b60c19',
    '624534199e8da7001533e38d',
    '62682e9d08211e00168c6161',
    '6407b992fef565d5cfcac0de',
    '6407ba717d6eb825b7561373',
    '640ac71a48bacd5e801261b1',
    '6439ab03792574503940d7a4',
    '64518cb3eec6e0b6a4c4bff4',
    '64540b229e274873ca195009',
  ];

  await User.updateMany(
    { _id: { $in: unknown_users } },
    {
      $unset: { is_free: true },
    }
  )
    .then((res) => {
      console.log('set free', res);
    })
    .catch((err) => {
      console.log('err', err);
    });
};
