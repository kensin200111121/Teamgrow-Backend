const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const FollowUpSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    due_date: Date,
    process: { type: String },
    content: { type: String, default: 'Contact has reviewed material' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    shared_follow_up: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'follow_up',
    },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'task' },
    has_shared: Boolean,
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'deal' },
    status: { type: Number, default: 0 }, // 0: todo, 1: completed, 2: overdue
    comment: { type: String },
    reminder: Number,
    reminder_type: String,
    type: String,
    set_recurrence: Boolean,
    set_auto_complete: Boolean,
    recurrence_mode: String,
    assigned_contacts: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    ],
    remind_at: Date,
    parent_follow_up: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'follow_up',
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    deleted_due_dates: Array,
    recurrence_date: Date,
    timezone: String,
    is_full: Boolean,
    description: String,
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

FollowUpSchema.index({ user: 1, status: 1, due_date: 1 });
FollowUpSchema.index({ shared_follow_up: 1 });
FollowUpSchema.index({ parent_follow_up: 1 });
FollowUpSchema.index({ contact: 1 });
FollowUpSchema.index({ deal: 1 });
FollowUpSchema.index({ remind_at: 1 });
const FollowUp = mongoose.model('follow_up', FollowUpSchema);

module.exports = FollowUp;
