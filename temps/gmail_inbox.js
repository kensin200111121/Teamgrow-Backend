const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { google } = require('googleapis');
const mongoose = require('mongoose');

const { DB_PORT } = require('../src/configs/database');
const api = require('../src/configs/api');
const urls = require('../src/constants/urls');
const base64url = require('base64url');
const moment = require('moment-timezone');

mongoose.set('strictQuery', false);
mongoose
  .connect(DB_PORT, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connecting to database successful');
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const User = require('../src/models/user');

const registerGmailInboxWatcher = async () => {
  const user = await User.findOne({ email: 'rui@crmgrow.com', del: false });

  const GMAIL_CLIENT_ID =
    user.source === 'vortex'
      ? api.GMAIL_VORTEX_CLIENT.GMAIL_CLIENT_ID
      : api.GMAIL_CLIENT.GMAIL_CLIENT_ID;
  const GMAIL_CLIENT_SECRET =
    user.source === 'vortex'
      ? api.GMAIL_VORTEX_CLIENT.GMAIL_CLIENT_SECRET
      : api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET;
  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    urls.GMAIL_AUTHORIZE_URL
  );

  const token = JSON.parse(user.google_refresh_token);
  oauth2Client.setCredentials({ refresh_token: token.refresh_token });

  await oauth2Client.getAccessToken().catch((err) => {
    console.log('get access err', err.message);
  });

  const res = await google
    .gmail({ version: 'v1', auth: oauth2Client })
    .users.watch({
      userId: 'me',
      requestBody: {
        topicName: `projects/crmgrow-stage/topics/InboxTopic`,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      },
    });

  console.log('result****', res.data);
  /**
   * correct result
   * result**** { historyId: '2045543', expiration: '1695009371544' }
   */
};

const decryptTest = () => {
  console.log(
    base64url.decode(
      'eyJlbWFpbEFkZHJlc3MiOiJzdXBlckBjcm1ncm93LmNvbSIsImhpc3RvcnlJZCI6MjA0MDU4OH0='
    )
    // {"emailAddress":"super@crmgrow.com","historyId":2040588}
  );
  // registerGmailInboxWatcher();
  console.log(
    base64url.decode(
      'eyJlbWFpbEFkZHJlc3MiOiJzdXBlckBjcm1ncm93LmNvbSIsImhpc3RvcnlJZCI6MjA0MzYwNH0='
    )
    // {"emailAddress":"super@crmgrow.com","historyId":2043604}
  );

  console.log(
    base64url.decode(
      'eyJlbWFpbEFkZHJlc3MiOiJzdXBlckBjcm1ncm93LmNvbSIsImhpc3RvcnlJZCI6MjA0MzczOH0='
    )
    // {"emailAddress":"super@crmgrow.com","historyId":2043738}
  );

  console.log(
    base64url.decode(
      'eyJlbWFpbEFkZHJlc3MiOiJydWlAY3JtZ3Jvdy5jb20iLCJoaXN0b3J5SWQiOjI1NzA1NX0='
    )
    // {"emailAddress":"super@crmgrow.com","historyId":2043738}
  );
};
// decryptTest();
const abstractMailAddress = (rawString) => {
  const splited = rawString.split(/[<>]/);
  console.log(splited[1]);
  if (splited.length >= 3) return splited[1];
  else return '';
};

// abstractMailAddress('Greenseed Tech <notifications@tasks.clickup.com>');
const abstractCC = (rawString) => {
  if (!rawString) return '';
  const result = [];
  const _comma = rawString.split(/[,]/);
  if (_comma.length > 0) {
    _comma.forEach((c) => {
      const _splited = c.split(/[<>]/);
      if (_splited.length >= 3) result.push(_splited[1]);
    });
  }
  console.log(result);
};

const getGmailhistoryList = async () => {
  const currentHistoryId = '286506';
  const currentUser = await User.findOne({
    email: 'rui@crmgrow.com',
    del: false,
  });
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.GMAIL_AUTHORIZE_URL
  );
  const token = JSON.parse(currentUser.google_refresh_token);
  oauth2Client.setCredentials({ refresh_token: token.refresh_token });
  const gmail = google.gmail({ auth: oauth2Client, version: 'v1' });
  const historyList = await gmail.users.history
    .list({
      userId: 'me',
      startHistoryId: currentUser.email_watch.history_id,
      includeSpamTrash: true,
      historyTypes: ['messageAdded'],
    })
    .catch((error) => {
      console.log('historyList error', error.message);
    });
  if (!historyList?.data) {
    console.log('history list data not found');
    return;
  }

  const data = historyList.data;
  console.log('---response-----', data);
  if (!data?.history?.length) {
    console.log('invalid history length');
    return;
  }

  const history = data.history;
  const len = history.length;
  for (let i = 0; i < history.length; i++) {
    const lastMessages = history[i]?.messages;
    console.log('-----history id', history[i].id);
    console.log('-----last messages', lastMessages);
    console.log('-----last messagesAdded', history[i]?.messagesAdded);
    const messageId = lastMessages[0]?.id;
    console.log('-----message id', messageId);
    const threadId = lastMessages[0]?.threadId;
    console.log('-----threadId id', threadId);
    if (messageId) {
      const msg = await gmail.users.messages
        .get({
          userId: 'me',
          id: messageId,
        })
        .catch((error) => {
          console.log('-----messages get error', error);
        });
      if (!msg?.data) {
        console.log('------invalid messgea');
        continue;
      }
      const data = msg.data;
      // console.log('----message data', data);
      const emailSnippet = data.snippet;
      console.log('------emailSnippet', emailSnippet);
      const emailAttachments = [];
      if (data.payload.filename !== '')
        emailAttachments.push(data.payload.filename);
      let emailContent = '';
      const headers = data.payload.headers;
      console.log('------headers', headers);
      const emailFrom = headers.filter((h) => h.name === 'From')[0].value;
      console.log('------receiveFrom', emailFrom);
      const emailSubject = headers.filter((h) => h.name === 'Subject')[0].value;
      console.log('------emailSubject', emailSubject);
      const emailDate = headers.filter((h) => h.name === 'Date')[0].value;
      console.log('------emailDate', emailDate);
      if (data?.payload?.body?.data) {
        emailContent = base64url.decode(data.payload.body.data);
        console.log('-------message content', emailContent);
      } else {
        const parts = data?.payload?.parts;
        if (parts && parts.length > 0) {
          parts.forEach((part) => {
            // console.log('-------parts', part);
            if (part.filename === '') {
              if (part.mimeType === 'text/html' && part.body?.data) {
                emailContent = base64url.decode(part.body.data);
                console.log('------message content', emailContent);
              }
            } else {
              emailAttachments.push(part.filename);
              console.log('------attchement filename', emailAttachments);
            }
            if (part?.parts && part.parts.length > 0) {
              const subParts = part.parts;
              subParts.forEach((subPart) => {
                console.log('-------subParts', subPart);
                if (subPart.filename === '') {
                  if (subPart.mimeType === 'text/html' && subPart.body?.data) {
                    emailContent = base64url.decode(subPart.body.data);
                    console.log('------subParts message content', emailContent);
                  }
                } else {
                  emailAttachments.push(subPart.filename);
                  console.log(
                    '------subParts attchement filename',
                    emailAttachments
                  );
                }
              });
            }
          });
        }
      }
    }
  }
};

const getMessageAttachments = async () => {
  const currentUser = await User.findOne({
    email: 'rui@crmgrow.com',
    del: false,
  });
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.GMAIL_AUTHORIZE_URL
  );
  const token = JSON.parse(currentUser.google_refresh_token);
  oauth2Client.setCredentials({ refresh_token: token.refresh_token });
  const gmail = google.gmail({ auth: oauth2Client, version: 'v1' });
  gmail.users.messages.attachments.get(
    {
      userId: currentUser.email,
      messageId: '18ab1ee751ba2f24',
      id: 'abc',
    },
    function (err, response) {
      console.log(err);
      const data = response.data;
      console.log('---response-----', data);
    }
  );
};

const strToDate = (dateStr) => {
  // Wed, 13 Sep 2023 02:33:16 -0700
  // var date = new Date(strToDate);
  const date = moment(dateStr, 'ddd, DD MMM YYYY hh:mm:ss z').toDate();
  // print the date
  console.log(date);
};

const errTest = () => {
  try {
    throw new Error('hello');
  } catch (e) {
    console.log('error', e.message);
  }
};

// registerGmailInboxWatcher();
// decryptTest();
getGmailhistoryList();
// getMessageAttachments();
// strToDate('Wed, 13 Sep 2023 02:33:16 -0700');
// abstractCC('WDMA Team <diamond94618@gmail.com>, "qingli527@gmail.com" <qingli527@gmail.com>');
// errTest();
// registerGmailInboxWatcher();
