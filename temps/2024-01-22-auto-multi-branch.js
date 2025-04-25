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

const getChildInfo = (automations, parentId, result) => {
  const child = automations.filter((e) => e.parent === parentId);
  if (child?.length) {
    child.forEach((e) => {
      result.childCnt++;
      getChildInfo(automations, e.id, result);
    });
  } else {
    result.childId = parentId;
  }
};

const migrateAuto = async () => {
  // "automation":"643e57fa458f414473a979ac","parent":"a_10000"
  const idStr = '64623dd25b3b9acbb5e91277';
  const parentStr = 'a_10000';
  const auto = await Automation.findOne({
    _id: mongoose.Types.ObjectId(idStr),
  });
  if (!auto?.automations?.length) return;
  const mainIds = [];
  const automations = auto.automations;
  automations.forEach((e) => {
    if (e.parent === parentStr) {
      mainIds.push(e.id);
    }
  });
  console.log('main_autos', mainIds);
  if (mainIds?.length !== 2) return;
  const result = [];
  mainIds.forEach((e) => {
    const res = { parent: e, childCnt: 1, childId: e };
    result.push(res);
    getChildInfo(automations, e, res);
  });
  console.log('all result', result);
  const newNodeInfo = { id: null, parent: null };
  if (result[0].childCnt <= result[1].childCnt) {
    newNodeInfo.id = result[1].parent;
    newNodeInfo.parent = result[0].childId;
  } else {
    newNodeInfo.id = result[0].parent;
    newNodeInfo.parent = result[1].childId;
  }
  console.log('newNodeInfo', newNodeInfo);
  const newAutomations = automations.map((e) => {
    if (e.id === newNodeInfo.id) e.parent = newNodeInfo.parent;
    return e;
  });
  // console.log('newAutomations', newAutomations);
  await Automation.updateOne(
    { _id: mongoose.Types.ObjectId(idStr) },
    {
      $set: { automations: newAutomations },
    }
  ).catch((err) => {
    console.log('err', err.message);
  });
};
const getIssueAutos = async () => {
  const autos = await Automation.aggregate(
    [
      { $match: {} },
      { $unwind: '$automations' },
      {
        $group: {
          _id: '$_id',
          user: { $first: '$user' },
          title: { $first: '$title' },
          type: { $first: '$type' },
          label: { $first: '$label' },
          created_at: { $first: '$created_at' },
          updated_at: { $first: '$updated_at' },
          parent_refs: {
            $push: {
              $cond: {
                // if: { $in: ['$automations.condition', [undefined, null] ] },
                if: '$automations.condition',
                then: null,
                else: '$automations.parent',
              },
            },
          },
        },
      },
      { $unwind: '$parent_refs' },
      { $match: { parent_refs: { $ne: null } } },
      {
        $group: {
          _id: {
            automation: '$_id',
            parent: '$parent_refs',
            user: '$user',
            title: '$title',
            type: '$type',
            label: '$label',
            created_at: '$created_at',
            updated_at: '$updated_at',
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 } } },
    ],
    { allowDiskUse: true }
  );

  if (!autos?.length) return;
  const autoInfos = [];
  const userIds = [];
  for (let i = 0; i < autos.length; i++) {
    if (!autoInfos.some((aid) => aid._id + '' === autos[i]._id.automation + ''))
      autoInfos.push({
        _id: autos[i]._id.automation + '',
        count: autos[i].count + '',
        user: autos[i]._id.user + '',
        title: autos[i]._id.title,
        type: autos[i]._id.type,
        label: autos[i]._id.label,
        created_at: autos[i]._id.created_at,
        updated_at: autos[i]._id.updated_at,
      });
    if (!userIds.some((uid) => uid + '' === autos[i]._id.user + ''))
      userIds.push(autos[i]._id.user + '');
  }
  console.log('auto length', autos.length);
  console.log('autoIds', autoInfos.length);
  console.log('userIds', userIds.length);

  autos.forEach((e) => {
    console.log(e._id.automation, e._id.parent);
  });

  const userList = await User.find({ _id: userIds });
  if (!userList.length) return;
  const userEmails = userList.map((u) => {
    return { _id: u._id + '', email: u.email };
  });
  for (let i = 0; i < autoInfos.length; i++) {
    const cnt = await TimeLine.find({ automation: autoInfos[i]._id }).count();
    autoInfos[i].timeline = cnt;

    const acnt = await AutomationLine.find({
      automation: autoInfos[i]._id,
    }).count();
    autoInfos[i].automation_line = acnt;
    console.log('----id', autoInfos[i]._id, 't-cnt', cnt, 'a-cnt', acnt);
  }
  const newAutodata = autoInfos.map((e) => {
    const email = userEmails.filter((ue) => ue._id === e.user)[0].email;
    e.email = email;
    return e;
  });
  const useremail = fs.createWriteStream('userEmails.csv');
  useremail.on('error', (err) => {
    console.log('error');
  });
  newAutodata.forEach((v) => {
    useremail.write(
      v._id +
        ', ' +
        v.count +
        ', ' +
        v.title +
        ', ' +
        v.type +
        ', ' +
        v.label +
        ', ' +
        v.user +
        ', ' +
        v.email +
        ', ' +
        v.timeline +
        ', ' +
        v.automation_line +
        ', ' +
        '\n'
    );
  });
  useremail.end();
  console.log('---finished');
};

getIssueAutos();
// migrateAuto();
