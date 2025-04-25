// Timeline issue fix
const mongoose = require('mongoose');
const Task = require('../src/models/task');
const User = require('../src/models/user');
const Folder = require('../src/models/folder');
const Automation = require('../src/models/automation');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrate();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrate = async () => {
  const users = await User.find({ del: false });
  for (let index = 0; index < users.length; index++) {
    const user = users[index];
    const root_folder = await Folder.findOne({
      user: user._id,
      rootFolder: true,
      del: false,
    }).catch((err) => console.log('root folder ', err));
    const sub_folders = await Folder.find({
      user: user._id,
      type: 'automation',
      del: false,
    });
    // console.log('root:', user._id, root_folder);
    if (root_folder == null) continue;
    let automationIds = [...root_folder.automations];
    for (let index = 0; index < sub_folders.length; index++) {
      const sub_folder = sub_folders[index];
      automationIds = [...automationIds, ...sub_folder.automations];
    }
    // console.log('sub_folders:', sub_folders);
    const automation_query = {
      _id: { $nin: automationIds },
      user: user._id,
      clone_assign: { $ne: true },
      del: { $ne: true },
    };
    const automationList = await Automation.find(automation_query);
    if (automationList.length) {
      const autoIds = automationList.map((a) => a._id);
      if (root_folder) {
        const nwAutomations = [...root_folder.automations, ...autoIds];
        // console.info('user:', user);
        console.log('existIds:', automationIds);
        console.info('autoIds:', autoIds);
      }
    }
  }
};
