const mongoose = require('mongoose');

const guest_user = {
  _id: mongoose.Types.ObjectId('614349c899f66f4e34fee911'),
  disabled: false,
  name: 'testuser01@crmgrow.com',
  email: 'testuser01@crmgrow.com',
  salt: '1234567890abcdefghijklmnopqrstuv',
  hash: '70617373776f7264',
  user: mongoose.Types.ObjectId('65f87caa391a882876feac23'),
  created_at: new Date('2021-09-16T13:42:32.334Z'),
  updated_at: new Date('2021-09-16T13:42:32.334Z'),
  __v: 0,
};

module.exports = { guest_user };
