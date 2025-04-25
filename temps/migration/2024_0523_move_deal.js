const mongoose = require('mongoose');
const { ENV_PATH } = require('../../src/config/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../../src/config/database');

const PipeLine = require('../../src/models/pipe_line');
const DealStage = require('../../src/models/deal_stage');
const Deal = require('../../src/models/deal');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    moveDeal();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const moveDeal = async () => {
  const angela = mongoose.Types.ObjectId('623f4ed69544620016c33217');
  const jimmy = mongoose.Types.ObjectId('634ddac7af9e97001607af97');
  const angela_pipeline = mongoose.Types.ObjectId('624311529e8da70015243c05');
  const jimmy_pipeline = mongoose.Types.ObjectId('65e8df52dc0fa179c1ec9b50');

  const dealStages = await DealStage.find({
    user: jimmy,
    pipe_line: jimmy_pipeline,
  }).catch((err) => console.log(err));
  console.log('deal-stages: ', dealStages.length);

  for (const dealStage of dealStages) {
    console.log('jimmy-deal-stage: ', dealStage?._id, dealStage?.title);
    const angela_deal_stage = await DealStage.findOne(
      {
        pipe_line: angela_pipeline,
        user: angela,
        priority: dealStage?.priority,
      }
      // { $addToSet: { deals: { $each: [deal_doc?._id] } } }
    ).catch((err) => console.log('angel_deal_stage update error: ', err));
    console.log(
      'angela_deal_stage: ',
      angela_deal_stage?._id,
      angela_deal_stage?.title
    );
    for (const deal of dealStage.deals) {
      const deal_doc = await Deal.findOne({ _id: deal }).catch((err) =>
        console.log(err)
      );
      if (deal_doc?.user.toString() === angela.toString()) {
        console.log('=== angela ===');
        // await DealStage.findOneAndUpdate(
        //   { pipeline: angela_pipeline, user: angela, title: dealStage?.title },
        //   { $set: { deals: { $push: deal } } }
        // );
        // await DealStage.findOneAndUpdate(
        //   { _id: dealStage },
        //   { $set: { deals: { $pull: deal } } }
        // );
      }
    }
  }
};
