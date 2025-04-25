const mongoose = require('mongoose');

const appointment_data = {
  due_start: '2024-10-09T14:15:00+09:00',
  type: 2,
  event_type_id: mongoose.Types.ObjectId('66d9670ab69bb7e93e137117'),
  user: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
};

const scheduler_appointment_save = {
  event_type: mongoose.Types.ObjectId('66d9670ab69bb7e93e137117'),
  user_id: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
  title: 'test3315',
  _appointment: {
    description:
      "<div>test3315</div><br>The scheduler's comment:<div>test</div>",
  },
  location: 'Rau, Indore, Madhya Pradesh 452007, India',
  due_start: '2024-10-11T16:00:00+09:00',
  due_end: '2024-10-11T16:15:00+09:00',
  email: 'wu@crmgrow.com',
  guests: ['wu@crmgrow.com'],
  first_name: 'wu',
  last_name: 'lei',
  timezone: 'Asia/Tokyo',
  scheduler_timezone: 'Asia/Tokyo',
  scheduler_comment: 'test',
  local_timezone: 'Asia/Tokyo',
  contacts: '6687faf0ff7afbfe5c81c0cf',
  user: '654131f8e9a7318ee9b3a777',
  type: 2,
  event_id: '6rs9mmko24ip4tgfg3rmqm3lf8',
  recurrence_id: '6rs9mmko24ip4tgfg3rmqm3lf8',
  remind_at: 'Moment<2024-10-11T15:30:00+09:00>',
};

module.exports = { appointment_data, scheduler_appointment_save };
