const { v1: uuidv1 } = require('uuid');
const Outbound = require('../models/outbound');
const { outbound_constants } = require('../constants/variable');
const {
  outboundCallhookApi,
  getContactOutboundData,
  getContactOutboundRecentData,
  getRemoveContactOutboundRecentData,
  getDealOutboundRecentData,
  getMoveDealOutboundRecentData,
  getSendMaterialOutbounRecentdData,
  getWatchMaterialOutboundRecentData,
  getWatchMaterialOutboundData,
  getAssignedAutomationOutboundRecentData,
  getNoteOutboundRecentData,
  getFollowupOutboundRecentData,
  getRemoveFollowupOutboundRecentData,
} = require('../helpers/outbound');

const getSampleData = async (params) => {
  const { action, userid, data } = params;
  console.log('getSampleData', data); // put to confirm data from zapier
  let res = {};
  switch (action) {
    case outbound_constants.ADD_CONTACT:
    case outbound_constants.UPDATE_CONTACT:
      res = await getContactOutboundRecentData(userid);
      break;
    case outbound_constants.LEAD_SOURCE:
      res = await getContactOutboundRecentData(userid, data);
      break;
    case outbound_constants.DELETE_CONTACT:
      res = await getRemoveContactOutboundRecentData(userid);
      break;
    case outbound_constants.ADD_DEAL:
      res = await getDealOutboundRecentData(userid);
      break;
    case outbound_constants.MOVE_DEAL:
      res = await getMoveDealOutboundRecentData(userid);
      break;
    case outbound_constants.SEND_MATERIAL:
      res = await getSendMaterialOutbounRecentdData(userid);
      break;
    case outbound_constants.WATCH_MATERIAL:
      res = await getWatchMaterialOutboundRecentData(userid);
      break;
    case outbound_constants.ASSINGED_AUTOMATION:
      res = await getAssignedAutomationOutboundRecentData(userid);
      break;
    case outbound_constants.CREATE_NOTE:
    case outbound_constants.UPDATE_NOTE:
    case outbound_constants.DELETE_NOTE:
      res = await getNoteOutboundRecentData(userid);
      break;
    case outbound_constants.CREATE_TASK:
    case outbound_constants.UPDATE_TASK:
      res = await getFollowupOutboundRecentData(userid);
      break;
    case outbound_constants.DELETE_TASK:
      res = await getRemoveFollowupOutboundRecentData(userid);
      break;
  }
  return res;
};

const outboundSubscribe = async (req, res) => {
  const { currentUser } = req;
  const { hookUrl, action, data } = req.body;
  const _id = new Date().getTime() + uuidv1();
  await Outbound.findOneAndUpdate(
    {
      user: currentUser._id,
      outbound_id: _id,
    },
    {
      hookapi: hookUrl,
      action,
      data,
    },
    {
      new: true,
      upsert: true,
    }
  );
  return res.status(201).send({
    id: _id,
  });
};

const outboundUnsubscribe = async (req, res) => {
  const { currentUser } = req;
  const _id = req.params.id;

  await Outbound.deleteOne({
    user: currentUser._id,
    outbound_id: _id,
  }).catch((err) => {
    console.log(err.message);
  });
  return res.status(201).send({
    status: true,
  });
};

const outboundPerform = async (req, res) => {
  const { currentUser } = req;
  const { action } = req.params;
  const { data } = req.query;
  console.log('-------- outboundPerform -query: ', req.query);
  console.log('-------- outboundPerform -params: ', req.params);
  const _data = await getSampleData({ action, userid: currentUser._id, data });
  return res.status(201).send([_data]);
};

const requestOutboundApi = async (req, res) => {
  const { userId, action, params } = req.body;
  let callback;
  switch (action) {
    case outbound_constants.LEAD_SOURCE:
      callback = getContactOutboundData;
      break;
    case outbound_constants.WATCH_MATERIAL:
      callback = getWatchMaterialOutboundData;
      break;
  }
  outboundCallhookApi(userId, action, callback, params);
  return res.send({ status: true });
};

module.exports = {
  outboundSubscribe,
  outboundUnsubscribe,
  outboundPerform,
  requestOutboundApi,
};
