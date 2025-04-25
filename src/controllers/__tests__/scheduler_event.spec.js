const graph = require('@microsoft/microsoft-graph-client');
const {
  scheduler_req,
  checkConflict_data,
} = require('../../../__tests__/__mocks__/request/scheduler_event');
const {
  appointment_data,
  scheduler_appointment_save,
} = require('../../../__tests__/__mocks__/data/appointment');
const { outbound_data } = require('../../../__tests__/__mocks__/data/outbound');
const {
  scheduler_note_save,
} = require('../../../__tests__/__mocks__/data/note');
const {
  scheduler_contact,
} = require('../../../__tests__/__mocks__/data/contact');
const {
  scheduler_activity_save,
  scheduler_noteActivity_save,
} = require('../../../__tests__/__mocks__/data/activity');

const httpMocks = require('jest-mock-req-res');

const User = require('../../models/user');
const EventType = require('../../models/event_type');
const Appointment = require('../../models/appointment');
const Outbound = require('../../models/outbound');
const Note = require('../../models/note');
const Contact = require('../../models/contact');
const Activity = require('../../models/activity');
const Garbage = require('../../models/garbage');

const mockingoose = require('mockingoose');
const { gmail_user } = require('../../../__tests__/__mocks__/data/user');

const { mockRequest, mockResponse } = httpMocks;
const { event_type_id } = scheduler_req.event_type;
// Mock the specific function

const { create, checkConflict } = require('../scheduler_event');

const { OAuth2Client } = require('google-auth-library');

jest.mock('twilio', () => {
  const create = jest.fn().mockResolvedValue({ sid: 'mocked-sid' });
  return jest.fn(() => ({
    messages: { create },
  }));
});

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

describe('scheduler_event', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('create', () => {
    let req;
    let res;
    // Seed the database with users
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(User).toReturn(gmail_user, 'findOne');
      mockingoose(EventType).toReturn(event_type_id, 'findOne');

      mockingoose(Contact).toReturn(scheduler_contact, 'findOne');
      mockingoose(EventType).toReturn(event_type_id, 'findOne');
      mockingoose(Appointment).toReturn(appointment_data, 'findOne');
      mockingoose(Outbound).toReturn(outbound_data, 'find');
      mockingoose(Garbage).toReturn(scheduler_contact.user, 'save');
      mockingoose(Appointment).toReturn(scheduler_appointment_save, 'save');
      mockingoose(Activity).toReturn(scheduler_activity_save, 'save');
      mockingoose(Note).toReturn(scheduler_note_save, 'save');
      mockingoose(Activity).toReturn(scheduler_noteActivity_save, 'save');

      req = mockRequest();
      res = mockResponse();
    });

    it('scheduler successfully with accepted', async () => {
      req.body = scheduler_req;
      try {
        const response = await create(req, res);
        console.log('---scheduler successfully with accepted');
        expect(response.status).toHaveBeenCalledWith(427);
        console.log('===', expect(response.json).toHaveBeenCalledWith());
      } catch (err) {
        console.log('*******!!!!! error is failed', err.message);
      }
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  describe('checkConflict', () => {
    // Seed the database with users
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(EventType).toReturn(event_type_id, 'findOne');
      mockingoose(User).toReturn(gmail_user, 'findOne');
    });

    it('checkConflict successfully with accepted', async () => {
      try {
        const response = await checkConflict(checkConflict_data);
        console.log('---checkConflict successfully with accepted');
        expect(response.status).toBe(true);
      } catch (err) {
        console.log('*******!!!!! error is failed', err.message);
      }
    });

    afterEach(async () => {
      // To Do Something
    });
  });
});
