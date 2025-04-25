const graph = require('@microsoft/microsoft-graph-client');
const { google } = require('googleapis');
const { email_req } = require('../../../__tests__/__mocks__/request/email');

const { correct_email_req } = email_req;
const User = require('../../models/user');
const Garbage = require('../../models/garbage');
const Contact = require('../../models/contact');
const Email = require('../../models/email');
const Activity = require('../../models/activity');
const Video = require('../../models/video');
const PDF = require('../../models/pdf');
const Image = require('../../models/image');

const mockingoose = require('mockingoose');
const {
  gmail_user,
  outlook_user,
} = require('../../../__tests__/__mocks__/data/user');
const {
  email_user_garbage,
} = require('../../../__tests__/__mocks__/data/garbage');
const {
  correct_contact,
  miss_email_contact,
  unsubscribed_contact,
} = require('../../../__tests__/__mocks__/data/contact');
const { new_email } = require('../../../__tests__/__mocks__/data/email');
const { new_activity } = require('../../../__tests__/__mocks__/data/activity');
// Mock the specific function

const { sendEmail } = require('../email');

const { OAuth2Client } = require('google-auth-library');

jest.mock('twilio', () => {
  const create = jest.fn().mockResolvedValue({ sid: 'mocked-sid' });
  return jest.fn(() => ({
    messages: { create },
  }));
});
jest.mock('simple-oauth2', () => {
  return {
    AuthorizationCode: jest.fn(() => {
      return {
        createToken: jest.fn(() => {
          console.log('------create token');
          return {
            refresh: jest.fn(async () => {
              console.log('------refresh token');
              return { token: { access_token: 'outlook-refresh-token' } };
            }),
          };
        }),
      };
    }),
  };
});

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

jest.mock('../../helpers/fileUpload', () => ({
  downloadFile: jest.fn(),
}));

describe('email', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('sendEmail', () => {
    // Seed the database with users
    beforeEach(async () => {
      jest.clearAllMocks();
      graph.Client.init = jest.fn(() => {
        console.log('---graph.Client.init');
        return {
          api: jest.fn(() => {
            console.log('-----graph api');
            return {
              post: jest.fn(async () => {
                console.log('-----graph post');
                return true;
              }),
            };
          }),
        };
      });
      google.gmail = jest.fn(() => {
        console.log('----gmail client');
        return {
          users: {
            messages: {
              send: jest.fn(async (params, callback) => {
                console.log('-----------gmail send');
                callback(null, { data: { id: '10' } });
              }),
            },
          },
        };
      });
      mockingoose.resetAll();
      mockingoose(User).toReturn(gmail_user, 'findOne');
      mockingoose(Garbage).toReturn(email_user_garbage, 'findOne');

      mockingoose(Email)
        .toReturn(new_email, 'save')
        .toReturn(new_email, 'updateOne');
      mockingoose(Activity)
        .toReturn(new_activity, 'save')
        .toReturn(null, 'deleteMany')
        .toReturn(null, 'deleteOne')
        .toReturn(new_activity, 'updateOne');
      mockingoose(Video).toReturn(null, 'find');
      mockingoose(PDF).toReturn(null, 'find');
      mockingoose(Image).toReturn(null, 'find');
    });

    it('find user correctly', async () => {
      OAuth2Client.mockImplementation(() => {
        return {
          setCredentials: jest.fn(() => {
            console.log('-----gmailClient setCredentials');
            return true;
          }),
          getAccessToken: jest.fn(() => {
            console.log('-----gmailClient getAccessToken');
            return {
              catch: jest.fn(() => {
                console.log('-----gmailClient catch error');
                return { error: 'gmailClient error' };
              }),
            };
          }),
          credentials: { access_token: 'gmail-access-token' },
        };
      });
      return User.findOne({ _id: '507f191e810c19729de860ea' }).then((doc) => {
        expect(JSON.parse(JSON.stringify(doc)).user_name).toBe('RuiNing Zhang');
      });
    });

    it('Should send Gmail successfully', async () => {
      mockingoose(Contact)
        .toReturn(correct_contact, 'findOne')
        .toReturn(correct_contact, 'updateOne');
      try {
        return sendEmail(correct_email_req).then((data) => {
          console.log('---success gmail test result data', data);
          expect(data[0].status).toBe(true);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });

    it('Should failed because of contact email missing', async () => {
      mockingoose(Contact)
        .toReturn(miss_email_contact, 'findOne')
        .toReturn(miss_email_contact, 'updateOne');
      try {
        return sendEmail(correct_email_req).then((data) => {
          console.log('---missing email test result data', data);
          expect(data[0].status).toBe(false);
          expect(data[0].error).toBe('No email');
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
      // expect(data[0].status).toBe(true);
    });

    it('Should failed because of contact email unsubscribed', async () => {
      mockingoose(Contact)
        .toReturn(unsubscribed_contact, 'findOne')
        .toReturn(unsubscribed_contact, 'updateOne');
      try {
        return sendEmail(correct_email_req).then((data) => {
          console.log('---unsubscribed test result data', data);
          expect(data[0].status).toBe(false);
          expect(data[0].error).toBe('contact email unsubscribed');
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
      // expect(data[0].status).toBe(true);
    });

    it('Should send Outlook email successfully', async () => {
      mockingoose(User).reset('findOne');
      mockingoose(User).toReturn(outlook_user, 'findOne');
      mockingoose(Contact)
        .toReturn(correct_contact, 'findOne')
        .toReturn(correct_contact, 'updateOne');
      try {
        return sendEmail(correct_email_req).then((data) => {
          console.log('---success outlook email test result data', data);
          expect(data[0].status).toBe(true);
        });
      } catch (err) {
        console.log('*******!!!!! error is failed', err);
      }
    });

    it('Should failed gmail because of invalid token', async () => {
      OAuth2Client.mockImplementation(() => {
        return {
          setCredentials: jest.fn(() => {
            console.log('-----gmailClient setCredentials');
            return true;
          }),
          getAccessToken: jest.fn(() => {
            console.log('-----gmailClient getAccessToken');
            return {
              catch: jest.fn(() => {
                console.log('-----gmailClient catch error');
                return { error: 'gmailClient error' };
              }),
            };
          }),
          credentials: { access_token: null },
        };
      });
      mockingoose(User).reset('findOne');
      mockingoose(User).toReturn(gmail_user, 'findOne');
      mockingoose(Contact)
        .toReturn(correct_contact, 'findOne')
        .toReturn(correct_contact, 'updateOne');
      try {
        return sendEmail(correct_email_req).then((data) => {
          console.log('---invalid token gmail test result data', data);
          expect(data[0].status).toBe(false);
          expect(data[0].error).toBe('google access token invalid!');
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
