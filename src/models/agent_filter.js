const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const AgentFilterSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    state: String,
    time_frame: { type: Number, default: 6 },
    listing_type: { type: Number, default: 0 },
    count: { type: Number, default: 1 },
    period: { type: String, default: 'lastsixmonths' }, // 'lastsixmonths', 'lastyear'
    max: Number,
    min: Number,
    exclude_brokerage: String,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const AgentFilter = mongoose.model('agent_filter', AgentFilterSchema);

module.exports = AgentFilter;
