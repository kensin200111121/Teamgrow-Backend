const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const FolderSchema = new Schema(
  {
    original_id: { type: mongoose.Schema.Types.ObjectId },
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'team' }, // Download Source Team Pointer
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'team' }, // Team Folder Pointer
    rootFolder: { type: Boolean, default: false },
    title: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    origin_team: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    folders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'folder' }],
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    templates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'template' }],
    automations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'automation' }],
    pipelines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pipeline' }],
    company: { type: String },
    role: { type: String },
    is_sharable: { type: Boolean, default: true },
    del: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ['material', 'template', 'automation'],
      default: 'material',
    }, // material, template, automation ...
    version: { type: Number, default: 0 },
    original_version: { type: Number, default: 0 },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Folder = mongoose.model('folder', FolderSchema);

module.exports = Folder;
