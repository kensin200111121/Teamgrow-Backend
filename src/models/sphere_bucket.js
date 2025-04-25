/* eslint-disable prettier/prettier */
const mongoose = require('mongoose');

const SphereBucketSchema = mongoose.Schema(
  {
    name: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    score: { type: Number, default: 1 },
    duration: { type: Number },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

SphereBucketSchema.index({ user: 1 });

const ShereBucket = mongoose.model('sphere_bucket', SphereBucketSchema);

module.exports = ShereBucket;
