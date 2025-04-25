const mongoose = require('mongoose');

const scheduler_req = {
  user_id: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
  description: "<div>test3315</div><br>The scheduler's comment:<div>test</div>",
  due_end: '2024-10-09T14:30:00+09:00',
  due_start: '2024-10-09T14:15:00+09:00',
  email: 'wu@crmgrow.com',
  event_type: {
    event_type_id: mongoose.Types.ObjectId('66d9670ab69bb7e93e137117'),
  },
  first_name: 'wu',
  guests: ['wu@crmgrow.com'],
  last_name: 'lei',
  local_timezone: 'Asia/Tokyo',
  location: 'Rau, Indore, Madhya Pradesh 452007, India',
  scheduler_comment: 'test',
  scheduler_timezone: 'Asia/Tokyo',
  timezone: 'Asia/Tokyo',
  title: 'test3315',
};

const checkConflict_data = {
  user_id: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
  date: '2024-10-14T09:00:00+09:00',
  event_type_id: mongoose.Types.ObjectId('66d9670ab69bb7e93e137117'),
};

module.exports = { scheduler_req, checkConflict_data };
