const mongoose = require('mongoose');

const { Schema } = mongoose;

const WhitelistSchema = new Schema(
  {
    email: String,
    type: String,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Whitelist = mongoose.model('whitelist', WhitelistSchema);

module.exports = Whitelist;
