const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const DealSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'organization' },
    title: String,
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    deal_stage: { type: mongoose.Schema.Types.ObjectId, ref: 'deal_stage' },
    primary_contact: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    additional_field: Object,
    put_at: Date,
    automation_off: Date,
    price: Number,
    close_date: Date,
    team_members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    description: String,
    commission: {
      unit: String, // $ and %
      value: Number,
    },
    agent_price: Number,
    team_price: Number,
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

DealSchema.index({ contacts: 1 });
const Deal = mongoose.model('deal', DealSchema);

module.exports = Deal;
