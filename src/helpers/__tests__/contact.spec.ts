const mockingoose = require('mockingoose');
const mongoose = require('mongoose');
const Activity = require('../../models/activity');
const { aggregate_activity_data } = require('../../../__tests__/__mocks__/data/activity');

const {
  getLoadGroupActivity
} = require('../contact');

describe('contact', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('getLoadGroupActivity', () => {
    // Seed the database with users

    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(Activity)
        .toReturn(aggregate_activity_data, 'aggregate');
    });

    it('should be success', async () => {
      const userId = '65f87caa392e882876feac23';
      const contactId = '63a44fcbb199d3535de01cce';
      const from = '66f5620164ef5d5e4ee2025e';
      const result = await getLoadGroupActivity(userId, contactId, from);
      // console.log('----RESULT', result)
      expect(result).toStrictEqual({
        data: expect.any(Array),
        details: expect.any(Object),
        lastActivityId: expect.any(mongoose.Types.ObjectId),
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
