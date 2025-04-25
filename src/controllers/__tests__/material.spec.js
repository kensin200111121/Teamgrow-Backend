const mockingoose = require('mockingoose');
const httpMocks = require('jest-mock-req-res');

const Folder = require('../../models/folder');
const Team = require('../../models/team');
const Video = require('../../models/video');
const PDF = require('../../models/pdf');
const Image = require('../../models/image');

const {
  folders,
  folder,
  videos,
  video,
  pdfs,
  pdf,
  images,
  image,
} = require('../../../__tests__/__mocks__/data/material');
const { teams } = require('../../../__tests__/__mocks__/data/team');
const {
  gmail_user: currentUser,
} = require('../../../__tests__/__mocks__/data/user');
const {
  request_folders,
  request_folder,
  request_videos,
  request_pdfs,
  request_images,
  request_templates,
} = require('../../../__tests__/__mocks__/request/material');

const {
  downloadFolder,
  listOwnMaterials,
  loadLibraryFolderList,
  moveFiles,
} = require('../material');

const { mockRequest, mockResponse } = httpMocks;

jest.mock('../../helpers/folder', () => ({
  getPrevFolder: jest.fn((team, root_folder) => {
    if (team) {
      return '';
    } else {
      return root_folder.id;
    }
  }),
}));

describe('material', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);
  let req;
  let res;
  // downloadFolder
  describe('downloadFolder', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(Folder).toReturn(folders, 'find');
      mockingoose(Folder).toReturn(folder, 'save');
      mockingoose(Folder).toReturn(folder, 'updateOne');
      mockingoose(Video).toReturn(videos, 'find');
      mockingoose(Video).toReturn(video, 'save');
      mockingoose(PDF).toReturn(pdfs, 'find');
      mockingoose(PDF).toReturn(pdf, 'save');
      mockingoose(Image).toReturn(images, 'find');
      mockingoose(Image).toReturn(image, 'save');
      req = mockRequest();
      res = mockResponse();
    });

    it('downloader successfully', async () => {
      jest
        .spyOn(Folder.prototype, 'save')
        .mockResolvedValue(new Folder(folder));
      req.body = request_folders;
      req.currentUser = currentUser;
      await downloadFolder(req, res);
      expect(res.status).toBeTruthy();
    });
  });

  describe('listOwnMaterials', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      req = mockRequest();
      res = mockResponse();
    });

    it('downloader without folder successfully', async () => {
      req.currentUser = currentUser;
      await listOwnMaterials(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader with folder successfully', async () => {
      req.body = request_folder;
      req.currentUser = currentUser;
      mockingoose(Folder).toReturn(folder, 'findOne');
      await listOwnMaterials(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader with folder unsuccessfully', async () => {
      req.body = request_folder;
      req.currentUser = currentUser;
      mockingoose(Folder).toReturn(null, 'findOne');
      await listOwnMaterials(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('moveFiles', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(Folder).toReturn(folder, 'updateOne');
      req = mockRequest();
      res = mockResponse();
    });

    it('downloader without both source and target successfully', async () => {
      req.currentUser = currentUser;
      req.body = {
        files: {
          videos: request_videos,
        },
      };
      await moveFiles(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader only with source successfully', async () => {
      req.currentUser = currentUser;
      req.body = {
        files: {
          pdfs: request_pdfs,
        },
        source: request_folders[0],
      };
      await moveFiles(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader only with target successfully', async () => {
      req.currentUser = currentUser;
      req.body = {
        files: {
          images: request_images,
        },
        target: request_folders[0],
      };
      await moveFiles(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader with both source and target successfully', async () => {
      req.currentUser = currentUser;
      req.body = {
        files: {
          templates: request_templates,
        },
        source: request_folders[0],
        target: request_folders[1],
      };
      await moveFiles(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader with both source and target successfully', async () => {
      req.currentUser = currentUser;
      req.body = {
        files: {
          folders: request_folders,
        },
        source: request_folders[0],
        target: request_folders[1],
      };
      await moveFiles(req, res);
      expect(res.status).toBeTruthy();
    });

    it('downloader without files unsuccessfully', async () => {
      req.currentUser = currentUser;
      req.body = {
        source: request_folders[0],
        target: request_folders[1],
      };
      await moveFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('loadLibraryFolderList', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      mockingoose(Folder).toReturn(folders, 'find');
      mockingoose(Folder).toReturn(folder, 'findOne');
      mockingoose(Folder).toReturn(folder, 'findById');
      mockingoose(Team).toReturn(teams, 'find');

      req = mockRequest();
      res = mockResponse();
    });

    it('loadLibraryFolderList with folder param successfully', async () => {
      req.body = request_folder;
      req.currentUser = currentUser;
      await loadLibraryFolderList(req, res);
      expect(res.status).toBeTruthy();
    });

    it('loadLibraryFolderList without folder param successfully', async () => {
      req.currentUser = currentUser;
      await loadLibraryFolderList(req, res);
      expect(res.status).toBeTruthy();
    });

    it('loadLibraryFolderList with folder as root param successfully', async () => {
      req.currentUser = currentUser;
      req.body = { folder: 'root' };
      await loadLibraryFolderList(req, res);
      expect(res.status).toBeTruthy();
    });
  });
});
