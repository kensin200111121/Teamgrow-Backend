const httpMocks = require('jest-mock-req-res');

const { mockRequest, mockResponse } = httpMocks;

const mockingoose = require('mockingoose');
const mongoose = require('mongoose');

const { load } = require('../deal_stage');

const Pipeline = require('../../models/pipe_line');
const DealStage = require('../../models/deal_stage');

const { gmail_user_wu } = require('../../../__tests__/__mocks__/data/user');

describe('pipeline', () => {
  jest.setTimeout(30 * 1000);

  describe('load', () => {
    let req;
    let res;
    const constantId = new mongoose.Types.ObjectId();

    beforeEach(() => {
      req = mockRequest({
        currentUser: gmail_user_wu,
        body: {},
      });
      res = mockResponse();
    });

    it('should return deal stages for a given pipeline ID', async () => {
      const mockPipeline = {
        _id: new mongoose.Types.ObjectId(),
        user: gmail_user_wu._id,
      };
      mockingoose(Pipeline).toReturn(mockPipeline, 'findOne');

      const mockDealStages = [{ _id: constantId, deals: [], automation: null }];
      mockingoose(DealStage).toReturn(mockDealStages, 'find');

      req.body._id = 'pipelineId';

      await load(req, res);

      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ ...mockDealStages[0], deals_count: 0, deals: [] }],
      });
    });

    it('should return deal stages for the current user if no pipeline ID is provided', async () => {
      const mockPipeline = {
        _id: new mongoose.Types.ObjectId(),
        user: gmail_user_wu._id,
      };
      mockingoose(Pipeline).toReturn(mockPipeline, 'findOne');

      const mockDealStages = [{ _id: constantId, deals: [], automation: null }];
      mockingoose(DealStage).toReturn(mockDealStages, 'find');

      await load(req, res);

      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [{ ...mockDealStages[0], deals_count: 0, deals: [] }],
      });
    });

    it('should return an empty array if no active pipeline is found', async () => {
      mockingoose(Pipeline).toReturn(null, 'findOne');

      await load(req, res);

      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [],
      });
    });
  });
});
