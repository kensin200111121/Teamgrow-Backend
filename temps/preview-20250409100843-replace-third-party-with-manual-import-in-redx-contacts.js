const mongoose = require('mongoose');
const Contact = require('../src/models/contact');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    preview();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
  });

const preview = async () => {
  const contacts = await Contact.find({
    source: { $regex: '^redx$', $options: 'i' },
    tags: { $elemMatch: { $regex: '^third-party$', $options: 'i' } },
  }).catch((err) => {
    console.error('Error fetching contacts:', err);
    return [];
  });

  let totalChecked = 0;
  let totalNeedsUpdate = 0;

  for (const doc of contacts) {
    const originalTags = doc.tags;
    if (!Array.isArray(originalTags)) continue;

    const hasThirdParty = originalTags.some(
      (tag) => tag.toLowerCase() === 'third-party'
    );
    const hasManualImport = originalTags.some(
      (tag) => tag.toLowerCase() === 'manual import'
    );
    const updatedTags = originalTags.filter(
      (tag) => tag.toLowerCase() !== 'third-party'
    );
    if (hasThirdParty && !hasManualImport) {
      updatedTags.push('manual import');
    }

    console.log('RedX Cntact:', {
      _id: doc._id,
      source: doc.source,
      originalTags,
      updatedTags,
      hasThirdParty,
    });

    if (hasThirdParty) {
      totalNeedsUpdate++;
    }

    totalChecked++;
  }

  console.log('Preview complete.');
  console.log(`Total documents checked: ${totalChecked}`);
  console.log(`Total documents needing update: ${totalNeedsUpdate}`);

  mongoose.disconnect();
};
