const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const BlackListSchema = new Schema(
  {
    value: { type: String, required: true, unique: true },
    name: { type: String },
    description: { type: String },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const BlackList = mongoose.model('blacklist', BlackListSchema);

module.exports = BlackList;
