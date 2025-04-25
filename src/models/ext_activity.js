const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ExtActivitySchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    content: String,
    type: String,
    send_uuid: String,
    send_type: Number,
    to_emails: Array,
    subject: String,
    description: String,
    status: String,
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    pair_activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ext_activity',
    },
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    tracker: {
      read_pages: Number,
      total_pages: Number,
      gap: { type: Array },
      start: Number,
      end: Number,
      duration: Number,
      material_last: Number,
      full_watched: Boolean,
    },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

ExtActivitySchema.index({ send_uuid: 1 });
ExtActivitySchema.index({ user: 1 });
ExtActivitySchema.index({ pair_activity: 1, created_at: 1 });

const Activity = mongoose.model('ext_activity', ExtActivitySchema);

module.exports = Activity;
