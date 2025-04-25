const mockingoose = require('mockingoose');
const httpMocks = require('jest-mock-req-res');

const Automation = require('../../models/automation');
const AutomationLine = require('../../models/automation_line');

const { create } = require('../time_line');

const {
  getActiveAutomationCount,
  assignTimeline,
} = require('../../helpers/automation');
const { users } = require('../../../__tests__/__mocks__/data/user');
const {
  original_automations,
} = require('../../../__tests__/__mocks__/data/automation');

const { mockRequest, mockResponse } = httpMocks;

const automationSpyFn = jest.spyOn(Automation, 'findOne');

jest.mock('../../helpers/automation', () => ({
  assignTimeline: jest.fn(),
  getActiveAutomationCount: jest.fn(),
}));

jest.mock('../../helpers/outbound', () => ({
  outboundCallhookApi: jest.fn(),
}));

describe('Timeline Controller', () => {
  jest.setTimeout(30 * 1000);
  describe('create timeline', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      jest.resetAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
    });

    it('Not find Automation', async () => {
      req.currentUser = users[0];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValueOnce(null);
      await create(req, res);
      const response = res.json.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(400);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Automation not found');
    });

    it('No email connected', async () => {
      req.currentUser = users[2];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValueOnce(original_automations[0]);
      await create(req, res);
      const response = res.json.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(406);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('No email connected');
    });

    it('No phone', async () => {
      req.currentUser = users[3];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValueOnce(original_automations[0]);
      await create(req, res);
      const response = res.json.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(408);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('No phone');
    });

    it('Disable create automations', async () => {
      req.currentUser = users[1];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValue(original_automations[0]);
      await create(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(412);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Disable create automations');
    });

    it('Exceed max active automations', async () => {
      req.currentUser = users[0];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValue(original_automations[0]);
      getActiveAutomationCount.mockReturnValueOnce(1000);
      await create(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(412);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Exceed max active automations');
    });

    it('Automation assignment is failed.', async () => {
      req.currentUser = users[0];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValue(original_automations[0]);
      getActiveAutomationCount.mockReturnValueOnce(0);
      assignTimeline.mockRejectedValueOnce(new Error('fake error'));

      await create(req, res);
      expect(res.status).toHaveBeenCalledWith(412);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Automation assignment failed - no results returned',
      });
    });

    it('The same automation is already running.', async () => {
      req.currentUser = users[0];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValue(original_automations[0]);
      getActiveAutomationCount.mockReturnValueOnce(0);
      assignTimeline.mockResolvedValueOnce({
        result: [
          {
            status: false,
            error: 'The same automation is already running.',
            contact: {
              _id: '2234567890abcdef01234567',
              title: 'test',
              first_name: 'test',
              last_name: 'test',
            },
            automation_line: '5374567890abcdef01234567',
          },
        ],
      });

      await create(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: [
          {
            contact: {
              _id: '2234567890abcdef01234567',
              title: 'test',
              first_name: 'test',
              last_name: 'test',
            },
            error: 'The same automation is already running.',
          },
        ],
        notExecuted: ['2234567890abcdef01234567'],
      });
    });

    it('Assign Timeline success.', async () => {
      req.currentUser = users[0];
      req.body = {
        automation_id: '1234567890abcdef01234567',
        contacts: ['2234567890abcdef01234567'],
        required_unique: false,
      };
      automationSpyFn.mockResolvedValue(original_automations[0]);
      getActiveAutomationCount.mockReturnValueOnce(0);
      assignTimeline.mockResolvedValueOnce({
        result: [
          {
            status: true,
            contact: {
              _id: '2234567890abcdef01234567',
              title: '',
              first_name: 'test',
              last_name: 'test',
            },
            automation_line: '5374567890abcdef01234567',
          },
        ],
      });

      await create(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: undefined,
      });
    });
  });
});
