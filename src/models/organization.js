const mongoose = require('mongoose');
const { TEAM_DEFAULT_SETTINGS } = require('../constants/user');

const Schema = mongoose.Schema;

const OrganizationSchema = new Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    vortex_team: String,
    name: String,
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        role: { type: String },
        status: { type: String },
        avatar_color: { type: String },
        vortex_user_id: { type: String },
      },
    ],
    settings: { type: Array, default: TEAM_DEFAULT_SETTINGS },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    virtual_customer_id: { type: String },
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);
const Organization = mongoose.model('organization', OrganizationSchema);

module.exports = Organization;
