const mongoose = require('mongoose');
const moment = require('moment-timezone');
const {
  task_load_req,
  new_task_req,
  bulkUpdate_task_req,
} = require('../../../__tests__/__mocks__/request/task');

const FollowUp = require('../../models/follow_up');
const Contact = require('../../models/contact');
const Garbage = require('../../models/garbage');
const Activity = require('../../models/activity');
const mockingoose = require('mockingoose');
const {
  gmail_user,
  gmail_user_wu,
} = require('../../../__tests__/__mocks__/data/user');
const {
  email_user_garbage,
} = require('../../../__tests__/__mocks__/data/garbage');
const {
  follow_up_array_data,
  new_followup,
} = require('../../../__tests__/__mocks__/data/follow_up');
const {
  load: loadFollowUP,
  bulkCreate,
  bulkUpdate,
  getByDate,
} = require('../follow_up');
const {
  correct_contact,
  miss_email_contact,
  unsubscribed_contact,
} = require('../../../__tests__/__mocks__/data/contact');
// Mock the specific function
const {
  followup_activity,
} = require('../../../__tests__/__mocks__/data/activity');
const httpMocks = require('jest-mock-req-res');
const httpMocks2 = require('node-mocks-http');
const { once, EventEmitter } = require('events');

const { mockRequest, mockResponse } = httpMocks;

jest.mock('twilio', () => {
  const create = jest.fn().mockResolvedValue({ sid: 'mocked-sid' });
  return jest.fn(() => ({
    messages: { create },
  }));
});

jest.mock('../../helpers/outbound', () => ({
  outboundCallhookApi: jest.fn(() => Promise.resolve({})),
}));

const delayPromise = (ms) =>
  new Promise((res, rej) => {
    setTimeout(() => {
      res('hello');
    }, ms);
  });

describe('task', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('load', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.body = task_load_req;
      req.currentUser = gmail_user;
      mockingoose.resetAll();
      mockingoose(Contact).toReturn(
        [correct_contact, miss_email_contact, unsubscribed_contact],
        'find'
      );
      mockingoose(FollowUp)
        .toReturn(follow_up_array_data, 'aggregate')
        .toReturn(follow_up_array_data, 'find')
        .toReturn(follow_up_array_data[0], 'findOne')
        .toReturn(3, 'countDocuments');
    });

    it('should success', async () => {
      await loadFollowUP(req, res);
      const response = res.send.mock.calls[0][0];
      // console.log('----response', response);
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
    });
    afterEach(async () => {
      // To Do Something
    });
  });

  describe('bulkCreate', () => {
    // Seed the database with users
    let req;
    let res;
    let resSendSpy;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = httpMocks2.createRequest();
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
      resSendSpy = jest.spyOn(res, 'send');
      jest.spyOn(FollowUp.prototype, 'save').mockResolvedValue(new_followup);
      req.body = new_task_req;
      req.currentUser = gmail_user;
      mockingoose.resetAll();
      mockingoose(Contact)
        .toReturn(Promise.resolve(correct_contact), 'findOne')
        .toReturn(Promise.resolve(correct_contact), 'updateOne');
      mockingoose(Garbage).toReturn(email_user_garbage, 'findOne');
      mockingoose(FollowUp).toReturn(
        new Promise((res) => {
          res(new_followup);
        }),
        'save'
      );
      mockingoose(Activity).toReturn(
        Promise.resolve(followup_activity),
        'save'
      );
    });

    it('should success', async () => {
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await bulkCreate(req, res);
      await responseEndPromise; // wait till response would be end.

      // await delayPromise(3000);
      const response = res.send.mock.calls[0][0];
      // console.log('----response', response);
      expect(resSendSpy).toHaveBeenCalled();
      // console.log('---response', response);
      expect(response.status).toBeTruthy();
    });
    afterEach(async () => {
      // To Do Something
    });
  });

  describe('bulkUpdate', () => {
    let req;
    let res;
    let resSendSpy;
    beforeEach(() => {
      jest
        .spyOn(Activity.prototype, 'save')
        .mockResolvedValue(followup_activity);
      jest.clearAllMocks();
      mockingoose.resetAll();

      mockingoose(Garbage).toReturn({ user: gmail_user_wu._id }, 'findOne');

      bulkUpdate_task_req.forEach((follow_up) => {
        mockingoose(FollowUp).toReturn({ _id: follow_up._id }, 'findOne');
      });
      mockingoose(Activity).toReturn(
        new Promise((res) => {
          res(followup_activity);
        }),
        'save'
      );
      mockingoose(Contact).toReturn({}, 'updateOne');
      req = httpMocks2.createRequest();
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
      resSendSpy = jest.spyOn(res, 'send');
    });

    it('should successfully update follow-ups and respond with status true', async () => {
      req.body = bulkUpdate_task_req;
      req.currentUser = gmail_user_wu;

      await bulkUpdate(req, res);
      expect(res.send).toHaveBeenCalledWith({ status: true });
      console.log('successfully update follow-ups');
    });

    it('should create a new FollowUp if not found', async () => {
      req.body = bulkUpdate_task_req;
      req.currentUser = gmail_user_wu;

      mockingoose(Garbage).toReturn({ reminder_before: 30 }, 'findOne');
      mockingoose(FollowUp).toReturn(null, 'findOne');
      mockingoose(FollowUp).toReturn({}, 'save');
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await bulkUpdate(req, res);
      await responseEndPromise; // wait till response would be end.
      // await delayPromise(3000);
      expect(res.send).toHaveBeenCalledWith({ status: true });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  describe('getByDate', () => {
    let req;
    let res;

    beforeEach(() => {
      req = {
        query: {},
        currentUser: { _id: 'userId' },
      };
      res = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should return 400 for invalid query', async () => {
      req.query.due_date = 'invalid_query';
      await getByDate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: {
          msg: 'Query not allowed',
          data: req.query,
        },
      });
    });

    it('should handle overdue query', async () => {
      req.query.due_date = 'overdue';
      const current_time = moment().tz('America/New_York').startOf('day');

      // jest.spyOn(FollowUp, 'find').mockResolvedValue([{ _id: 'followUpId' }]);
      const mockFollowUps = [{ _id: 'followUpId', contact: 'contactId' }];

      const findMock = jest.spyOn(FollowUp, 'find').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockFollowUps),
      });

      await getByDate(req, res);

      expect(findMock).toHaveBeenCalledWith({
        user: req.currentUser._id,
        status: 0,
        due_date: { $lt: current_time },
        contact: { $ne: null },
      });
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ _id: 'followUpId', contact: 'contactId' }],
      });
    });

    it('should handle today query', async () => {
      req.query.due_date = 'today';
      const start = moment().tz('America/New_York').startOf('day');
      const end = moment().tz('America/New_York').endOf('day');

      const mockFollowUps = [{ _id: 'followUpId', contact: 'contactId' }];

      const findMock = jest.spyOn(FollowUp, 'find').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockFollowUps),
      });

      await getByDate(req, res);

      expect(findMock).toHaveBeenCalledWith({
        user: req.currentUser._id,
        status: { $in: [0, 2] },
        due_date: { $gte: start, $lt: end },
        contact: { $ne: null },
      });
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ _id: 'followUpId', contact: 'contactId' }],
      });
    });

    it('should handle tomorrow query', async () => {
      req.query.due_date = 'tomorrow';
      const today_start = moment().tz('America/New_York').startOf('day');
      const tomorrow_start = today_start.clone().add(1, 'day');
      const tomorrow_end = tomorrow_start.clone().endOf('day');

      const mockFollowUps = [{ _id: 'followUpId', contact: 'contactId' }];

      const findMock = jest.spyOn(FollowUp, 'find').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockFollowUps),
      });

      await getByDate(req, res);

      expect(findMock).toHaveBeenCalledWith({
        user: req.currentUser._id,
        status: { $in: [0, 2] },
        due_date: { $gte: tomorrow_start, $lt: tomorrow_end },
        contact: { $ne: null },
      });
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ _id: 'followUpId', contact: 'contactId' }],
      });
    });

    it('should handle next_week query', async () => {
      req.query.due_date = 'next_week';
      const next_week_start = moment()
        .tz('America/New_York')
        .add(2, 'day')
        .startOf('day');
      const next_week_end = moment()
        .tz('America/New_York')
        .add(7, 'days')
        .endOf('day');

      jest.spyOn(FollowUp, 'find').mockResolvedValue([{ _id: 'followUpId' }]);

      await getByDate(req, res);

      expect(FollowUp.find).toHaveBeenCalledWith({
        user: req.currentUser._id,
        status: 0,
        due_date: { $gte: next_week_start, $lt: next_week_end },
        contact: { $ne: null },
      });
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ _id: 'followUpId' }],
      });
    });

    it('should handle next_month query', async () => {
      req.query.due_date = 'next_month';
      const start_month = moment()
        .tz('America/New_York')
        .add(8, 'day')
        .startOf('day');
      const end_month = moment()
        .tz('America/New_York')
        .add(30, 'days')
        .endOf('day');

      jest.spyOn(FollowUp, 'find').mockResolvedValue([{ _id: 'followUpId' }]);

      await getByDate(req, res);

      expect(FollowUp.find).toHaveBeenCalledWith({
        user: req.currentUser._id,
        status: 0,
        due_date: { $gte: start_month, $lt: end_month },
        contact: { $ne: null },
      });
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ _id: 'followUpId' }],
      });
    });

    it('should handle future query', async () => {
      req.query.due_date = 'future';
      const start_future = moment()
        .tz('America/New_York')
        .add(8, 'day')
        .startOf('day');

      jest.spyOn(FollowUp, 'find').mockResolvedValue([{ _id: 'followUpId' }]);

      await getByDate(req, res);

      expect(FollowUp.find).toHaveBeenCalledWith({
        user: req.currentUser._id,
        status: 0,
        due_date: { $gte: start_future },
        contact: { $ne: null },
      });
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ _id: 'followUpId' }],
      });
    });
  });
});
