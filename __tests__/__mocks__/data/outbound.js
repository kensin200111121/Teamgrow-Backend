const mongoose = require('mongoose');
const { outbound_constants } = require('../../../src/constants/variable');

const outbound_data = {
  action: outbound_constants.LEAD_SOURCE,
  user: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
};

module.exports = { outbound_data };
