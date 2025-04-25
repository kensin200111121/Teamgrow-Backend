const mockingoose = require('mockingoose');
const { assignTimeline } = require('../automation');
const Activity = require('../../models/activity');
const Automation = require('../../models/automation');
const User = require('../../models/user');
const {
  original_automations,
} = require('../../../__tests__/__mocks__/data/automation');
const { users } = require('../../../__tests__/__mocks__/data/user');
const {
  assign_automation_activity,
} = require('../../../__tests__/__mocks__/data/activity');
const AutomationLine = require('../../models/automation_line');
const {
  running_automation_line,
} = require('../../../__tests__/__mocks__/data/automation_line');

jest.mock('../../services/time_line');
const autolineCountSpyFn = jest.spyOn(AutomationLine, 'countDocuments');
const sameAutolineSpyFn = jest.spyOn(AutomationLine, 'findOne');

describe('AssignTimeline', () => {
  jest.setTimeout(30 * 1000);
  describe('assign timeline success', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
    });
    it('No automation', async () => {
      const data = { automation_id: '1234567890abcdef01234567' };
      mockingoose(Automation).toReturn(null, 'findOne');
      const result = await assignTimeline(data);
      expect(result.status).toBeFalsy();
      expect(result.error).toBe('No automation');
    });

    it('No user', async () => {
      const data = {
        automation_id: '1234567890abcdef01234567',
        user_id: '2234567890abcdef01234567',
      };
      mockingoose(Automation).toReturn(original_automations[0], 'findOne');
      mockingoose(User).toReturn(null, 'findOne');
      const result = await assignTimeline(data);
      expect(result.status).toBeFalsy();
      expect(result.error).toBe('No user');
    });

    it('Exceed max active automations', async () => {
      const data = {
        automation_id: '1234567890abcdef01234567',
        user_id: '2234567890abcdef01234567',
        assign_array: ['3234567890abcdef01234567'],
        type: 'contact',
      };
      mockingoose(Automation).toReturn(original_automations[0], 'findOne');
      mockingoose(User).toReturn(users[1], 'findOne');
      autolineCountSpyFn.mockResolvedValue(1000);
      const result = await assignTimeline(data);
      expect(result.status).toBeTruthy();
      expect(result.result[0].status).toBeFalsy();
      expect(result.result[0].contact).toBeDefined();
      expect(result.result[0].error).toBe('Exceed max active automations');
    });

    it('The same automation is already running.', async () => {
      const data = {
        automation_id: '1234567890abcdef01234567',
        user_id: '2234567890abcdef01234567',
        assign_array: ['3234567890abcdef01234567'],
        type: 'contact',
      };
      mockingoose(Automation).toReturn(original_automations[0], 'findOne');
      mockingoose(User).toReturn(users[1], 'findOne');
      autolineCountSpyFn.mockResolvedValue(0);
      sameAutolineSpyFn.mockResolvedValue(running_automation_line);
      const result = await assignTimeline(data);
      expect(result.status).toBeTruthy();
      expect(result.result[0].status).toBeFalsy();
      expect(result.result[0].contact).toBeDefined();
      expect(result.result[0].error).toBe(
        'The same automation is already running.'
      );
    });

    it('Assign Timeline success', async () => {
      const data = {
        automation_id: '1234567890abcdef01234567',
        user_id: '2234567890abcdef01234567',
        assign_array: ['3234567890abcdef01234567'],
        type: 'contact',
      };
      mockingoose(Automation).toReturn(original_automations[0], 'findOne');
      mockingoose(User).toReturn(users[1], 'findOne');
      autolineCountSpyFn.mockResolvedValue(0);
      sameAutolineSpyFn.mockResolvedValue(null);
      const result = await assignTimeline(data);
      expect(result.status).toBeTruthy();
      expect(result.result[0].status).toBeTruthy();
      expect(result.result[0].contact).toBeDefined();
      expect(result.result[0].automation_line).toBeDefined();
      expect(result.result[0].activity).toBeDefined();
    });
  });
});
