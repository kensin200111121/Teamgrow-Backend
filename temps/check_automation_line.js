const mongoose = require('mongoose');
const User = require('../src/models/user');
const Automation = require('../src/models/automation');
const { ENV_PATH } = require('../src/configs/path');
const fs = require('fs');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('connected successfully');
    checkDBStatus();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const checkDBStatus = async () => {
  // sub automations are any and other actions can be any (doesn't contact/deal only action)
  const automationStatus = await Automation.aggregate([
    {
      $match: {
        automations: { $elemMatch: { 'action.type': 'automation' } },
        is_migrated: { $ne: true },
      },
    },
    { $unwind: '$automations' },
    { $match: { 'automations.action.type': 'automation' } },
    {
      $addFields: {
        sub_automation_id: {
          $convert: {
            input: '$automations.action.automation_id',
            to: 'objectId',
          },
        },
      },
    },
    {
      $group: { _id: '$_id', automation_ids: { $push: '$sub_automation_id' } },
    },
    {
      $lookup: {
        from: 'automations',
        localField: 'automation_ids',
        foreignField: '_id',
        as: 'details',
      },
    },
    { $match: { details: { $not: { $elemMatch: { type: { $ne: 'any' } } } } } },
    { $project: { details: -1 } },
  ]);

  if (!automationStatus.length) {
    return;
  }
  console.log('automationstatus length', automationStatus.length);
  let updated = 0;
  for (let i = 0; i < automationStatus.length; i++) {
    const automationDetail = await Automation.findById(automationStatus[i]._id);

    let auto_type = 'any';
    for (let i = 0; i < automationDetail.automations.length; i++) {
      const type = automationDetail.automations[i].action.type;
      if (type === 'move_deal') {
        auto_type = 'deal';
      } else if (
        type === 'deal' ||
        type === 'move_contact' ||
        type === 'contact_condition' ||
        type === 'share_contact'
      ) {
        auto_type = 'contact';
      }
    }

    console.log(
      'auto type',
      i,
      automationDetail._id,
      automationDetail.type,
      auto_type
    );
    if (automationDetail.type !== auto_type) {
      automationDetail.type = auto_type;
      updated++;
    }
    automationDetail.is_migrated = true;
    // automationDetail.type = auto_type;
    // await automationDetail.save();
  }
  console.log('updated', updated);
  // checkDBStatus();
};
