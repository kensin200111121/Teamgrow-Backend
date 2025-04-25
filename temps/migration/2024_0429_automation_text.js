const mongoose = require('mongoose');
const { ENV_PATH } = require('../../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../src/configs/database');

const Automation = require('../../src/models/automation');
const Video = require('../../src/models/video');
const PDF = require('../../src/models/pdf');
const Image = require('../../src/models/image');
const { getTextMaterials } = require('../../src/helpers/utility');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    replaceMaterialId();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const replaceMaterialId = async () => {
  // find the downloaded automations
  const automations = await Automation.find({
    original_id: { $exists: true },
    created_at: { $gte: new Date('2024-03-15') },
  }).catch((err) => {});
  console.log('automations length', automations.length);
  for (let i = 0; i < automations.length; i++) {
    const automation = automations[i];
    const autos = automation.automations;
    const autoId = automation._id;
    const userId = automation.user;
    for (let ai = 0; ai < autos.length; ai++) {
      const auto = autos[ai];
      if (auto.action?.type === 'text') {
        let content = auto.action?.content;
        // find material IDs
        const { imageIds, videoIds, pdfIds } = getTextMaterials(content);
        if (!videoIds.length && !pdfIds.length && !imageIds.length) {
          continue;
        }
        // check if it is downloaded, or find downloaded material ID
        for (let vi = 0; vi < videoIds.length; vi++) {
          const ownVideo = await Video.findOne({
            _id: videoIds[vi],
            user: userId,
          });
          if (ownVideo) {
            continue;
          }
          const downloaded = await Video.findOne({
            original_id: videoIds[vi],
            user: userId,
          });
          if (downloaded) {
            content = content.replaceAll(videoIds[vi], downloaded._id + '');
          } else {
            console.log('not found the downloaded as well', videoIds[vi]);
          }
        }
        for (let vi = 0; vi < pdfIds.length; vi++) {
          const ownPdf = await PDF.findOne({
            _id: pdfIds[vi],
            user: userId,
          });
          if (ownPdf) {
            continue;
          }
          const downloaded = await PDF.findOne({
            original_id: pdfIds[vi],
            user: userId,
          });
          if (downloaded) {
            content = content.replaceAll(pdfIds[vi], downloaded._id + '');
          } else {
            console.log('not found the downloaded as well', videoIds[vi]);
          }
        }
        for (let vi = 0; vi < imageIds.length; vi++) {
          const ownImage = await Image.findOne({
            _id: imageIds[vi],
            user: userId,
          });
          if (ownImage) {
            continue;
          }
          const downloaded = await Image.findOne({
            original_id: imageIds[vi],
            user: userId,
          });
          if (downloaded) {
            content = content.replaceAll(imageIds[vi], downloaded._id + '');
          } else {
            console.log('not found the downloaded as well', videoIds[vi]);
          }
        }
        if (auto.action.content === content) {
          console.log('not update');
        } else {
          console.log('updated');
        }
        // replace the code
        auto.action.content = content;
      }
    }
    console.log('ai update', automation._id);
    await Automation.updateOne(
      { _id: autoId },
      { $set: { automations: autos } }
    )
      .then(console.log('automation update successful'))
      .catch((e) => console.log('automation update error', e.message));
  }
};
