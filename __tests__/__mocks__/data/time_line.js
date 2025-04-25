const mongoose = require('mongoose');

const timelines_data = [
  {
    _id: mongoose.Types.ObjectId('6705e05b7d0520fe34bcd7d7'),
    user: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
    contact: mongoose.Types.ObjectId('66f5620164ef5d5e4ee20258'),
    status: 'active',
    visible: true,
    due_date: new Date('2024-10-09T02:46:03.620+0000'),
    period: 1,
    action: {
      type: 'email',
      content: '',
      subject: 'abc',
      videos: [],
      pdfs: [],
      images: [],
      is_root: true,
    },
    ref: 'a_20255163-f83c-4906-a216-db97c85ee8d0',
    parent_ref: 'a_10000',
    automation: mongoose.Types.ObjectId('660a251306c7dccac920c3ec'),
    automation_line: mongoose.Types.ObjectId('6705e05b7d0520fe34bcd7d1'),
    type: 'contact',
    material_activities: [],
    watched_materials: [],
    finished_materials: [],
    created_at: new Date('2024-10-09T01:46:03.633+0000'),
    updated_at: new Date('2024-10-09T01:46:03.633+0000'),
  },
];

module.exports = { timelines_data };
