const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const TaskSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    status: String,
    due_date: Date,
    period: Number,
    action: Object,
    ref: String,
    parent_ref: String,
    type: { type: String },
    process: { type: String },
    activity: { type: mongoose.Schema.Types.ObjectId, ref: 'activity' },
    condition: {
      case: String,
      answer: Boolean,
    },
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'deal' },
    exec_result: Object,
    set_recurrence: Boolean,
    set_auto_complete: Boolean,
    recurrence_mode: String,
    source: { type: String, default: 'normal' }, // normal | schedule
    created_at: Date,
    updated_at: Date,
    timezone: String,
    is_last: Boolean,
    chunk: String,
    receivers: [String],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

TaskSchema.index({ status: 1, due_date: 1 });
TaskSchema.index({ user: 1 });
TaskSchema.index({ process: 1 });
TaskSchema.index({ source: 1 });
TaskSchema.index({ type: 1, user: 1, status: 1 });

const Task = mongoose.model('task', TaskSchema);

module.exports = Task;
