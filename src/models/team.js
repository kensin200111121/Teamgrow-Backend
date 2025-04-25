const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const TeamSchema = new Schema(
  {
    owner: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    name: String,
    description: String,
    email: String,
    cell_phone: String,
    picture: String,
    team_setting: {
      viewMembers: { type: Boolean, default: false },
      requestInvite: { type: Boolean, default: false },
      shareMaterial: { type: Boolean, default: false },
      downloadMaterial: { type: Boolean, default: false },
    },
    highlights: { type: Array, default: [] },
    brands: { type: Array, default: [] },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    invites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    join_link: String,
    referrals: { type: Array, default: [] },
    editors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    folders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'folder' }],
    automations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'automation' }],
    pipelines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pipeline' }],
    email_templates: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'email_template' },
    ],
    is_public: { type: Boolean, default: true },
    is_internal: { type: Boolean, default: false },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    cursor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    last_rounded_at: Date,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

TeamSchema.index({ owner: 1, unique: true });
const Team = mongoose.model('team', TeamSchema);

module.exports = Team;
