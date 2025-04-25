const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const Automation = require('../src/models/automation');
const AutomationLine = require('../src/models/automation_line');
const Timeline = require('../src/models/time_line');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    migrateContactTimelines();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrateDealTimelines = async () => {
  const activeTimelines = await Timeline.aggregate([
    {
      $match: {
        automation_line: { $exists: false },
        deal: { $exists: true },
        status: 'active',
      },
    },
    { $group: { _id: '$deal', automation: { $last: '$automation' } } },
  ]).catch((err) => {});

  let failedCount = 0;
  activeTimelines.forEach(async (e, index) => {
    console.log('timeline ', index, e);
    const clonedAutomation = await Automation.findOne({ _id: e.automation });
    if (!clonedAutomation) {
      failedCount++;
      console.log('not found cloned automation');
      return;
    }
    const originalAutomationId = clonedAutomation.parent_id;
    const dealId = e._id;
    // create new automation line
    const newAutomationLine = new AutomationLine({
      automation: originalAutomationId,
      deal: dealId,
      user: clonedAutomation.user,
      status: 'running',
      automations: [],
      type: 'deal',
      title: clonedAutomation.title,
      action_count: clonedAutomation.meta?.action_count ?? 0,
      version: 1.1,
    });
    await newAutomationLine
      .save()
      .then((e) => {
        console.log('success - automation line creation');
      })
      .catch((err) => {
        console.log('automation line creation failed');
      });

    await Timeline.updateMany(
      { deal: dealId, automation: clonedAutomation._id },
      { $set: { automation_line: newAutomationLine._id } }
    )
      .then(() => {
        console.log(
          'success - timeline is updated with new automation line id'
        );
      })
      .catch((err) => {
        console.log('timeline is updated with new automation line id (failed)');
      });
  });

  console.log('failedCount ************************', failedCount);
};

const migrateContactTimelines = async () => {
  const activeTimelines = await Timeline.aggregate([
    {
      $match: {
        automation_line: { $exists: false },
        contact: { $exists: true },
        status: 'active',
      },
    },
    { $group: { _id: '$contact', automation: { $last: '$automation' } } },
  ]).catch((err) => {});

  let failedCount = 0;
  activeTimelines.forEach(async (e, index) => {
    console.log('timeline ', index, e);
    const clonedAutomation = await Automation.findOne({ _id: e.automation });
    const contactId = e._id;
    if (!clonedAutomation) {
      failedCount++;
      console.log('not found cloned automation', failedCount);
      // await Timeline.deleteMany({
      //   contact: contactId,
      //   automation: e.automation,
      // })
      //   .then(() => {
      //     console.log('success - timeline remove');
      //   })
      //   .catch((err) => {
      //     console.log('timeline is not removed (failed)');
      //   });
      // return;
      return;
    }
    const originalAutomationId = clonedAutomation.parent_id;
    // create new automation line
    const newAutomationLine = new AutomationLine({
      automation: originalAutomationId,
      contact: contactId,
      user: clonedAutomation.user,
      status: 'running',
      automations: [],
      type: 'contact',
      title: clonedAutomation.title,
      action_count: clonedAutomation.meta?.action_count ?? 0,
      version: 1.1,
    });
    await newAutomationLine
      .save()
      .then((e) => {
        console.log('success - automation line creation');
      })
      .catch((err) => {
        console.log('automation line creation failed');
      });

    await Timeline.updateMany(
      { contact: contactId, automation: clonedAutomation._id },
      { $set: { automation_line: newAutomationLine._id } }
    )
      .then(() => {
        console.log(
          'success - timeline is updated with new automation line id'
        );
      })
      .catch((err) => {
        console.log('timeline is updated with new automation line id (failed)');
      });
  });

  console.log('failedCount ************************', failedCount);
};

const activeProgressDealTimelines = async () => {
  const activeTimelines = await Timeline.aggregate([
    {
      $match: {
        automation_line: { $exists: false },
        deal: { $exists: true },
        status: 'progress',
      },
    },
  ]).catch((err) => {});

  activeTimelines.forEach(async (e, index) => {
    console.log('updating progressing timeline', index);
    const due_date = e.due_date;
    const day = Math.ceil(
      (Date.now() - due_date.getTime()) / (24 * 3600 * 1000)
    );
    const new_due_date = new Date(due_date.getTime() + 24 * 3600 * 1000 * day);

    await Timeline.updateOne(
      { _id: e._id },
      { $set: { status: 'active', due_date: new_due_date } }
    )
      .then(() => {
        console.log('success - updated');
      })
      .catch((err) => {
        console.log('failed');
      });
  });
};

const activeProgressContactTimelines = async () => {
  const activeTimelines = await Timeline.aggregate([
    {
      $match: {
        automation_line: { $exists: false },
        contact: { $exists: true },
        status: 'progress',
      },
    },
    { $limit: 1000 },
  ]).catch((err) => {});

  for (let i = 0; i < 1000; i++) {
    const e = activeTimelines[i];
    console.log('updating progressing timeline', i);
    const due_date = e.due_date;
    const day = Math.ceil(
      (Date.now() - due_date.getTime()) / (24 * 3600 * 1000)
    );
    const new_due_date = new Date(
      due_date.getTime() + 24 * 3600 * 1000 * (day + 1)
    );

    await Timeline.updateOne(
      { _id: e._id },
      { $set: { status: 'active', due_date: new_due_date } }
    )
      .then(() => {
        console.log('success - updated, ', i);
      })
      .catch((err) => {
        console.log('failed');
      });
  }
};
