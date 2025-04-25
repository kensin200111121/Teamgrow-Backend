/* eslint-disable prettier/prettier */
const mongoose = require('mongoose');

const SphereRelationshipSchema = mongoose.Schema(
  {
    contact_id: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    sphere_bucket_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'sphere_bucket',
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    action_score: { type: Number },
    contacted_at: Date,
    should_contact: Boolean,
    business_score: { type: Number },
    type: { type: Number },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const SphereRelationship = mongoose.model(
  'sphere_relationship',
  SphereRelationshipSchema
);

module.exports = SphereRelationship;
