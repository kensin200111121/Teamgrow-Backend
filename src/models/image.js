const mongoose = require('mongoose');
const { resetCacheOfUcraft } = require('../helpers/page');

const Schema = mongoose.Schema;

const ImageSchema = new Schema(
  {
    original_id: { type: mongoose.Schema.Types.ObjectId },
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    description: String,
    preview: String,
    type: String,
    url: Array,
    key: Array,
    role: String,
    company: { type: String },
    priority: { type: Number, default: 1000 },
    material_theme: { type: String, default: 'simple' },
    capture_form: { type: Object },
    enabled_capture: { type: Boolean, default: false },
    default_edited: { type: Boolean, default: false },
    has_shared: { type: Boolean, default: false },
    is_sharable: { type: Boolean, default: true },
    is_download: { type: Boolean, default: true },
    default_image: { type: mongoose.Schema.Types.ObjectId, ref: 'image' },
    shared_image: { type: mongoose.Schema.Types.ObjectId, ref: 'image' },
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

ImageSchema.post('save', async function () {
  const material = this;
  material && (await resetCacheOfUcraft(material.user));
});

ImageSchema.post('updateOne', async function () {
  const material_id = this._conditions._id;
  const material = await Image.findOne({ _id: material_id });
  material && (await resetCacheOfUcraft(material.user));
});

ImageSchema.post('updateMany', async function () {
  const material_ids = this._conditions._id['$in'];

  const materials = await Image.find({ _id: { $in: material_ids } });

  for (const material of materials) {
    await resetCacheOfUcraft(material.user);
  }
});

const Image = mongoose.model('image', ImageSchema);

module.exports = Image;
