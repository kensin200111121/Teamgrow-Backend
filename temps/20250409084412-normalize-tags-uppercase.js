const mongoose = require('mongoose');
const Tag = require('../src/models/tag');
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
  const tags = await Tag.find({}).catch((err) => {
    console.error('Error fetching tag documents:', err);
    return [];
  });

  let totalChecked = 0;
  let totalNeedsUpdate = 0;

  for (const doc of tags) {
    const original = doc.tags;
    if (!Array.isArray(original)) continue;

    const normalized = [...new Set(original.map((tag) => tag.toLowerCase()))];
    const isChanged = JSON.stringify(original) !== JSON.stringify(normalized);

    if (isChanged) {
      totalNeedsUpdate++;

      console.log('Needs update:');
      console.log({
        _id: doc._id,
        user: doc.user,
        before: original,
        after: normalized,
      });
      console.log('---');
    }

    totalChecked++;
  }

  console.log('Preview complete.');
  console.log(`Documents checked: ${totalChecked}`);
  console.log(`Documents needing update: ${totalNeedsUpdate}`);

  mongoose.disconnect();
};
