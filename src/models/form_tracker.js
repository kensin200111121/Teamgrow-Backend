const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const FormTrackerSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    data: Object,
    tags: Array,
    automation: { type: mongoose.Schema.Types.ObjectId, ref: 'automation' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    lead_form: { type: mongoose.Schema.Types.ObjectId, ref: 'lead_form' },
    landing_page: { type: mongoose.Schema.Types.ObjectId, ref: 'landing_page' },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const FormTracker = mongoose.model('form_tracker', FormTrackerSchema);

module.exports = FormTracker;
