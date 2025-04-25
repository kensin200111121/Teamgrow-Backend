const mongoose = require('mongoose');
const Label = require('../src/models/label');
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
  const labels = await Label.find({}).catch((err) => {
    console.error('Error fetching Label documents:', err);
    return [];
  });

  let totalChecked = 0;
  let totalHasNoName = 0;
  let totalNeedsUpdate = 0;

  for (const doc of labels) {
    totalChecked++;

    if (!doc.name) {
      console.log('Skipping label document with no name');
      totalHasNoName++;
      continue;
    }

    const normalized = doc.name.toLowerCase();
    const isChanged = doc.name !== normalized;
    console.log('Checking label document:');
    console.log({
      _id: doc._id,
      name: doc.name,
      normalized_name: normalized,
      changed: isChanged ? 'YES' : 'NO',
    });
    console.log('---');

    if (!isChanged) continue;

    totalNeedsUpdate++;
  }

  console.log('Preview complete.');
  console.log(`Documents checked: ${totalChecked}`);
  console.log(`Documents needing update: ${totalNeedsUpdate}`);
  console.log(`Documents has no name: ${totalHasNoName}`);

  mongoose.disconnect();
};
