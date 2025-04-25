const mongoose = require('mongoose');
const Garbage = require('./garbage');

const Schema = mongoose.Schema;

const EmailSchema = new Schema(
  {
    original_id: { type: mongoose.Schema.Types.ObjectId },
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'team' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    subject: String,
    content: String,
    role: String,
    company: { type: String },
    video_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    pdf_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    image_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    token_ids: [{ type: String }],
    type: String,
    default: { type: Boolean, default: false },
    is_sharable: { type: Boolean, default: true },
    del: { type: Boolean, default: false },
    category: String,
    attachments: Array,
    meta: {
      excerpt: { type: String },
    },
    version: { type: Number, default: 0 },
    original_version: { type: Number, default: 0 },
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

const updateMetaData = async (template) => {
  const garbage = await Garbage.findOne({ user: [template?.user] });
  const customTokens = garbage?.template_tokens || [];
  const usedTokenIds = getTokenIds(
    [...customTokens],
    (template.subject || '') + ' ' + template.content
  );
  template.token_ids = usedTokenIds;
  return template;
};

EmailSchema.pre('save', async function (next) {
  if (this.isNew) {
    await updateMetaData(this);
  }
  return next();
});

EmailSchema.pre('updateOne', async function (next) {
  const origin_doc = await this.model.findOne(this.getQuery());
  const update = this.getUpdate();
  if (update.$set.content !== origin_doc.content) {
    update.$set.version += 1;
  }
  return next();
});

EmailSchema.post('updateOne', async function (doc, next) {
  if (doc.modifiedCount) {
    const updatedDoc = await this.model.findOne(this.getQuery());
    const template = await updateMetaData(updatedDoc);
    template.save();
  }
  return next();
});

EmailSchema.pre('insertMany', async function (next, docs) {
  for (const doc of docs) {
    await updateMetaData(doc);
  }
  return next();
});

const EmailTemplate = mongoose.model('email_template', EmailSchema);

module.exports = EmailTemplate;
