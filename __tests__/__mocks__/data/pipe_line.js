const mongoose = require('mongoose');

const correct_pipeline_req = [
  {
    _id: 'a234567890abcdef01234567',
    type: 'pipeline',
  },
];

const incorrect_pipeline_req = [
  {
    _id: 'a234567890abcdef01234569',
    type: 'pipeline',
  },
];

const original_pipelines = [
  {
    _id: mongoose.Types.ObjectId('a234567890abcdef01234567'),
    user: mongoose.Types.ObjectId('62d6e99b4304d536d9cf9829'),
    title: 'pipeline4',
    version: 1,
    has_automation: true,
    no_automation: true,
    original_version: 0,
    created_at: new Date('2024-09-18T09:05:50.113Z'),
    updated_at: new Date('2024-09-18T09:06:16.882Z'),
    __v: 0,
  },
  {
    _id: mongoose.Types.ObjectId('a234567890abcdef01234569'),
    user: mongoose.Types.ObjectId('5fd97ad994cf273d68a016da'),
    title: 'KKKKKKKKKK',
    version: 2,
    has_automation: true,
    no_automation: true,
    original_version: 0,
    created_at: new Date('2024-09-30T19:41:06.344Z'),
    updated_at: new Date('2024-10-08T07:37:18.231Z'),
    __v: 0,
  },
];

const newDownloadedPipelines = [
  {
    _id: mongoose.Types.ObjectId('a234567890abcdef01234568'),
    user: mongoose.Types.ObjectId('63b6ec5db199d3535de0f616'),
    title: 'B pipeline',
    version: 0,
    updated_at: new Date('2024-09-30T19:36:16.971Z'),
    created_at: new Date('2024-09-30T19:37:10.181Z'),
    has_automation: true,
    no_automation: true,
    original_id: mongoose.Types.ObjectId('a234567890abcdef01234567'),
    original_version: 1,
    __v: 0,
  },
];

module.exports = {
  correct_pipeline_req,
  incorrect_pipeline_req,
  original_pipelines,
  newDownloadedPipelines,
};
