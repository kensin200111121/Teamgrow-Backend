const mongoose = require('mongoose');

const contact_activity = {
  _id: mongoose.Types.ObjectId('672049a629a91cdd5d92712b'),
  contacts: '6182346731907d2654f690e9',
  user: '60a3ccd366774562474f14db',
  type: 'contacts',
};

const scheduler_activity_save = {
  _id: mongoose.Types.ObjectId('672049a629a91cdd5d92712b'),
  contacts: '6687faf0ff7afbfe5c81c0cf',
  appointments: '6708cb94dc179950390aa939',
  user: '654131f8e9a7318ee9b3a777',
  type: 'appointments',
};

const followup_activity = {
  _id: mongoose.Types.ObjectId('672049a629a91cdd5d92712d'),
  content: 'assigned task',
  contacts: mongoose.Types.ObjectId('65810c34de1693a3866e91b7'),
  user: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
  type: 'follow_ups',
  follow_ups: mongoose.Types.ObjectId('66f4184f02937c67a28e416e'),
};

const scheduler_noteActivity_save = {
  _id: mongoose.Types.ObjectId('672049a629a91cdd5d92712f'),
  contacts: mongoose.Types.ObjectId('6687faf0ff7afbfe5c81c0cf'),
  content: 'added note',
  user: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
  type: 'notes',
  notes: '6708cb94dc179950390aa93b',
  created_at: '2024-10-11T06:54:13.022Z',
  updated_at: '2024-10-11T06:54:13.022Z',
};

const assign_automation_activity = {
  _id: mongoose.Types.ObjectId('67203519c96f53a4eddc587b'),
  user: mongoose.Types.ObjectId('5fd97ad994cf273d68a016da'),
  content: 'assigned automation',
  type: 'automations',
  videos: [],
  pdfs: [],
  images: [],
  contacts: mongoose.Types.ObjectId('64e5748e119cab43b592587d'),
  automation_lines: mongoose.Types.ObjectId('67203519c96f53a4eddc5879'),
  automations: mongoose.Types.ObjectId('671f5435c96f53a4eddc27c0'),
  to_emails: [],
  receivers: [],
  created_at: new Date('2024-10-29T01:06:33.155Z'),
  updated_at: new Date('2024-10-29T01:06:33.155Z'),
  __v: 0,
};

const aggregate_activity_data = [
  {
    _id: { automation: mongoose.Types.ObjectId('6705e05b7d0520fe34bcd7d1') },
    activity: {
      _id: mongoose.Types.ObjectId('6705e05b7d0520fe34bcd7d3'),
      user: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
      content: 'assigned automation',
      type: 'automations',
      videos: [],
      pdfs: [],
      images: [],
      contacts: mongoose.Types.ObjectId('66f5620164ef5d5e4ee20258'),
      automation_lines: mongoose.Types.ObjectId('6705e05b7d0520fe34bcd7d1'),
      automations: mongoose.Types.ObjectId('660a251306c7dccac920c3ec'),
      to_emails: [],
      receivers: [],
      created_at: '2024-10-09T01:46:03.621Z',
      updated_at: '2024-10-09T01:46:03.621Z',
    },
    time: '2024-10-09T01:46:03.621Z',
    videos: [],
    pdfs: [],
    images: [],
    last: mongoose.Types.ObjectId('6705e05b7d0520fe34bcd7d3'),
  },
  {
    _id: { email: mongoose.Types.ObjectId('66fcaf42cf3598e4ab26786a') },
    activity: {
      _id: mongoose.Types.ObjectId('66fcaf42cf3598e4ab267871'),
      user: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
      content: 'sent email',
      type: 'emails',
      videos: [],
      pdfs: [],
      images: [],
      emails: mongoose.Types.ObjectId('66fcaf42cf3598e4ab26786a'),
      contacts: mongoose.Types.ObjectId('66f5620164ef5d5e4ee20258'),
      to_emails: [],
      subject: 'hallo',
      receivers: [Array],
      assigned_id: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
      created_at: '2024-10-02T02:26:10.949Z',
      updated_at: '2024-10-02T02:26:10.949Z',
    },
    time: '2024-10-02T02:26:10.949Z',
    videos: [],
    pdfs: [],
    images: [],
    last: mongoose.Types.ObjectId('66fcaf42cf3598e4ab267870'),
  },
  {
    _id: { single_id: '66f5620164ef5d5e4ee2025e' },
    activity: {
      _id: mongoose.Types.ObjectId('66f5620164ef5d5e4ee2025e'),
      user: mongoose.Types.ObjectId('64aef9d778c3d10e1b244319'),
      content: 'added',
      type: 'contacts',
      videos: [],
      pdfs: [],
      images: [],
      contacts: mongoose.Types.ObjectId('66f5620164ef5d5e4ee20258'),
      to_emails: [],
      receivers: [],
      single_id: '66f5620164ef5d5e4ee2025e',
      created_at: '2024-09-26T13:30:41.033Z',
      updated_at: '2024-09-26T13:30:41.033Z',
    },
    time: '2024-09-26T13:30:41.033Z',
    videos: [],
    pdfs: [],
    images: [],
    last: mongoose.Types.ObjectId('66f5620164ef5d5e4ee2025e'),
  },
];

const activities = [followup_activity, scheduler_noteActivity_save];

module.exports = {
  activities,
  contact_activity,
  followup_activity,
  scheduler_activity_save,
  scheduler_noteActivity_save,
  assign_automation_activity,
  aggregate_activity_data,
};
