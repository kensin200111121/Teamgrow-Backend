const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PersonalitySchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    role: { type: String, default: 'user' },
    content: String,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Personality = mongoose.model('personality', PersonalitySchema);

module.exports = Personality;
