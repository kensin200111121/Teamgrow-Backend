const mongoose = require('mongoose');
const CronJob = require('cron').CronJob;

const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const system_settings = require('../src/configs/system_settings');
require('../configureSentry');
const User = require('../src/models/user');
const AgentFilter = require('../src/models/agent_filter');
const { getAgents } = require('../src/helpers/agent_filter');
const { sendErrorToSentry } = require('../src/helpers/utility');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const agents = new CronJob(
  '0 1 * * 1-5',
  async () => {
    sendErrorToSentry(null, 'AVM is running:');
    const expired_date = new Date();
    expired_date.setDate(
      expired_date.getDate() - system_settings.AGENT.LAST_LOGGEDIN
    );
    const last_logged_user = await User.find({
      last_logged: { $gte: expired_date },
      'agent_vending_info.is_enabled': true,
      del: false,
      user_disabled: { $ne: true },
      'subscription.is_suspended': { $ne: true },
      'subscription.is_failed': { $ne: true },
    }).select({ _id: 1 });
    const userIds = last_logged_user.map((e) => e._id);
    const agentFilters = await AgentFilter.find({ user: { $in: userIds } });
    for (let i = 0; i < agentFilters.length; i++) {
      const agentFilter = agentFilters[i];
      let api_url = `https://${agentFilter.user}:${system_settings.AGENT.SERVICE_PASSWORD}@${system_settings.AGENT.SERVICE_API}?`;
      if (agentFilter.count) {
        api_url += `count=${agentFilter.count}`;
      }
      if (agentFilter.state) {
        api_url += `&state=${agentFilter.state}`;
      }

      if (agentFilter.period) {
        api_url += '&' + agentFilter.period + '=';
        if (agentFilter.min) api_url += agentFilter.min;
        api_url += '-';
        if (agentFilter.max) api_url += agentFilter.max;
      }
      if (agentFilter.exclude_brokerage) {
        api_url += `&exclude=${agentFilter.exclude_brokerage}`;
      }
      getAgents(api_url, agentFilter.user);
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

agents.start();
