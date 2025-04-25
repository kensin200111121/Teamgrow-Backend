const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const LandingPageSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    name: String,
    description: String,
    theme: String,
    material_type: {
      type: String,
      enum: ['video', 'pdf', 'image', undefined, null],
    },
    material: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'material_type',
      required: false,
    },
    headline: String,
    content: String,
    background_color: { type: String, default: '#FFFFFF' },
    form_settings: [{ type: Object }],
    forms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'lead_form' }],
    form_type: Number,
    is_published: { type: Boolean, default: false },
    highlights: [String],
    highlightsV2: [
      {
        type: {
          type: String,
          enum: ['video', 'pdf', 'image'],
          required: true,
        },
        material: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: 'highlightsV2.type',
        },
      },
    ],
    pdf_mode: {
      type: String,
      enum: ['scroll', 'bookfold'],
      default: 'scroll',
    },
    is_draft: { type: Boolean, default: false },
    original_id: { type: mongoose.Schema.Types.ObjectId },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('landing_page', LandingPageSchema);
