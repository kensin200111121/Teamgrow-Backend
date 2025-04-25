const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PromoCodeSchema = new Schema(
  {
    code: String,
    offer: String,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

PromoCodeSchema.index({ user: 1, title: 1 });
const PromoCode = mongoose.model('promo_code', PromoCodeSchema);

module.exports = PromoCode;
