const { DEFAULT_BUCKETS } = require('../constants/bucket');
const SphereBucket = require('../models/sphere_bucket');

const initContactBuckets = async (userId) => {
  const buckets = DEFAULT_BUCKETS.map((e) => {
    return {
      ...e,
      user: userId,
    };
  });

  await SphereBucket.insertMany(buckets).catch(() => {});
  return buckets;
};

module.exports = {
  initContactBuckets,
};
