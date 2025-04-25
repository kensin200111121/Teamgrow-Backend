const mongoose = require('mongoose');
const User = require('../src/models/user');
const Automation = require('../src/models/automation');
const AutomationLine = require('../src/models/automation_line');
const TimeLine = require('../src/models/time_line');
const { ENV_PATH } = require('../src/configs/path');
const fs = require('fs');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));
// TODO write your migration here.
// See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
// Example:
// await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
function parseUrlsAndIdsFromString(inputString) {
  // Regular expression to match the hosting site URLs and IDs
  var urlIdRegex = /href="(.crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+))"/g;

  var urlIdPairs = [];
  let match = urlIdRegex.exec(inputString);

  // Loop through matches and extract the hosting site URLs and IDs
  while (match !== null) {
    urlIdPairs.push({ url: match[1], id: match[3] });
    match = urlIdRegex.exec(inputString);
  }

  return urlIdPairs;
}

const test = async () => {
  const autoIds = await Automation.aggregate(
    [
      { $match: {} },
      { $unwind: '$automations' },
      { $match: { 'automations.action.content': { $regex: '".crmgrow' } } },
      {
        $group: {
          _id: '$_id',
        },
      },
    ],
    { allowDiskUse: true }
  );
  console.log('----AUTOIDS', autoIds);
  if (!autoIds.length) {
    return;
  }
  console.log('----1');
  for (let i = 0; i < autoIds.length; i++) {
    const auto = await Automation.findOne({ _id: autoIds[i]._id }).catch(
      (e) => {
        console.log('---get automation info error', e?.error);
      }
    );
    console.log('----2');
    if (auto) {
      console.log('----3');
      const automations = auto.automations;
      automations.map((a) => {
        console.log('----actiontype', a.action.type);
        if (a.action?.type !== 'email' && a.action?.type !== 'text') return a;
        console.log('----4');
        let content = a?.action?.content;
        if (!content) {
          return a;
        }
        console.log('----5');
        const pairIdUrl = parseUrlsAndIdsFromString(content);
        // get all href attributes in content html string
        if (pairIdUrl.length > 0) {
          pairIdUrl.forEach((pair) => {
            content = content.replaceAll(pair.url, `{{${pair.id}}}`);
          });
        }
        a.action.content = content;
        console.log('----content', content);
        return a;
      });
    }
  }
};

test();
