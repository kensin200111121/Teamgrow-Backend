const mongoose = require('mongoose');
const Contact = require('../src/models/contact');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');

// Connect to MongoDB
mongoose
  .connect(DB_PORT, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    preview();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
  });

// Preview tag normalization for Contact documents
const preview = async () => {
  const contacts = await Contact.find({}).catch((err) => {
    console.error('Error fetching contacts:', err);
    return [];
  });

  let totalChecked = 0;
  let totalNeedsUpdate = 0;

  for (const doc of contacts) {
    const original = doc.tags;
    if (!Array.isArray(original)) continue;

    const normalized = [...new Set(original.map((tag) => tag.toLowerCase()))];
    const isChanged = JSON.stringify(original) !== JSON.stringify(normalized);

    console.log('Checking contact document:');
    console.log({
      _id: doc._id,
      user: doc.user,
      original_tags: original,
      normalized_tags: normalized,
      changed: isChanged ? 'YES' : 'NO',
    });
    console.log('---');

    if (isChanged) {
      totalNeedsUpdate++;
    }

    totalChecked++;
  }

  console.log('Preview complete.');
  console.log(`Total documents checked: ${totalChecked}`);
  console.log(`Total documents needing update: ${totalNeedsUpdate}`);

  mongoose.disconnect();
};
