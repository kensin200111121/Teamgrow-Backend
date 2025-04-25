const mongoose = require('mongoose');
const { materialCon } = require('../../bins/database');

const Schema = mongoose.Schema;

const TrackerSchema = new Schema(
  {
    user: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    contact: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'video' },
    activity: [{ type: mongoose.Schema.Types.ObjectId, ref: 'activity' }],
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'campaign' },
    type: { type: String, default: 'watch' },
    gap: { type: Array },
    start: Number,
    end: Number,
    duration: Number,
    material_last: Number,
    disconnected_at: Date,
    full_watched: Boolean,
    notified: Boolean,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

TrackerSchema.index({ video: 1 });
TrackerSchema.index({ activity: 1 });
const VideoTracker = materialCon.model('video_tracker', TrackerSchema);

module.exports = VideoTracker;
