const mockingoose = require('mockingoose');
const httpMocks = require('jest-mock-req-res');
const Video = require('../../models/video');
const Pdf = require('../../models/pdf');
const Image = require('../../models/image');
const Folder = require('../../models/folder');
const Team = require('../../models/team');
const EmailTemplate = require('../../models/email_template');
const Automation = require('../../models/automation');
const Pipeline = require('../../models/pipe_line');
const DealStage = require('../../models/deal_stage');
const {
  downloadMaterialCheck,
  downloadMaterial,
  downloadTemplateCheck,
  downloadTemplate,
  downloadAutomationCheck,
  downloadAutomation,
  downloadPipelineCheck,
  downloadPipeline,
} = require('../team');
const { users } = require('../../../__tests__/__mocks__/data/user');
const {
  correct_download_material_req,
  correct_material_req,
  incorrect_material_req,
  original_pdfs,
  original_images,
  download_videos,
} = require('../../../__tests__/__mocks__/data/material');
const {
  correct_template_req,
  incorrect_template_req,
  original_templates,
} = require('../../../__tests__/__mocks__/data/template');
const {
  correct_automation_req,
  incorrect_automation_req,
  original_automations,
  newDownloadedAutomations,
} = require('../../../__tests__/__mocks__/data/automation');
const {
  correct_pipeline_req,
  incorrect_pipeline_req,
  original_pipelines,
  newDownloadedPipelines,
} = require('../../../__tests__/__mocks__/data/pipe_line');
const {
  downloaded_material_folders,
  original_template_folders,
} = require('../../../__tests__/__mocks__/data/folder');
const {
  correct_team_id,
  defaultTeam,
} = require('../../../__tests__/__mocks__/data/team');
const {
  filteredVideosByIds,
  filteredPdfsByIds,
  filteredImagesByIds,
  filteredDownloadedVideo,
  findFolder,
} = require('../../../__tests__/__mocks__/functions/material');
const {
  filteredTemplates,
} = require('../../../__tests__/__mocks__/functions/template');
const {
  filteredAutomations,
} = require('../../../__tests__/__mocks__/functions/automation');
const {
  filteredPipelines,
} = require('../../../__tests__/__mocks__/functions/pipe_line');
const {
  original_dealStages,
  newDownloadedDealStages,
} = require('../../../__tests__/__mocks__/data/deal_stage');

const { mockRequest, mockResponse } = httpMocks;

jest.mock('twilio', () => {
  const create = jest.fn().mockResolvedValue({ sid: 'mocked-sid' });
  return jest.fn(() => ({
    messages: { create },
  }));
});

describe('downloadMaterial', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('download material check', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne');
      mockingoose(Pdf).toReturn(original_pdfs, 'find');
      mockingoose(Image).toReturn(original_images, 'find');
    });

    it('Should be checked the material', async () => {
      req.currentUser = users[0];
      req.body = {
        materials: correct_download_material_req,
        team: correct_team_id,
      };
      mockingoose(Folder).toReturn(downloaded_material_folders, 'find');
      await downloadMaterialCheck(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.folders).toBeDefined();
      expect(response.data.unsharedItems).toBeDefined();
      expect(response.data.downloadedItems).toBeDefined();
    });

    it('Should be disabled download material', async () => {
      req.currentUser = users[1];
      req.body = {
        materials: correct_download_material_req,
        team: correct_team_id,
      };
      await downloadMaterialCheck(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(412);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Disable download materials');
    });

    it('Should be exceed upload max materials', async () => {
      req.currentUser = users[0];
      req.body = {
        materials: correct_download_material_req,
        team: correct_team_id,
      };
      mockingoose(Video).toReturn(47, 'countDocuments');
      mockingoose(Pdf).toReturn(26, 'countDocuments');
      mockingoose(Image).toReturn(27, 'countDocuments');
      await downloadMaterialCheck(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(412);
      expect(response.status).toBeFalsy();
      expect(response.error).toBe('Exceed upload max materials');
    });
  });

  describe('download material', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne')
        .toReturn(download_videos, 'insertMany');
      mockingoose(Pdf)
        .toReturn(filteredPdfsByIds, 'find')
        .toReturn([], 'insertMany');
      mockingoose(Image)
        .toReturn(filteredImagesByIds, 'find')
        .toReturn([], 'insertMany');
      mockingoose(EmailTemplate)
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
      mockingoose(Automation).toReturn([], 'find').toReturn([], 'insertMany');
    });

    it('Should be downloaded the material', async () => {
      req.currentUser = users[0];
      req.body = {
        materials: correct_material_req,
        team: correct_team_id,
      };
      mockingoose(Folder)
        .toReturn(findFolder, 'findOne')
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
      mockingoose(Team).toReturn(defaultTeam, 'findOne');

      await downloadMaterial(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
    });

    it('Do not have permission to download materials', async () => {
      req.currentUser = users[0];
      req.body = {
        materials: incorrect_material_req,
        team: correct_team_id,
      };
      mockingoose(Folder).toReturn(null, 'findOne').toReturn([], 'find');

      await downloadMaterial(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeFalsy();
      expect(response.error).toBe(
        'You have not permission to download materials'
      );
    });
  });
});

describe('downloadTemplate', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('download template check', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne');
      mockingoose(Pdf).toReturn(original_pdfs, 'find');
      mockingoose(Image).toReturn(original_images, 'find');
    });

    it('Should be checked the template', async () => {
      req.currentUser = users[0];
      req.body = {
        templates: correct_template_req,
        team: correct_team_id,
      };
      mockingoose(Folder).toReturn(original_template_folders, 'find');
      mockingoose(EmailTemplate).toReturn(original_templates, 'find');
      await downloadTemplateCheck(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.videos).toBeDefined();
      expect(response.data.pdfs).toBeDefined();
      expect(response.data.images).toBeDefined();
      expect(response.data.unsharedItems).toBeDefined();
      expect(response.data.downloadedItems).toBeDefined();
    });
  });

  describe('download template', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne')
        .toReturn(download_videos, 'insertMany');
      mockingoose(Pdf).toReturn([], 'find').toReturn([], 'insertMany');
      mockingoose(Image).toReturn([], 'find').toReturn([], 'insertMany');
    });

    it('Should be downloaded the template', async () => {
      req.currentUser = users[0];
      req.body = {
        templates: correct_template_req,
        team: correct_team_id,
      };
      mockingoose(Folder)
        .toReturn(findFolder, 'findOne')
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
      mockingoose(EmailTemplate)
        .toReturn(filteredTemplates, 'find')
        .toReturn([], 'insertMany');
      mockingoose(Team).toReturn(defaultTeam, 'findOne');
      mockingoose(Automation).toReturn([], 'find').toReturn([], 'insertMany');
      await downloadTemplate(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.duplicatedTokens).toBeDefined();
    });

    it('Do not have permission to download template', async () => {
      req.currentUser = users[0];
      req.body = {
        templates: incorrect_template_req,
        team: correct_team_id,
      };
      mockingoose(Folder).toReturn(findFolder, 'findOne').toReturn([], 'find');
      mockingoose(EmailTemplate).toReturn(filteredTemplates, 'find');
      await downloadTemplate(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeFalsy();
      expect(response.error).toBe(
        'You have not permission to download templates'
      );
    });
  });
});

describe('downloadAutomation', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('download automation check', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne');
      mockingoose(Pdf).toReturn(original_pdfs, 'find');
      mockingoose(Image).toReturn(original_images, 'find');
    });

    it('Should be checked the automation', async () => {
      req.currentUser = users[0];
      req.body = {
        automations: correct_automation_req,
        team: correct_team_id,
      };
      mockingoose(Automation).toReturn(original_automations, 'find');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Folder).toReturn([], 'find');
      await downloadAutomationCheck(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.videos).toBeDefined();
      expect(response.data.pdfs).toBeDefined();
      expect(response.data.images).toBeDefined();
      expect(response.data.dealStages).toBeDefined();
      expect(response.data.titles).toBeDefined();
      expect(response.data.unsharedItems).toBeDefined();
      expect(response.data.downloadedItems).toBeDefined();
    });
  });

  describe('download automation', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne')
        .toReturn(download_videos, 'insertMany');
      mockingoose(Pdf)
        .toReturn(filteredPdfsByIds, 'find')
        .toReturn([], 'insertMany');
      mockingoose(Image)
        .toReturn(filteredImagesByIds, 'find')
        .toReturn([], 'insertMany');
      mockingoose(EmailTemplate)
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
      mockingoose(Automation).toReturn([], 'find').toReturn([], 'insertMany');
    });

    it('Should be downloaded the automation', async () => {
      req.currentUser = users[0];
      req.body = {
        automations: correct_automation_req,
        team: correct_team_id,
      };
      mockingoose(Folder)
        .toReturn(findFolder, 'findOne')
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
      mockingoose(Team).toReturn(defaultTeam, 'findOne');
      mockingoose(Automation)
        .toReturn(filteredAutomations, 'find')
        .toReturn(newDownloadedAutomations, 'insertMany')
        .toReturn(newDownloadedAutomations[0], 'findOne');

      await downloadAutomation(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
    });

    it('Do not have permission to download automation.', async () => {
      req.currentUser = users[0];
      req.body = {
        automations: incorrect_automation_req,
        team: correct_team_id,
      };
      mockingoose(Automation).toReturn(filteredAutomations, 'find');
      mockingoose(Folder).toReturn(null, 'findOne').toReturn([], 'find');
      mockingoose(Team).toReturn(defaultTeam, 'findOne');

      await downloadAutomation(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeFalsy();
      expect(response.error).toBe(
        'You have not permission to download automations'
      );
    });
  });
});

describe('downloadPipeline', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  // sednEmail
  describe('download pipeline check', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne');
      mockingoose(Pdf).toReturn([], 'find');
      mockingoose(Image).toReturn([], 'find');
    });

    it('Should be checked the pipeline', async () => {
      req.currentUser = users[1];
      req.body = {
        pipelines: correct_pipeline_req,
        team: correct_team_id,
      };
      mockingoose(Pipeline).toReturn(original_pipelines, 'find');
      mockingoose(Automation).toReturn([], 'find');
      mockingoose(DealStage).toReturn([], 'find');
      mockingoose(Folder).toReturn([], 'find');
      await downloadPipelineCheck(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.videos).toBeDefined();
      expect(response.data.pdfs).toBeDefined();
      expect(response.data.images).toBeDefined();
      expect(response.data.dealStages).toBeDefined();
      expect(response.data.titles).toBeDefined();
      expect(response.data.unsharedItems).toBeDefined();
      expect(response.data.downloadedItems).toBeDefined();
      expect(response.data.limited).toBeDefined();
    });

    it('Should be exceed max pipelines', async () => {
      req.currentUser = users[1];
      req.body = {
        pipelines: correct_pipeline_req,
        team: correct_team_id,
      };
      mockingoose(Pipeline).toReturn(10, 'countDocuments');
      await downloadPipelineCheck(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeFalsy();
      expect(res.status).toHaveBeenCalledWith(412);
      expect(response.error).toBe('Exceed max pipelines');
    });
  });

  describe('download pipeline', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
      mockingoose(Video)
        .toReturn(filteredVideosByIds, 'find')
        .toReturn(filteredDownloadedVideo, 'findOne')
        .toReturn(download_videos, 'insertMany');
      mockingoose(Pdf).toReturn([], 'find').toReturn([], 'insertMany');
      mockingoose(Image).toReturn([], 'find').toReturn([], 'insertMany');
      mockingoose(EmailTemplate)
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
    });

    it('Should be downloaded the pipeline', async () => {
      req.currentUser = users[1];
      req.body = {
        pipelines: correct_pipeline_req,
        team: correct_team_id,
      };
      mockingoose(Pipeline)
        .toReturn(filteredPipelines, 'find')
        .toReturn(newDownloadedPipelines, 'insertMany');
      mockingoose(Automation).toReturn([], 'find').toReturn([], 'insertMany');
      mockingoose(DealStage)
        .toReturn(original_dealStages, 'find')
        .toReturn(newDownloadedDealStages, 'insertMany');
      mockingoose(Folder)
        .toReturn(findFolder, 'findOne')
        .toReturn([], 'find')
        .toReturn([], 'insertMany');
      mockingoose(Team).toReturn(defaultTeam, 'findOne');
      await downloadPipeline(req, res);
      const response = res.send.mock.calls[0][0];

      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.duplicatedTokens).toBeDefined();
    });

    it('Should be exceed max pipelines', async () => {
      req.currentUser = users[1];
      req.body = {
        pipelines: correct_pipeline_req,
        team: correct_team_id,
      };
      mockingoose(Pipeline).toReturn(10, 'countDocuments');
      await downloadPipelineCheck(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeFalsy();
      expect(res.status).toHaveBeenCalledWith(412);
      expect(response.error).toBe('Exceed max pipelines');
    });

    it('Do not have permission to download pipeline', async () => {
      req.currentUser = users[1];
      req.body = {
        pipelines: correct_pipeline_req,
        team: correct_team_id,
      };
      mockingoose(Pipeline).toReturn(filteredPipelines, 'find');
      mockingoose(Folder).toReturn(null, 'findOne').toReturn([], 'find');
      mockingoose(Team).toReturn(defaultTeam, 'findOne');
      await downloadPipeline(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeFalsy();
      expect(response.error).toBe(
        'You have not permission to download pipeline'
      );
    });
  });
});
