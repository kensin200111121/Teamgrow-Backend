const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const SettingSchema = new Schema(
  {
    name: String,
    value: Object,
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Setting = mongoose.model('setting', SettingSchema);

module.exports = Setting;
