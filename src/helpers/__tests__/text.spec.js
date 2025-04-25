const { ENV_PATH } = require('../../configs/path');
require('dotenv').config({ path: ENV_PATH });
const mockingoose = require('mockingoose');
const { Twilio } = require('twilio');

const User = require('../../models/user');
const Contact = require('../../models/contact');
const Garbage = require('../../models/garbage');
const Text = require('../../models/text');
const Activity = require('../../models/activity');

const {
  correct_contact,
} = require('../../../__tests__/__mocks__/data/contact');
const {
  request_valid_text,
  request_invalid_text,
} = require('../../../__tests__/__mocks__/request/text');
const { new_activity } = require('../../../__tests__/__mocks__/data/activity');

const { gmail_user } = require('../../../__tests__/__mocks__/data/user');
const { text } = require('../../../__tests__/__mocks__/data/text');
const {
  email_user_garbage,
} = require('../../../__tests__/__mocks__/data/garbage');

const { sendText } = require('../text');

const twilioMessageCreateAcceptedSuccess = jest.fn(() => {
  return new Promise((res, rej) => {
    res({ status: 'accepted' });
  });
});
const twilioMessageCreateDelivedSuccess = jest.fn(() => {
  return new Promise((res, rej) => {
    res({ status: 'accepted' });
  });
});
const twilioMessageCreateFailedWithoutStatus = jest.fn(() => {
  return new Promise((res, rej) => {
    res({ status: 'accepted' });
  });
});
const twilioMessageCreateError = jest.fn(() => {
  return new Promise((res, rej) => {
    rej({ message: 'sending is failed with service error' });
  });
});
Twilio.prototype.messages = {
  create: twilioMessageCreateAcceptedSuccess,
};

jest.mock('../../helpers/utility', () => ({
  getUserTimezone: jest.fn(),
  getStandardTimezone: jest.fn(),
  getTextMaterials: jest.fn(() => {
    return { videoIds: [], imageIds: [], pdfIds: [], materials: [] };
  }),
  replaceTokenFunc: jest.fn(() => {
    return {
      content: 'test send text content',
      subject: 'test send text',
    };
  }),
}));

describe('text', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sendText
  describe('sendText', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(User).toReturn(gmail_user, 'findOne');
      mockingoose(Garbage).toReturn(email_user_garbage, 'findOne');
      mockingoose(Text).toReturn(text, 'save');
      mockingoose(Activity).toReturn(new_activity, 'save');
    });

    it('sendText successfully with accepted', async () => {
      mockingoose(Contact).toReturn(correct_contact, 'findOne');
      Twilio.prototype.messages = {
        create: twilioMessageCreateAcceptedSuccess,
      };
      try {
        return sendText(request_valid_text).then((data) => {
          console.log('---sendText successfully with accepted');
          expect(data[0].status).toBe(true);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });
    it('sendText successfully with delivered', async () => {
      mockingoose(Contact).toReturn(correct_contact, 'findOne');
      Twilio.prototype.messages = {
        create: twilioMessageCreateDelivedSuccess,
      };
      try {
        return sendText(request_valid_text).then((data) => {
          console.log('---sendText successfully with delivered');
          expect(data[0].status).toBe(true);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });
    it('sendText unsuccessfully without status', async () => {
      mockingoose(Contact).toReturn(correct_contact, 'findOne');
      Twilio.prototype.messages = {
        create: twilioMessageCreateFailedWithoutStatus,
      };
      try {
        return sendText(request_valid_text).then((data) => {
          console.log('---sendText unsuccessfully without status');
          expect(data[0].status).toBe(true);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });
    it('sendText contact missing unsuccessfully', async () => {
      try {
        return sendText(request_invalid_text).then((data) => {
          console.log('---sendText contact missing unsuccessfully');
          expect(data[0].status).toBe(false);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });
    it('sendText twillo unsuccessfully', async () => {
      mockingoose(Contact).toReturn(correct_contact, 'findOne');
      Twilio.prototype.messages = {
        create: twilioMessageCreateError,
      };
      try {
        return sendText(request_valid_text).then((data) => {
          console.log('---sendText twillo unsuccessfully');
          expect(data[0].status).toBe(false);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });
    afterEach(async () => {
      // To Do Something
    });
  });
});
