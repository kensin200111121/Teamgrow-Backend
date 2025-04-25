const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const RequestSchema = new Schema(
  {
    name: String,
    email: String,
    reason: String,
    feedback: String,
    ip_address: String,
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Request = mongoose.model('request', RequestSchema);

module.exports = Request;
