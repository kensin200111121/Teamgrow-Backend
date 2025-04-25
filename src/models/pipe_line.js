const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PipeLineSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    version: { type: Number, default: 0 },
    updated_at: Date,
    created_at: Date,
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'organization' },
    has_automation: { type: Boolean, default: true }, // Remove: true,  Keep: false
    no_automation: { type: Boolean, default: true }, // Remove: true,  Keep: false
    original_id: { type: mongoose.Schema.Types.ObjectId, ref: 'pipe_line' },
    original_version: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

PipeLineSchema.index({ user: 1, title: 1 });
const PipeLine = mongoose.model('pipe_line', PipeLineSchema);

module.exports = PipeLine;
