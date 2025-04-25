const mongoose = require('mongoose');
const moment = require('moment-timezone');
const CronJob = require('cron').CronJob;
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
require('../configureSentry');
const User = require('../src/models/user');
const system_settings = require('../src/configs/system_settings');
const { DB_PORT } = require('../src/configs/database');
const {
  startGmailWatcher,
  checkIdentityTokens,
} = require('../src/helpers/user');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const gmail_watch_refresh = new CronJob(
  '0 21 * * *',
  async () => {
    const expireLimit = system_settings.GMAIL_WATCH_EXPIRE;
    const compareTime = moment()
      .clone()
      .subtract(expireLimit, 'days')
      .endOf('day');
    const users = await User.find({
      del: false,
      google_refresh_token: { $exists: true },
      'email_watch.history_id': { $exists: true },
      'email_watch.started_date': { $lte: compareTime },
    });
    if (users && users.length) {
      users.forEach(async (user) => {
        await checkIdentityTokens(user);
        const tokens = JSON.parse(user.google_refresh_token);
        const historyId = await startGmailWatcher(tokens).catch((e) =>
          console.log('gmail watcher error', e.message || e.msg || e)
        );
        if (historyId) {
          await User.updateOne(
            { _id: user._id, del: false },
            {
              $set: {
                'email_watch.history_id': historyId,
                'email_watch.started_date': new Date(),
              },
            }
          );
        }
      });
    }
  },
  function () {
    console.log('Gmail watcher refresh finished.');
  },
  false,
  'US/Central'
);

gmail_watch_refresh.start();
