const mongoose = require('mongoose');

const original_dealStages = [
  {
    _id: mongoose.Types.ObjectId('6704ddac7d0520fe34bca7e0'),
    user: mongoose.Types.ObjectId('5fd97ad994cf273d68a016da'),
    title: 'cde',
    priority: 2,
    pipe_line: mongoose.Types.ObjectId('a234567890abcdef01234567'),
    deals: [],
    duration: 0,
    created_at: new Date('2024-10-08T07:22:20.826Z'),
    updated_at: new Date('2024-10-08T07:36:11.66Z'),
    __v: 0,
    automation: mongoose.Types.ObjectId('6704da207d0520fe34bc999a'),
  },
  {
    _id: mongoose.Types.ObjectId('6704ddac7d0520fe34bca7de'),
    user: mongoose.Types.ObjectId('5fd97ad994cf273d68a016da'),
    title: 'abc',
    priority: 1,
    pipe_line: mongoose.Types.ObjectId('a234567890abcdef01234567'),
    deals: [],
    duration: 0,
    created_at: new Date('2024-10-08T07:22:20.816Z'),
    updated_at: new Date('2024-10-08T07:28:23.712Z'),
    __v: 0,
    automation: mongoose.Types.ObjectId('6704dd817d0520fe34bca766'),
  },
];

const newDownloadedDealStages = [
  {
    _id: mongoose.Types.ObjectId('6705088f5acad3545fa36a1f'),
    user: mongoose.Types.ObjectId('65f87caa392e882876fedf84'),
    title: 'abc',
    priority: 1,
    pipe_line: mongoose.Types.ObjectId('a234567890abcdef01234568'),
    deals: [],
    automation: mongoose.Types.ObjectId('670508965acad3545fa36a3d'),
    original_id: mongoose.Types.ObjectId('6704ddac7d0520fe34bca7de'),
    duration: 0,
    updated_at: new Date('2024-10-08T10:25:27.112Z'),
    created_at: new Date('2024-10-08T10:25:19.03Z'),
    __v: 0,
  },
  {
    _id: mongoose.Types.ObjectId('6705088f5acad3545fa36a20'),
    user: mongoose.Types.ObjectId('65f87caa392e882876fedf84'),
    title: 'cde',
    priority: 2,
    pipe_line: mongoose.Types.ObjectId('a234567890abcdef01234568'),
    deals: [],
    automation: mongoose.Types.ObjectId('670508965acad3545fa36a3c'),
    original_id: mongoose.Types.ObjectId('6704ddac7d0520fe34bca7e0'),
    duration: 0,
    updated_at: new Date('2024-10-08T10:25:26.823Z'),
    created_at: new Date('2024-10-08T10:25:19.03Z'),
    __v: 0,
  },
];

module.exports = {
  original_dealStages,
  newDownloadedDealStages,
};
