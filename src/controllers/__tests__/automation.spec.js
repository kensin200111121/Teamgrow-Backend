const httpMocks = require('jest-mock-req-res');

const Automation = require('../../models/automation');
const AutomationLine = require('../../models/automation_line');
const Team = require('../../models/team');
const Folder = require('../../models/folder');
const Contact = require('../../models/contact');
const TimeLine = require('../../models/time_line');
const User = require('../../models/user');
const DealStage = require('../../models/deal_stage');
const Garbage = require('../../models/garbage');
const Event = require('../../models/event_type');
const Video = require('../../models/video');
const PDF = require('../../models/pdf');
const Image = require('../../models/image');
const LeadForm = require('../../models/lead_form');
const mockingoose = require('mockingoose');
const {
  get,
  create,
  getAssignedContacts,
  loadLibrary,
  download,
  update,
  remove,
  getTitles,
  updateDefault,
  loadIncludings,
  removeFolder,
  getDetail,
  getParentFolderByAutomation,
  searchContact,
} = require('../automation');
const {
  automation_one,
  team_data,
  team_data_with,
  automation_line_data,
  folder_data,
  automaton_data,
  automation_data_role_admin,
  automation_data_role_user,
  dealStage_result,
  garbage_data,
  garbage_data_with_smart_codes,
  garbage_data_with_capture_field,
  events_with_automation,
  action_automations,
  running_automations,
  time_lines_automation,
  video_with_admin_role,
  detail_automation,
  parentFolders,
  one_parent,
  search_res_contacts,
} = require('../../../__tests__/__mocks__/data/automation');
const {
  wrong_req,
  get_automation,
  create_req,
  library_req,
  update_req,
  download_req,
  updateDefault_req,
  remove_folder_req,
} = require('../../../__tests__/__mocks__/request/automation');
const {
  gmail_user: currentUser,
  automation_user_invalid,
  automation_user_valid,
} = require('../../../__tests__/__mocks__/data/user');

const { mockRequest, mockResponse } = httpMocks;

jest.mock('../../models/automation_line');
jest.mock('../../models/time_line');
jest.mock('../../helpers/automation', () => ({
  downloadAutomations: jest.fn(),
  downloadVideos: jest.fn(),
  downloadPdfs: jest.fn(),
  downloadImages: jest.fn(),
  matchOrDownloadStages: jest.fn(),
  updateAutomations: jest.fn(),
  getSubTitles: jest.fn(() => Promise.resolve({})),
}));

describe('automation', () => {
  jest.setTimeout(30 * 1000);
  describe('get', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
    });
    it('should return 400 if automation is not found', async () => {
      req.body = wrong_req;
      req.currentUser = currentUser;
      mockingoose(Automation).toReturn(null, 'findOne');
      mockingoose(Team).toReturn([], 'find');
      await get(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.send.mock.calls[0][0];
      expect(response.error).toBe('not_found');
      expect(response.status).toBeFalsy();
    });
    it('should return 400 if user does not have access permission', async () => {
      req.body = get_automation;
      req.currentUser = currentUser;
      mockingoose(Automation).toReturn(automation_one, 'findOne');
      mockingoose(Team).toReturn(team_data, 'find');
      mockingoose(AutomationLine).toReturn(automation_line_data, 'find');
      await get(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(400);
      expect(response.error).toBe('You do not have access permission.');
    });
    it('should return data when automation is found and user has access', async () => {
      req.body = get_automation;
      req.currentUser = currentUser;
      mockingoose(Automation).toReturn(automation_one, 'findOne');
      mockingoose(Team).toReturn(team_data_with, 'find');
      mockingoose(AutomationLine).toReturn(automation_line_data, 'find');

      await get(req, res);
      expect(res.status).toBeTruthy();
    });
    afterEach(async () => {
      // To Do Something
    });
  });
  describe('create', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
      // mockingoose(Automation).toReturn(automation_one, 'save');
      mockingoose(Folder).toReturn({ _id: 'folderId' }, 'updateOne');
    });
    it('should return 412 if automations are disabled', async () => {
      req.currentUser = automation_user_invalid;

      await create(req, res);

      expect(res.status).toHaveBeenCalledWith(412);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Disable automations',
      });
    });
    it('should be success', async () => {
      req.body = create_req;
      req.currentUser = automation_user_valid;
      jest
        .spyOn(Automation.prototype, 'save')
        .mockResolvedValue(new Automation(automation_one));
      await create(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(Object),
      });
      // expect(response.data._id).toBeDefined();
    });
  });
  describe('getAssignedContacts', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
    });
    it('success case with empty response', async () => {
      req.body = get_automation;
      req.currentUser = currentUser;
      mockingoose(Contact).toReturn([], 'find');
      TimeLine.aggregate.mockReturnValue([]);
      await getAssignedContacts(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [],
      });
    });
    it('success case with real response', async () => {
      req.body = get_automation;
      req.currentUser = currentUser;
      TimeLine.aggregate.mockReturnValue([]);
      mockingoose(Contact).toReturn([], 'find');
      await getAssignedContacts(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: [],
      });
    });
    afterEach(async () => {
      // To Do Something
    });
  });
  describe('loadLibrary', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('success case with empty data', async () => {
      req.body = library_req;
      mockingoose(Team).toReturn([], 'find');
      mockingoose(Team).toReturn([], 'findById');
      mockingoose(Folder).toReturn([], 'find');
      mockingoose(Folder).toReturn(folder_data[0], 'findOne');
      mockingoose(Automation).toReturn([], 'aggregate');
      mockingoose(Automation).toReturn([], 'find');
      mockingoose(User).toReturn([], 'find');
      await loadLibrary(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(Object),
      });
    });
    it('success case with reals data', async () => {
      req.body = library_req;
      mockingoose(Team).toReturn(team_data, 'find');
      mockingoose(Team).toReturn(team_data[0], 'findById');
      // eslint-disable-next-line no-undef
      mockingoose(Folder).toReturn(folder_data, 'find');
      mockingoose(Folder).toReturn(folder_data[0], 'findOne');
      mockingoose(Automation).toReturn([], 'aggregate');
      mockingoose(Automation).toReturn([automaton_data], 'find');
      mockingoose(User).toReturn([], 'find');
      await loadLibrary(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(Object),
      });
    });
    afterEach(async () => {
      // To Do Something
    });
  });

  describe('update function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 400 if automation does not exist', async () => {
      req.body = update_req;
      req.params = { id: 'wrong_num' };
      mockingoose(Automation).toReturn(null, 'findOne');
      await update(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: `Automation doesn't exist`,
      });
    });
    it('should return 400 if user is not the owner and role is admin', async () => {
      req.body = update_req;
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(Automation).toReturn(automation_data_role_admin, 'findOne');

      await update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: `couldn't update admin automation`,
      });
    });
    it('should return 400 if user is not the owner', async () => {
      req.body = update_req;
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');

      await update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: `This is not your automation so couldn't update.`,
      });
    });
    it('should be success when updating automation', async () => {
      req.currentUser.id = '63b6ec5db199d3535de0f616';
      req.body = update_req;
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(Automation).toReturn(automation_data_role_user, 'updateOne');
      await update(req, res);

      expect(res.send).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
      });
    });
  });
  describe('remove function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 400 if automation does not exist for the user', async () => {
      mockingoose(Automation).toReturn(null, 'findOne'); // Mocking non-existing automation
      req.params = { id: '66fafe069d555d043c3a894e' };
      await remove(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid permission.',
      });
    });
    it('should remove automation and associated data if no errors', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Garbage).toReturn(garbage_data, 'findOne');
      mockingoose(Event).toReturn([], 'find');
      mockingoose(Automation).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      mockingoose(Team).toReturn([], 'find');
      mockingoose(Automation).toReturn(null, 'deleteOne');
      mockingoose(Folder).toReturn(null, 'updateOne');
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(LeadForm).toReturn([], 'find');
      await remove(req, res);
      expect(res.send).toHaveBeenCalledWith({
        status: true,
      });
    });
    it('should return error messages if there are dependent stages', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn(dealStage_result, 'find');
      mockingoose(Garbage).toReturn(garbage_data, 'findOne');
      mockingoose(Event).toReturn([], 'find');
      mockingoose(Automation).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      mockingoose(Team).toReturn([], 'find');
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(LeadForm).toReturn([], 'find');
      await remove(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      expect(response.error_message[0].reason).toEqual('stages');
    });
    it('should return error messages if there are dependent garbages', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Garbage).toReturn(garbage_data_with_capture_field, 'findOne');
      mockingoose(Event).toReturn([], 'find');
      mockingoose(Automation).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      mockingoose(Team).toReturn([], 'find');
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(LeadForm).toReturn([], 'find');
      await remove(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      // expect(response.error_message[0].reason).toEqual('garbages');
    });
    it('should return error messages if there are dependent smart codes', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Garbage).toReturn(garbage_data_with_smart_codes, 'findOne');
      mockingoose(Event).toReturn([], 'find');
      mockingoose(Automation).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      mockingoose(Team).toReturn([], 'find');
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(LeadForm).toReturn([], 'find');
      await remove(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      expect(response.error_message[0].reason).toEqual('smartcodes');
    });
    it('should return error messages if there are dependent events', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Garbage).toReturn(garbage_data, 'findOne');
      mockingoose(Event).toReturn(events_with_automation, 'find');
      mockingoose(Automation).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      mockingoose(Team).toReturn([], 'find');
      req.params = { id: '66fafe069d555d043c3a894e' };
      mockingoose(LeadForm).toReturn([], 'find');
      await remove(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      expect(response.error_message[0].reason).toEqual('event_types');
    });
    it('should return error messages if there are dependent automations', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Garbage).toReturn(garbage_data, 'findOne');
      mockingoose(Event).toReturn([], 'find');
      mockingoose(Automation).toReturn(action_automations, 'find');
      mockingoose(LeadForm).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      mockingoose(Team).toReturn([], 'find');
      req.params = { id: '66fafe069d555d043c3a894e' };

      await remove(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      expect(response.error_message[0].reason).toEqual('automations');
    });
    it('should return error messages if there are dependent running-automation', async () => {
      mockingoose(Automation).toReturn(automation_data_role_user, 'findOne');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Garbage).toReturn(garbage_data, 'findOne');
      mockingoose(Event).toReturn([], 'find');
      mockingoose(Automation).toReturn([], 'find');
      AutomationLine.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(running_automations),
      });
      TimeLine.findOne.mockReturnValue(time_lines_automation);
      mockingoose(LeadForm).toReturn([], 'find');
      mockingoose(Team).toReturn([], 'find');
      req.params = { id: '66fafe069d555d043c3a894e' };
      await remove(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
      expect(response.error_message[0].reason).toEqual('running');
    });
  });

  describe('download function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 412 if automations are disabled', async () => {
      req.currentUser.automation_info.is_enabled = false;
      req.body = download_req;
      await download(req, res);
      expect(res.status).toHaveBeenCalledWith(412);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Disable automations',
      });
    });
    it('should send a success response', async () => {
      req.currentUser.automation_info.is_enabled = true;
      req.body = download_req;
      await download(req, res);
      expect(res.send).toHaveBeenCalledWith({
        status: true,
      });
    });
  });
  describe('getTitles function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 412 if automations are disabled', async () => {
      req.currentUser.automation_info.is_enabled = false;
      req.body = { id: '66fafe069d555d043c3a894e' };
      await getTitles(req, res);

      expect(res.status).toHaveBeenCalledWith(412);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Disable automations',
      });
    });
  });
  describe('updateDefault function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 400 if the default automation does not exist', async () => {
      req.body = updateDefault_req;
      mockingoose(Video).toReturn(null, 'findOne');
      await updateDefault(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'This Default automation not exists',
      });
    });
    it('should return 400 if garbage cannot be retrieved', async () => {
      mockingoose(Video).toReturn(video_with_admin_role, 'findOne');
      mockingoose(Garbage).toReturn(garbage_data, 'save'); // Mocking garbage not found
      jest.mock('../../helpers/garbage', () => ({
        get: jest.fn().mockResolvedValue({
          _id: '5fd97ad994cf273d68a016db',
        }),
      }));
      await updateDefault(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: `Couldn't get the Garbage`,
      });
    });
  });
  describe('loadIncludings function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 412 if automations are disabled', async () => {
      req.currentUser.automation_info.is_enabled = false;

      await loadIncludings(req, res);

      expect(res.status).toHaveBeenCalledWith(412);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Disable automations',
      });
    });
  });
  describe('removeFolder function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 500 if folder lookup fails', async () => {
      req.body = { _id: '62a6bdf21d54300470676b0c', mode: '', target: '' };
      // mockingoose(Folder)(new Error('Database error'), 'findOne');
      mockingoose(Folder).toReturn(new Error('Database error'), 'findOne');
      await removeFolder(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Database error',
      });
    });
    it('should return 400 if folder not found', async () => {
      req.body = { _id: '62a6bdf21d54300470676b0c', mode: '', target: '' };
      mockingoose(Folder).toReturn(null, 'findOne');
      await removeFolder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'Not found folder',
      });
    });
  });
  describe('getDetail function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return 400 if automation not found', async () => {
      req.params = { _id: '62a6bdf21d54300470676b0c' };
      mockingoose(Automation).toReturn(null, 'findOne');

      await getDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'not_found',
      });
    });
    it('should return details of the automation', async () => {
      req.params = { _id: '62a6bdf21d54300470676b0c' };
      mockingoose(Automation).toReturn(detail_automation, 'findOne');
      mockingoose(Video).toReturn([], 'find');
      mockingoose(PDF).toReturn([], 'find');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Image).toReturn([], 'find');
      mockingoose(Automation).toReturn([], 'find');
      await getDetail(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
    });
  });
  describe('getParentFolderByAutomation function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should return automation and folder lists', async () => {
      req.params = { _id: '62a6bdf21d54300470676b0c' };
      req.currentUser = currentUser;
      mockingoose(Folder).toReturn(parentFolders, 'find');
      mockingoose(Folder).toReturn(one_parent, 'findOne');
      mockingoose(Automation).toReturn(action_automations, 'find');
      await getParentFolderByAutomation(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
    });
  });
  describe('searchContact function', () => {
    let req;
    let res;
    beforeEach(() => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      req.currentUser = currentUser;
    });
    it('should handle searching with phone number', async () => {
      req.body.search = '1234567890';
      mockingoose(Contact).toReturn(search_res_contacts, 'find');
      TimeLine.findOne.mockResolvedValue(time_lines_automation);
      await searchContact(req, res);
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
    });
    it('should log an error if timeline lookup fails', async () => {
      req.body.search = '1234567890';
      mockingoose(Contact).toReturn(search_res_contacts, 'find');
      console.log = jest.fn();
      TimeLine.findOne.mockRejectedValue(new Error('Timeline error'));
      await searchContact(req, res);
      expect(console.log).toHaveBeenCalledWith(
        'time line find err',
        'Timeline error'
      );
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
    });
  });
});
