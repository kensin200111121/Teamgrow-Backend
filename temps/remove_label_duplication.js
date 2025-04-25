const mongoose = require('mongoose');
const Label = require('../src/models/label');
const Contact = require('../src/models/contact');
const { ENV_PATH } = require('../src/configs/path');
const moment = require('moment-timezone');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrate3();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const migrate1 = async () => {
  // Before this, remove the db unique index
  // Migrate 1 (replace with old one)
  Label.aggregate([
    {
      $match: {
        $expr: { $eq: [{ $strLenCP: '$name' }, 24] },
        name: { $regex: /^[a-z0-9_.-]*$/ },
      },
    },
    { $sort: { name: 1, user: 1 } },
    { $group: { _id: '$name' } },
  ]).then(async (labels) => {
    for (let i = 0; i < labels.length; i++) {
      const oldId = labels[i]._id;

      const oldLabel = await Label.findOne({ _id: oldId });

      if (oldLabel) {
        const result = await Label.updateMany(
          { name: oldId },
          { $set: { name: oldLabel.name } }
        ).catch((err) => {
          console.log('err', err);
        });
        console.log(result);
      } else {
        console.log('old label does not exist', i);
      }
    }
  });
};

const migrate2 = async () => {
  // Migrate 2 (update the unnamed label)
  const updated = await Label.updateMany(
    {
      $expr: { $eq: [{ $strLenCP: '$name' }, 24] },
      name: { $regex: /^[a-z0-9_.-]*$/ },
    },
    { $set: { name: 'Unnamed' } }
  ).catch((err) => {
    console.log(err);
  });
  console.log('updated', updated);
};

const migrate3 = () => {
  // Migrate 3 (remove duplicatioin)
  Label.aggregate([
    {
      $group: {
        _id: { name: '$name', user: '$user' },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gte: 2 } } },
  ]).then(async (labels) => {
    for (let i = 0; i < labels.length; i++) {
      const ids = labels[i].ids;
      const user = labels[i]['_id']['user'];

      const main = ids[0];
      const remained = ids.slice(1);

      const contactRes = await Contact.updateMany(
        { user, label: { $in: remained } },
        { $set: { label: main } }
      ).catch((e) => {
        console.log('error', e);
      });
      console.log(contactRes);

      const labelRes = await Label.deleteMany({
        _id: { $in: remained },
      }).catch((e) => {
        console.log('error', e);
      });
      console.log(labelRes);
    }
  });
};
