const mongoose = require('mongoose');
const Garbage = require('./garbage');

const Schema = mongoose.Schema;

const AutomationSchema = new Schema(
  {
    original_id: { type: mongoose.Schema.Types.ObjectId },
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    parent_id: { type: mongoose.Schema.Types.ObjectId },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    company: { type: String },
    automations: Array,
    type: { type: String, default: 'any' },
    label: { type: String, default: 'contact' },
    role: String,
    is_sharable: { type: Boolean, default: true },
    del: { type: Boolean, default: false },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment' }, // this is for scheduled time token
    meta: {
      action_count: { type: Number },
      videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
      pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
      images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
      tokens: [{ type: String }],
      has_email_action: { type: Boolean },
      has_text_action: { type: Boolean },
      has_child_automation: { type: Boolean },
    },
    version: { type: Number, default: 0 },
    original_version: { type: Number, default: 0 },
    isDownloading: Boolean,
    description: String,
    is_active: { type: Boolean, default: false },
    trigger: {
      type: {
        type: String,
        enum: [
          'deal_stage_updated',
          'contact_status_updated',
          'contact_tags_added',
          'material_viewed',
          'form_submitted',
        ],
      },
      detail: Object,
    },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const getTokenIds = (templateTokens = [], content = '') => {
  if (content === '') return [];
  if (!templateTokens?.length) return [];
  const result = [];
  templateTokens.forEach((token) => {
    if (content.includes(token?.name)) {
      result.push(token.id);
    }
  });
  return result;
};

const updateMetaData = async (automation, isVersionUpdate = false) => {
  const automations = automation?.automations || [];
  const garbage = await Garbage.findOne({ user: [automation?.user] });
  const customTokens = garbage?.template_tokens || [];
  const template_tokens = [...customTokens];
  let has_child_automation = false;
  let has_email_action = false;
  let has_text_action = false;
  let videos = [];
  let pdfs = [];
  let images = [];
  let tokens = [];

  for (const auto of automations) {
    let contentTokens = [];
    let titleTokens = [];
    if (auto?.action?.type === 'automation') {
      has_child_automation = true;
    }
    if (auto?.action?.type === 'email') {
      const content = auto?.action?.content || '';
      const title = auto?.action?.subject || '';
      has_email_action = true;
      contentTokens = getTokenIds(template_tokens, content);
      titleTokens = getTokenIds(template_tokens, title);
    }
    if (auto?.action?.type === 'text') {
      has_text_action = true;
      const content = auto?.action?.content || '';
      contentTokens = getTokenIds(template_tokens, content);
    }
    const actionVideos = auto?.action?.videos || [];
    const actionPdfs = auto?.action?.pdfs || [];
    const actionImages = auto?.action?.images || [];
    videos = Array.from(new Set([...videos, ...actionVideos]));
    pdfs = Array.from(new Set([...pdfs, ...actionPdfs]));
    images = Array.from(new Set([...images, ...actionImages]));
    tokens = Array.from(new Set([...tokens, ...contentTokens, ...titleTokens]));
  }
  automation.meta.action_count = automations.length;
  automation.meta.has_text_action = has_text_action;
  automation.meta.has_email_action = has_email_action;
  automation.meta.has_child_automation = has_child_automation;
  automation.meta.videos = videos;
  automation.meta.pdfs = pdfs;
  automation.meta.images = images;
  automation.meta.tokens = tokens;
  // version update
  if (isVersionUpdate) {
    if (!automation.isDownloading) automation.version += 1;
    automation.isDownloading = false;
  }

  return automation;
};

AutomationSchema.post('updateOne', async function (doc, next) {
  if (doc.modifiedCount > 0) {
    const updatedDoc = await this.model.findOne(this.getQuery());
    const automation = await updateMetaData(updatedDoc, true);
    automation.save();
  }
  return next();
});

AutomationSchema.pre('save', async function (next) {
  if (this.isNew) {
    await updateMetaData(this);
  }
  return next();
});

AutomationSchema.pre('insertMany', async function (next, docs) {
  for (const doc of docs) {
    await updateMetaData(doc);
  }
  return next();
});

AutomationSchema.index({ user: 1 });
AutomationSchema.index({ parent_id: 1 });
const Automation = mongoose.model('automation', AutomationSchema);

module.exports = Automation;
