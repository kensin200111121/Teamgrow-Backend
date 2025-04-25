const httpMocks = require('jest-mock-req-res');

const Contact = require('../../models/contact');
const Deal = require('../../models/contact');
const Activity = require('../../models/activity');
const Garbage = require('../../models/garbage');
const Team = require('../../models/team');
const User = require('../../models/user');
const Automation = require('../../models/automation');
const TimeLine = require('../../models/time_line');
const mockingoose = require('mockingoose');
const {
  contact_req,
  csv_contacts,
  advance_search_data,
} = require('../../../__tests__/__mocks__/request/contact');

const { new_contact_req, phone_contact_req } = contact_req;
const {
  gmail_user: currentUser,
} = require('../../../__tests__/__mocks__/data/user');
const {
  email_user_garbage,
} = require('../../../__tests__/__mocks__/data/garbage');

const {
  correct_contact,
} = require('../../../__tests__/__mocks__/data/contact');
const { activities } = require('../../../__tests__/__mocks__/data/activity');
const { new_activity } = require('../../../__tests__/__mocks__/data/activity');
const {
  labels_list: mock_labels_list,
} = require('../../../__tests__/__mocks__/data/label');
const {
  team_data,
  defaultTeam,
} = require('../../../__tests__/__mocks__/data/team');
const {
  automation_data,
} = require('../../../__tests__/__mocks__/data/automation');
const {
  timelines_data,
} = require('../../../__tests__/__mocks__/data/time_line');
const { users } = require('../../../__tests__/__mocks__/data/user');
const {
  create: createContact,
  uploadContactsChunk,
  shareContacts,
  getDetail,
  calculateRates,
  getSharedContacts,
  advanceSearch,
} = require('../contact');

const { mockRequest, mockResponse } = httpMocks;
const httpMocks2 = require('node-mocks-http');
const { once, EventEmitter } = require('events');

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
        authorizeURL: jest.fn(() => 'mocked-authorization-uri'),
      };
    }),
  };
});

jest.mock('../../models/time_line');

jest.mock('../../helpers/automation', () => ({
  assignTimeline: jest.fn(),
}));

jest.mock('../../helpers/outbound', () => ({
  outboundCallhookApi: jest.fn(),
}));

jest.mock('../../helpers/label', () => ({
  getAll: jest.fn(() => mock_labels_list),
}));

jest.mock('../../helpers/contact', () => ({
  giveRateContacts: jest.fn(),
  calculateContactRate: jest.fn(),
  giveRate: jest.fn().mockImplementation(async (garbage, contact) => {
    return 1;
  }),
  checkDuplicateContact: jest
    .fn()
    .mockImplementation(async (contact, currentUser) => {
      return [];
    }),
  generateCloneAndTransferContactPromise: jest.fn(),
  getConditionsByAnalytics: jest
    .fn()
    .mockImplementation(async (analyticsConditions) => {
      return {
        fieldQuery: '',
        activityCondition: '',
        automationOption: '',
      };
    }),
}));

describe('contact', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('createContact', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      jest.spyOn(Activity.prototype, 'save').mockResolvedValue(new_activity);
      mockingoose.resetAll();
      mockingoose(Activity)
        .toReturn(new_activity, 'save')
        .toReturn(null, 'deleteMany')
        .toReturn(null, 'deleteOne')
        .toReturn(new_activity, 'updateOne');
      mockingoose(Contact)
        .toReturn(null, 'findOne')
        .toReturn(correct_contact, 'updateOne')
        .toReturn(correct_contact, 'save');
    });

    it('should create contact successfully', async () => {
      req.currentUser = currentUser;
      req.body = new_contact_req;
      await createContact(req, res);
      // const response = res.send.mock.calls[0][0];
      expect(res.status).toBeTruthy();
      // expect(response.status).toBeTruthy();
    });

    it('should failed because same email contact already exists', async () => {
      mockingoose(Contact).reset('findOne');
      mockingoose(Contact)
        .toReturn(correct_contact, 'findOne')
        .toReturn(correct_contact, 'updateOne')
        .toReturn(correct_contact, 'save');
      req.currentUser = currentUser;
      req.body = new_contact_req;
      await createContact(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Email must be unique!');
    });

    it('should failed because same phone number contact already exists', async () => {
      mockingoose(Contact).reset('findOne');
      mockingoose(Contact)
        .toReturn(correct_contact, 'findOne')
        .toReturn(correct_contact, 'updateOne')
        .toReturn(correct_contact, 'save');
      req.currentUser = currentUser;
      req.body = phone_contact_req;
      await createContact(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Phone number must be unique!');
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  describe('uploadContactsChunk', () => {
    // Seed the database with users
    let req;
    let res;
    let resSendSpy;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = httpMocks2.createRequest();
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
      resSendSpy = jest.spyOn(res, 'send');
      jest.spyOn(Contact.prototype, 'save').mockResolvedValue(correct_contact);
      mockingoose.resetAll();
      mockingoose(Garbage).toReturn(email_user_garbage, 'findOne');
      mockingoose(Contact)
        .toReturn(null, 'findOne')
        .toReturn(correct_contact, 'updateOne')
        .toReturn(
          new Promise((res) => {
            res(correct_contact);
          }),
          'save'
        );
      mockingoose(Activity)
        .toReturn(
          new Promise((res) => {
            res(new_activity);
          }),
          'save'
        )
        .toReturn(null, 'deleteMany')
        .toReturn(null, 'deleteOne')
        .toReturn(new_activity, 'updateOne');
    });

    it('should be success ', async () => {
      req.currentUser = currentUser;
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await uploadContactsChunk(req, res, csv_contacts);
      await responseEndPromise; // wait till response would be end.
      const response = res.send.mock.calls[0][0];
      // console.log('-----response', response);
      expect(resSendSpy).toBeTruthy();
      expect(res.status).toBeTruthy();
      expect(response.status).toBeTruthy();
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  describe('shareContacts', () => {
    // Seed the database with users
    let req;
    let res;
    let resSendSpy;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = httpMocks2.createRequest();
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
      mockingoose.resetAll();
    });

    it('should be failed because of team not existed ', async () => {
      resSendSpy = jest.spyOn(res, 'json');
      mockingoose(Team).toReturn(null, 'findOne');
      req.currentUser = currentUser;
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await shareContacts(req, res);
      await responseEndPromise; // wait till response would be end.
      const response = res.json.mock.calls[0][0];
      // console.log('-----response', response);
      expect(res.status).toBeTruthy();
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('team not found');
    });

    it('should be failed because of permission', async () => {
      resSendSpy = jest.spyOn(res, 'send');
      mockingoose(Team)
        .toReturn(defaultTeam, 'findOne')
        .toReturn(defaultTeam, 'updateOne');
      mockingoose(User).toReturn(users, 'find');
      req.currentUser = currentUser;
      req.body = {
        contacts: ['123', '456', '789'],
        mode: 'all_member',
        type: 2,
        user: ['123'],
      };
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await shareContacts(req, res);
      await responseEndPromise; // wait ti
      const response = res.send.mock.calls[0][0];
      // console.log('----response', response);
      expect(res.status).toBeTruthy();
      expect(response.status).toBeFalsy();
      expect(response.error).toBe(
        'You are not allowed to share contact with all members in test'
      );
    });
    afterEach(async () => {
      // To Do Something
    });

    it('should be success', async () => {
      resSendSpy = jest.spyOn(res, 'send');
      mockingoose(Team)
        .toReturn(team_data, 'findOne')
        .toReturn(team_data, 'updateOne');
      mockingoose(User).toReturn(users, 'find');
      req.currentUser = currentUser;
      req.body = {
        contacts: ['123', '456', '789'],
        mode: 'all_member',
        type: 1,
        user: ['123'],
      };
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await shareContacts(req, res);
      await responseEndPromise; // wait ti
      const response = res.send.mock.calls[0][0];
      // console.log('---response', response)
      expect(resSendSpy).toBeTruthy();
      expect(response.status).toBeTruthy();
    });
    afterEach(async () => {
      // To Do Something
    });
  });

  describe('getDetail', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
      mockingoose.resetAll();
    });

    it('should be failed because contact not existed', async () => {
      mockingoose(Contact).toReturn(null, 'findOne');
      req.params.id = 'undefined';
      await getDetail(req, res);
      const response = res.json.mock.calls[0][0];
      // console.log('-----response', response);
      expect(res.status).toBeTruthy();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Invalid Contact');
    });

    it('should be failed because contact not existed', async () => {
      mockingoose(Contact).toReturn(null, 'findOne');
      req.params.id = '1234567890';
      await getDetail(req, res);
      const response = res.json.mock.calls[0][0];
      // console.log('-----response', response);
      expect(res.status).toBeTruthy();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Contact not found');
    });

    it('should be sucess', async () => {
      mockingoose(Contact).toReturn(correct_contact, 'findOne');
      // mockingoose(TimeLine).toReturn(timelines_data, 'find');
      mockingoose(Automation).toReturn(automation_data, 'findOne');
      // TimeLine.find.mockResolvedValue(timelines_data);
      TimeLine.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(timelines_data),
      });
      req.params.id = '1234567890';
      await getDetail(req, res);
      const response = res.send.mock.calls[0][0];
      // console.log('-----response', response);
      expect(res.status).toBeTruthy();
      expect(response.status).toBeTruthy();
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  describe('calculateRates', () => {
    let req;
    let res;

    beforeEach(() => {
      req = {
        currentUser,
        body: { contacts: [] },
      };
      res = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
    });

    it('should return null if garbage settings are not found', async () => {
      mockingoose(Garbage).toReturn(null, 'findOne');
      await calculateRates(req, res);

      expect(res.send);
    });

    it('should return null if contact is not found', async () => {
      mockingoose(Garbage).toReturn({}, 'findOne');
      req.body.contacts = ['contactId'];
      mockingoose(Contact).toReturn(null, 'findOne');

      await calculateRates(req, res);

      expect(res.send);
    });

    it('should call giveRate if one contact is provided', async () => {
      const garbageData = {};
      const contactData = {};
      mockingoose(Garbage).toReturn(garbageData, 'findOne');
      req.body.contacts = ['contactId'];
      mockingoose(Contact).toReturn(contactData, 'findOne');

      await calculateRates(req, res);

      expect(res.send);
    });
    afterEach(async () => {
      // To Do Something
    });
  });

  describe('getSharedContacts', () => {
    let req;
    let res;
    let resSendSpy;
    jest.spyOn(Contact.prototype, 'save').mockResolvedValue(correct_contact);
    beforeEach(() => {
      req = httpMocks2.createRequest();
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
      req.params = {};
      req.body = {
        field: 'name',
        dir: 1,
        count: 50,
      };
      req.currentUser = currentUser;
    });

    it('should return shared contacts successfully', async () => {
      const contactsData = [
        { _id: '1', first_name: 'wu1', last_activity: 'activityId' },
        { _id: '2', first_name: 'wu2', last_activity: 'activityId' },
      ];

      const totalContacts = 2;

      mockingoose(Contact)
        .toReturn(totalContacts, 'countDocuments')
        .toReturn(contactsData, 'aggregate');
      resSendSpy = jest.spyOn(res, 'send');
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await getSharedContacts(req, res);
      responseEndPromise;
      expect(resSendSpy).toBeTruthy();
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(Object),
      });
    });

    it('should return 400 if no contacts exist', async () => {
      mockingoose(Contact).toReturn(null, 'aggregate');
      mockingoose(Contact).toReturn(0, 'countDocuments');
      resSendSpy = jest.spyOn(res, 'json');
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await getSharedContacts(req, res);
      responseEndPromise;
      const response = res.json.mock.calls[0][0];
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Contacts doesn`t exist');
    });
  });

  describe('advanceSearch', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
      req.params.action = 'select';
      req.body = advance_search_data;
      mockingoose.resetAll();
    });

    it('should be success 1', async () => {
      req.body.teamOptions = {
        '6400b530f719035b01c9c8b6': {
          flag: 1,
          is_internal: false,
          share_by: {
            flag: 1,
          },
          share_with: {
            flag: 1,
          },
        },
        '642651a105849bb8056a1b2a': {
          flag: 1,
          is_internal: false,
          share_by: {
            flag: 1,
          },
          share_with: {
            flag: 1,
          },
        },
      };
      mockingoose(Contact)
        .toReturn([correct_contact], 'find')
        .toReturn([correct_contact], 'aggregate');
      mockingoose(Activity).toReturn(activities, 'aggregate');
      mockingoose(Deal).toReturn([], 'find');
      await advanceSearch(req, res);
      const response = res.send.mock.calls[0][0];
      // console.log('-----response', response);
      expect(res.status).toBeTruthy();
      expect(response.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [],
      });
      // expect(response.data).toBe([]);
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
