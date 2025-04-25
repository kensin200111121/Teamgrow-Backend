const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CardSchema = new Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'payment' },
    card_name: String,
    card_id: String,
    fingerprint: String,
    card_brand: String,
    exp_year: String,
    exp_month: String,
    last4: String,
    is_primary: { type: Boolean, default: false },
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);
CardSchema.index({ payment: 1 });
CardSchema.index({ card_id: 1 });
const Card = mongoose.model('card', CardSchema);

module.exports = Card;
