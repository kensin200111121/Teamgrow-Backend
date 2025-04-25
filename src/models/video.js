const mongoose = require('mongoose');
const { resetCacheOfUcraft } = require('../helpers/page');

const Schema = mongoose.Schema;

const VideoSchema = new Schema(
  {
    original_id: { type: mongoose.Schema.Types.ObjectId },
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    company: { type: String },
    description: String,
    converted: { type: String, default: 'none' },
    uploaded: { type: Boolean, default: false },
    thumbnail: String,
    thumbnail_path: String,
    site_image: String,
    custom_thumbnail: { type: Boolean, default: false },
    preview: String,
    recording: { type: Boolean, default: false },
    path: String,
    old_path: String,
    type: String,
    duration: Number,
    url: String,
    role: String,
    key: String,
    bucket: String,
    material_theme: { type: String, default: 'simple' },
    capture_form: { type: Object },
    enabled_capture: { type: Boolean, default: false },
    default_edited: { type: Boolean, default: false },
    is_sharable: { type: Boolean, default: true },
    is_download: { type: Boolean, default: true },
    default_video: { type: mongoose.Schema.Types.ObjectId, ref: 'video' },
    has_shared: { type: Boolean, default: false },
    shared_video: { type: mongoose.Schema.Types.ObjectId, ref: 'video' },
    priority: { type: Number, default: 1000 },
    is_draft: { type: Boolean, default: false },
    chunk_count: { type: Number, default: 1 },
    status: { type: Object },
    del: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    original_version: { type: Number, default: 0 },
    created_at: Date,
    updated_at: Date,
    enabled_notification: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

VideoSchema.index({ user: 1 });

VideoSchema.post('save', async function () {
  const material = this;
  material && (await resetCacheOfUcraft(material.user));
});

VideoSchema.post('updateOne', async function () {
  const material_id = this._conditions._id;
  const material = await Video.findOne({ _id: material_id });
  material && (await resetCacheOfUcraft(material.user));
});

VideoSchema.post('updateMany', async function () {
  const material_ids = this._conditions._id['$in'];

  const materials = await Video.find({ _id: { $in: material_ids } });

  for (const material of materials) {
    await resetCacheOfUcraft(material.user);
  }
});

const Video = mongoose.model('video', VideoSchema);

module.exports = Video;
