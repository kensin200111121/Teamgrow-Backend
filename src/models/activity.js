const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ActivitySchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    content: String,
    type: String,
    appointments: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment' },
    follow_ups: { type: mongoose.Schema.Types.ObjectId, ref: 'follow_up' },
    notes: { type: mongoose.Schema.Types.ObjectId, ref: 'note' },
    events: { type: mongoose.Schema.Types.ObjectId, ref: 'event' },
    phone_logs: { type: mongoose.Schema.Types.ObjectId, ref: 'phone_log' },
    form_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'form_tracker',
    },
    landing_pages: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'landing_page',
    },
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    video_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'video_tracker',
    },
    users: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    pdf_trackers: { type: mongoose.Schema.Types.ObjectId, ref: 'pdf_tracker' },
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    image_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'image_tracker',
    },
    emails: { type: mongoose.Schema.Types.ObjectId, ref: 'email' },
    email_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'email_tracker',
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'campaign',
    },
    email_template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'email_template',
    },
    texts: { type: mongoose.Schema.Types.ObjectId, ref: 'text' },
    deals: { type: mongoose.Schema.Types.ObjectId, ref: 'deal' },
    deal_stages: { type: mongoose.Schema.Types.ObjectId, ref: 'deal_stage' },
    team_calls: { type: mongoose.Schema.Types.ObjectId, ref: 'team_call' },
    contacts: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    automation_lines: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'automation_line',
    },
    automations: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'automation',
    },
    detail: { type: Object },
    material_last: Number,
    full_watched: Boolean,
    send_uuid: String,
    send_type: Number,
    to_emails: Array,
    subject: String,
    receivers: [String],
    description: String,
    status: String,
    created_at: Date,
    updated_at: Date,
    parent_follow_up: mongoose.Schema.Types.ObjectId,
    assigner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    assigned_id: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    single_id: String,
    message_id: String,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

ActivitySchema.index({ messsage_sid: 1 });
ActivitySchema.index({ contacts: 1 });
ActivitySchema.index({ deals: 1 });
ActivitySchema.index({ video_trackers: 1 });
ActivitySchema.index({ send_uuid: 1 });
ActivitySchema.index({ type: 1 });
ActivitySchema.index({ videos: 1 });
ActivitySchema.index({ pdfs: 1 });
ActivitySchema.index({ images: 1 });

const Activity = mongoose.model('activity', ActivitySchema);

module.exports = Activity;
