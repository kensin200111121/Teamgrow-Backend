const mongoose = require('mongoose');
const AutomationLine = require('../src/models/automation_line');
const Deal = require('../src/models/deal');
const TimeLine = require('../src/models/time_line');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose.set('strictQuery', false);
mongoose
  .connect(DB_PORT, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connecting to database successful');
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const getUnusefulList = async () => {
  console.log('hello it s me');
  const deal_automation_lines = await AutomationLine.find({
    deal: { $exists: true },
  });
  console.log('deal_automation_lines count', deal_automation_lines?.length);
  if (!deal_automation_lines.length) return;
  let autoline_list_cnt = 0;
  let timeline_list_cnt = 0;
  for (let i = 0; i < deal_automation_lines.length; i++) {
    console.log('current index', i);
    const dealId = deal_automation_lines[i].deal;
    const autoLineId = deal_automation_lines[i]._id;
    const deal = await Deal.findOne({ _id: dealId });
    if (!deal) {
      console.log('found invalid deal', dealId);
      const autoline = await AutomationLine.findOne({ _id: autoLineId });
      const timeline = await TimeLine.findOne({ automation_line: autoLineId });
      console.log('----real autoline id', autoline?._id);
      console.log('----real timeline id', timeline?._id);
      if (autoline) autoline_list_cnt++;
      if (timeline) timeline_list_cnt++;
    }
  }
  console.log('----invalid autoline_list_cnt', autoline_list_cnt);
  console.log('----invalid timeline_list_cnt', timeline_list_cnt);
};

getUnusefulList();
