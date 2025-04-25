const mongoose = require('mongoose');

const new_email = {
  _id: mongoose.Types.ObjectId('66d6895a11254206f14da0a4'),
  user: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
  type: 0, // send
  subject: 'hello - title',
  content: '<div>hello - content</div>',
  contacts: ['63a44fcbb199d3535de01cce'],
};

module.exports = { new_email };
