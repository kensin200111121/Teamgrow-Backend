const mongoose = require('mongoose');

const request_folders = {
  folders: [
    mongoose.Types.ObjectId('64aef9d778c3d10e1b24431c'),
    mongoose.Types.ObjectId('6604f2b63eca179bba4f3672'),
  ],
};

const request_folder = {
  folder: mongoose.Types.ObjectId('64aef9d778c3d10e1b24431c'),
};

const request_videos = [
  mongoose.Types.ObjectId('6604f1023eca179bba4f35fa'),
  mongoose.Types.ObjectId('660bab1579ed6e3c8b8bdc81'),
];

const request_images = [
  mongoose.Types.ObjectId('6604f1513eca179bba4f361f'),
  mongoose.Types.ObjectId('660bab5f79ed6e3c8b8bdd5b'),
];

const request_pdfs = [
  mongoose.Types.ObjectId('6661dce9d88c4d1fadf9dab1'),
  mongoose.Types.ObjectId('6661debbd88c4d1fadf9dce3'),
];

const request_templates = [
  mongoose.Types.ObjectId('6605323f3eca179bba4f4959'),
  mongoose.Types.ObjectId('66a7373c7bd064fdb592004c'),
];

const request_automations = [
  mongoose.Types.ObjectId('660508063eca179bba4f446f'),
  mongoose.Types.ObjectId('660ba2f579ed6e3c8b8bd8b9'),
];

module.exports = {
  request_folders,
  request_folder,
  request_videos,
  request_pdfs,
  request_images,
  request_templates,
  request_automations,
};
