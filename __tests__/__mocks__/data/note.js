const mongoose = require('mongoose');

const scheduler_note_save = {
  content: "<div>test3315</div><br>The scheduler's comment:<div>test</div>",
  contact: mongoose.Types.ObjectId('6687faf0ff7afbfe5c81c0cf'),
  user: mongoose.Types.ObjectId('654131f8e9a7318ee9b3a777'),
};

module.exports = { scheduler_note_save };
