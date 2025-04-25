const express = require('express');

const {
  checkAppJwtAuth,
  checkSuspended,
  checkAuthExtension,
} = require('../middleware/auth');
const TemplateCtrl = require('../controllers/email_template');
const { catchError } = require('../controllers/error');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions } = require('../middleware/cors');
const { EXTENSION_WHITELIST, FRONT_WHITELIST } = require('../constants/cors');

router.get('/', checkAppJwtAuth, catchError(TemplateCtrl.getAll));
router.post(
  '/create',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  checkSuspended,
  catchError(TemplateCtrl.create)
);
router.post(
  '/createTemplate',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(TemplateCtrl.createTemplate)
);
router.get(
  '/easy-load',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.getEasyLoad)
);
router.get(
  '/load-own',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(TemplateCtrl.load)
);
router.post(
  '/load-own',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(TemplateCtrl.loadOwn)
);
router.post(
  '/req-folderid',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(TemplateCtrl.getParentFolderId)
);
router.get(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.get)
);
router.put(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(TemplateCtrl.update)
);
router.delete(
  '/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(TemplateCtrl.remove)
);
router.post(
  '/list/own',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.loadOwn)
);

router.post(
  '/load-library',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.loadLibrary)
);

router.post(
  '/list/:page',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.getTemplates)
);
router.post(
  '/remove',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.bulkRemove)
);
router.post(
  '/search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.search)
);
router.post(
  '/search-own',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.ownSearch)
);
router.post(
  '/move',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.moveFile)
);
router.post(
  '/remove-folder',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(TemplateCtrl.removeFolder)
);
router.post(
  '/remove-folders',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.removeFolders)
);
router.post(
  '/download-folder',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(TemplateCtrl.downloadFolder)
);
router.post(
  '/bulk-download',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(TemplateCtrl.bulkDownload)
);
// router.get('/receive' , checkAppJwtAuth, catchError(EmailCtrl.receive))

module.exports = router;
