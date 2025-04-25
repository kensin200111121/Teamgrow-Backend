const Task = require('../models/task');
const Contact = require('../models/contact');
const Garbage = require('../models/garbage');
const EmailTemplate = require('../models/email_template');
const Automation = require('../models/automation');
const Timeline = require('../models/time_line');
const Campaign = require('../models/campaign');
const MaterialTheme = require('../models/material_theme');

const get = async (user) => {
  const garbage = await Garbage.findOne({ user: user._id });
  if (!garbage) {
    const newGarbage = new Garbage({
      user: user._id,
    });

    newGarbage
      .save()
      .then((data) => {
        return data;
      })
      .catch((err) => {
        console.log('err', err);
        return false;
      });
  } else {
    return garbage;
  }
  return false;
};

const templateTokensHandler = async (user, oldGarbage, newGarbage) => {
  if (!oldGarbage.template_tokens || oldGarbage.template_tokens.length === 0) {
    return [];
  }
  const promise_array = [];
  const email_templates = await EmailTemplate.find({ user: user._id });
  const tasks = await Task.find({
    user: user._id,
    type: { $in: ['send_email', 'send_text'] },
  });
  const automations = await Automation.find({ user: user._id });
  const timelines = await Timeline.find({
    user: user._id,
    status: { $in: ['pending', 'active'] },
    type: { $in: ['texts', 'emails'] },
  });
  const campaigns = await Campaign.find({ user: user._id });
  const material_themes = await MaterialTheme.find({ user: user._id });
  if (
    (!email_templates || email_templates.length === 0) &&
    (!tasks || tasks.length === 0) &&
    (!automations || automations.length === 0) &&
    (!timelines || timelines.length === 0) &&
    (!campaigns || campaigns.length === 0) &&
    (!material_themes || material_themes.length === 0)
  ) {
    return promise_array;
  }
  const newTokens = newGarbage.template_tokens;
  const oldTokens = oldGarbage.template_tokens;
  oldTokens.forEach((e) => {
    const regex = new RegExp(`\\{${e.name}\\}`, 'gi');
    const token = newTokens.find((t) => t.id === e.id || t.name === e.name);
    let mode = '';
    let value = '';
    if (token && token.id) {
      if (token.name !== e.name) {
        mode = 'edit';
        value = `{${token.name}}`;
      }
    } else {
      mode = 'delete';
    }
    if (mode !== '') {
      // update the token in templates
      email_templates.forEach((template) => {
        const templateData = template._doc;
        const subject = templateData.subject.replace(regex, value);
        const content = templateData.content.replace(regex, value);
        const promise = new Promise(async (resolve) => {
          await EmailTemplate.updateOne(
            { _id: templateData._id },
            { $set: { subject, content } }
          ).catch((err) => {
            console.log('update token in email template error', err);
          });
          resolve();
        });
        promise_array.push(promise);
      });
      // update the token in scheduled tasks
      tasks.forEach((task) => {
        const taskData = task._doc;
        if (taskData.type === 'send_email') {
          taskData.action.subject = (taskData.action.subject || '').replace(
            regex,
            value
          );
        }
        taskData.action.content = (taskData.action.content || '').replace(
          regex,
          value
        );
        const promise = new Promise(async (resolve) => {
          await Task.updateOne(
            { _id: taskData._id },
            { $set: { action: taskData.action } }
          ).catch((err) => {
            console.log('update token in task error', err);
          });
          resolve();
        });
        promise_array.push(promise);
      });
      // update actions in automations
      automations.forEach((automation) => {
        const automationData = automation._doc;
        automationData.automations.forEach((node) => {
          if (node.action.type === 'text' || node.action.type === 'email') {
            node.action.subject = node.action.subject.replace(regex, value);
            node.action.content = node.action.content.replace(regex, value);
          }
        });
        const promise = new Promise(async (resolve) => {
          await Automation.updateOne(
            { _id: automationData._id },
            { ...automationData }
          ).catch((err) => {
            console.log('update token in automation node error', err);
          });
          resolve();
        });
        promise_array.push(promise);
      });
      // update timelines
      timelines.forEach((timeline) => {
        const timelineData = timelines._doc;
        const update = {};
        if (timelineData.type === 'emails') {
          update['subject'] = timelineData.subject.replace(regex, value);
        }
        update['content'] = timelineData.content.replace(regex, value);
        const promise = new Promise(async (resolve) => {
          await Timeline.updateOne(
            { _id: timelineData._id },
            { $set: update }
          ).catch((err) => {
            console.log('update token in timelines error', err);
          });
          resolve();
        });
        promise_array.push(promise);
      });
      // update campaigns
      campaigns.forEach((campaign) => {
        const campaignData = campaign._doc;
        const subject = campaignData.subject.replace(regex, value);
        const content = campaignData.content.replace(regex, value);
        const promise = new Promise(async (resolve) => {
          await Campaign.updateOne(
            { _id: campaignData._id },
            { $set: { subject, content } }
          ).catch((err) => {
            console.log('update token in campaigns error', err);
          });
          resolve();
        });
        promise_array.push(promise);
      });
      // update newsletter
      material_themes.forEach((theme) => {
        const themeData = theme._doc;
        const subject = themeData.subject.replace(regex, value);
        const promise = new Promise(async (resolve) => {
          await MaterialTheme.updateOne(
            { _id: themeData._id },
            { $set: { subject } }
          ).catch((err) => {
            console.log('update token in material themes error', err);
          });
          resolve();
        });
        promise_array.push(promise);
      });
    }
  });
  return promise_array;
};

module.exports = {
  get,
  templateTokensHandler,
};
