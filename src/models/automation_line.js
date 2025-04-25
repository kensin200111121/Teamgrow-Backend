const mongoose = require('mongoose');
const { automationCon } = require('../../bins/database');

const Schema = mongoose.Schema;

const AutomationLineSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    automations: Array,
    automation: { type: mongoose.Schema.Types.ObjectId, ref: 'automation' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'deal' },
    status: { type: String },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment' },
    action_count: { type: Number },
    type: { type: String, default: 'contact' },
    created_at: Date,
    updated_at: Date,
    version: Number,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

AutomationLineSchema.index({ status: 1 });
AutomationLineSchema.index({ user: 1 });
AutomationLineSchema.index({ user: 1, contact: 1 });
AutomationLineSchema.index({ user: 1, deal: 1 });
AutomationLineSchema.index({ user: 1, automation: 1, status: 1 });

const AutomationLine = automationCon.model(
  'automation_line',
  AutomationLineSchema
);

module.exports = AutomationLine;
