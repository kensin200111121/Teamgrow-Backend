const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CustomFieldSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    type: String,
    name: { type: String, lowercase: true },
    placeholder: String,
    format: String,
    status: { type: Boolean, default: true },
    kind: { type: String, default: 'contact' },
    options: { type: Array, default: [] },
    order: { type: Number, default: 0 },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

CustomFieldSchema.index({ user: 1, name: 1, kind: 1 }, { unique: true });
const CustomField = mongoose.model('custom_field', CustomFieldSchema);

module.exports = CustomField;
