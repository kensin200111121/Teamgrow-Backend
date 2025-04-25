const mongoose = require('mongoose');
const findOrCreate = require('mongoose-findorcreate');

const Schema = mongoose.Schema;

const OriginLogSchema = new Schema(
  {
    endpoint: String,
    origin: String,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);
OriginLogSchema.plugin(findOrCreate);

const OriginLog = mongoose.model('origin_log', OriginLogSchema);

module.exports = OriginLog;
