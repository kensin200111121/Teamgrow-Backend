const mongoose = require('mongoose');
const { resetCacheOfUcraft } = require('../helpers/page');

const Schema = mongoose.Schema;

const PDFSchema = new Schema(
  {
    original_id: { type: mongoose.Schema.Types.ObjectId },
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    description: String,
    preview: String,
    type: String,
    url: String,
    role: String,
    company: { type: String },
    key: String,
    total_pages: Number,
    material_theme: { type: String, default: 'simple' },
    capture_form: { type: Object },
    enabled_capture: { type: Boolean, default: false },
    default_edited: { type: Boolean, default: false },
    is_sharable: { type: Boolean, default: true },
    is_download: { type: Boolean, default: true },
    default_pdf: { type: mongoose.Schema.Types.ObjectId, ref: 'pdf' },
    has_shared: { type: Boolean, default: false },
    shared_pdf: { type: mongoose.Schema.Types.ObjectId, ref: 'pdf' },
    del: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    original_version: { type: Number, default: 0 },
    created_at: Date,
    updated_at: Date,
    view_mode: { type: String, default: 'scroll' },
    enabled_notification: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

PDFSchema.post('save', async function () {
  const material = this;
  material && (await resetCacheOfUcraft(material.user));
});

PDFSchema.post('updateOne', async function () {
  const material_id = this._conditions._id;
  const material = await PDF.findOne({ _id: material_id });
  material && (await resetCacheOfUcraft(material.user));
});

PDFSchema.post('updateMany', async function () {
  const material_ids = this._conditions._id['$in'];

  const materials = await PDF.find({ _id: { $in: material_ids } });

  for (const material of materials) {
    await resetCacheOfUcraft(material.user);
  }
});

const PDF = mongoose.model('pdf', PDFSchema);

module.exports = PDF;
