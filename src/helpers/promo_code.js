const mongoose = require('mongoose');
const PromoCode = require('../models/promo_code');
const system_settings = require('../configs/system_settings');
const { flip } = require('./utility');

const OfferOption = {
  trial: system_settings.OFFER.ONE_MONTH_TRIAL,
  discount: system_settings.OFFER.TWENTY_PERCENT_DISCOUNT,
};
const FlippedOfferOption = flip(OfferOption);

const create = ({ code, offer }) => {
  const promoCode = new PromoCode({
    code,
    offer: OfferOption[offer],
  });

  return new Promise((resolve, reject) => {
    promoCode
      .save()
      .then(() => {
        resolve({
          ...promoCode._doc,
          offer,
        });
      })
      .catch(() => {
        reject();
      });
  });
};

const remove = (id) => {
  return new Promise((resolve, reject) => {
    PromoCode.deleteOne({ _id: mongoose.Types.ObjectId(id) })
      .then(() => {
        resolve();
      })
      .catch(() => {
        reject();
      });
  });
};

const update = async (id, data) => {
  if (data['offer']) {
    data['offer'] = OfferOption[data['offer']];
  }
  await PromoCode.updateOne(
    { _id: mongoose.Types.ObjectId(id) },
    { $set: { ...data } }
  )
    .then(() => {})
    .catch(() => {});
};

const load = async () => {
  const data = await PromoCode.find({}).catch(() => {});
  return (data || []).map((e) => ({
    ...e._doc,
    offer: FlippedOfferOption[e.offer],
  }));
};

const findByCode = async (code) => {
  const data = await PromoCode.findOne({ code }).catch(() => {});
  return data;
};

const getOffer = async (code) => {
  const data = await findByCode(code);

  if (data) {
    return data.offer;
  } else {
    return null;
  }
};

module.exports = {
  create,
  remove,
  update,
  load,
  findByCode,
  getOffer,
};
