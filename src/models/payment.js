const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PaymentSchema = new Schema(
  {
    email: String,
    customer_id: String,
    card_id: String,
    plan_id: String,
    price_id: String,
    subscription: String,
    bill_amount: String, // unused
    referral: String, // unused
    coupon: String, // unused
    // type: { type: String, default: 'crmgrow' },
    active: { type: Boolean, default: false },
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Payment = mongoose.model('payment', PaymentSchema);

module.exports = Payment;
