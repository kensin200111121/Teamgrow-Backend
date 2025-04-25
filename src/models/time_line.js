const mongoose = require('mongoose');
const { automationCon } = require('../../bins/database');

const Schema = mongoose.Schema;

const TimeLineSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    status: String,
    visible: { type: Boolean, default: true },
    error_message: String,
    error_array: Object,
    due_date: Date,
    period: Number,
    action: Object,
    ref: String,
    parent_ref: String,
    activity: { type: mongoose.Schema.Types.ObjectId, ref: 'activity' },
    automation: { type: mongoose.Schema.Types.ObjectId, ref: 'automation' },
    automation_line: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'automation_line',
    },
    condition: {
      case: mongoose.Schema.Types.Mixed,
      answer: Boolean,
      condition_type: Number,
      percent: Number,
    },
    type: String,
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'deal' },
    assigned_contacts: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    ],
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'text' },
    created_followup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'follow_up',
    },
    opened_email: { type: mongoose.Schema.Types.ObjectId, ref: 'activity' },
    material_activities: [{ type: mongoose.Schema.Types.ObjectId }],
    watched_materials: [{ type: mongoose.Schema.Types.ObjectId }],
    finished_materials: [{ type: mongoose.Schema.Types.ObjectId }],
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

TimeLineSchema.index({ status: 1, due_date: 1 });
TimeLineSchema.index({ contact: 1, parent_ref: 1, status: 1 });
TimeLineSchema.index({ user: 1 });
TimeLineSchema.index({ user: 1, contact: 1 });
TimeLineSchema.index({ user: 1, deal: 1 });
TimeLineSchema.index({ deal: 1 });
TimeLineSchema.index({ automation_line: 1 });

const TimeLine = automationCon.model('time_line', TimeLineSchema);

module.exports = TimeLine;
