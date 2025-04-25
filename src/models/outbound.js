const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const OutboundSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    outbound_id: String,
    action: String,
    hookapi: String,
    data: Object,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Outbound = mongoose.model('outbound', OutboundSchema);

module.exports = Outbound;
