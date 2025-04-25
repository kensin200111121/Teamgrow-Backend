const { createUser } = require('../user');

const mockingoose = require('mockingoose');
const {
  create_user_req,
} = require('../../../__tests__/__mocks__/request/user');

const {
  contact_activity,
} = require('../../../__tests__/__mocks__/data/activity');
const { create_user_data } = require('../../../__tests__/__mocks__/data/user');
const {
  correct_contact,
} = require('../../../__tests__/__mocks__/data/contact');
const { team_data } = require('../../../__tests__/__mocks__/data/team');
const User = require('../../models/user');
const Contact = require('../../models/contact');
const Garbage = require('../../models/garbage');
const Activity = require('../../models/activity');
const Folder = require('../../models/folder');
const Team = require('../../models/team');

jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => {
      return {
        send: jest.fn(),
      };
    }),
    SendTemplatedEmailCommand: jest.fn(),
  };
});

jest.mock('simple-oauth2', () => {
  return {
    AuthorizationCode: jest.fn(() => {
      return {
        authorizeURL: jest.fn(() => 'mocked-authorization-uri'),
      };
    }),
  };
});

jest.mock('../../helpers/automation', () => ({
  assignTimeline: jest.fn().mockImplementation(async (data) => {
    return Promise.resolve({ result: {}, status: true });
  }),
}));

jest.mock('../../models/user');
jest.mock('../../models/garbage');
jest.mock('../../models/folder');
jest.mock('../../models/team');
jest.mock('../../models/contact');
jest.mock('../../models/activity');

describe('create_user', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);

  /**
   * =========== create User =============
   *  */
  describe('createUser', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      User.find.mockResolvedValue([]);
      User.findOne.mockResolvedValue(create_user_data);
      User.create.mockResolvedValue(create_user_data);
      User.updateOne.mockResolvedValue(() => {
        return Promise.resolve();
      });
      Contact.create.mockResolvedValue(correct_contact);

      Contact.updateOne.mockResolvedValue(() => {
        return Promise.resolve();
      });

      Garbage.create.mockResolvedValue(() => {
        return Promise.resolve();
      });
      Folder.create.mockResolvedValue();
      Activity.create.mockResolvedValue(contact_activity);
      Team.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(team_data),
      });
      Team.updateOne.mockResolvedValue(true);
    });
    it('should create a user and return a token', async () => {
      const result = await createUser(create_user_req);
      expect(result).toStrictEqual({
        status: true,
        data: expect.any(Object),
      });
      // expect(result.status).toBeTruthy();
    });

    afterEach(async () => {
      // To Do Something
    });
  });
});
