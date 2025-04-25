const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const LeadFormSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    name: String,
    fields: Array,
    tags: Array,
    form_id: String,
    automation: { type: mongoose.Schema.Types.ObjectId, ref: 'automation' },
    capture_delay: { type: Number, default: 0 },
    capture_video: String,
    isDefault: { type: Boolean, default: false },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const LeadForm = mongoose.model('lead_form', LeadFormSchema);

module.exports = LeadForm;
