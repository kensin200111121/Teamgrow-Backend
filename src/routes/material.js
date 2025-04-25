const express = require('express');

const {
  checkAppJwtAuth,
  checkSuspended,
  checkGlobalAuth,
  checkApiJwtAuth,
  checkApiKeyAuth,
  checkAuthExtension,
} = require('../middleware/auth');
const MaterialCtrl = require('../controllers/material');
const TrackerCtrl = require('../controllers/tracker');
const { catchError } = require('../controllers/error');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const {
  EXTENSION_WHITELIST,
  FRONT_WHITELIST,
  UCRAFT_WHITELIST,
} = require('../constants/cors');

router.post(
  '/bulk-email',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(MaterialCtrl.bulkEmail)
);

router.post(
  '/bulk-text',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(MaterialCtrl.bulkText)
);

router.post(
  '/analyticsOnType/:materialType/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.getAnalyticsOnType)
);

router.post(
  '/register-token',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.registerSendToken)
);

router.post('/social-share', catchError(MaterialCtrl.socialShare));
router.post('/thumbs-up', catchError(MaterialCtrl.thumbsUp));
router.post(
  '/update-folders',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.updateFolders)
);
router.post(
  '/remove-folders',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.removeFolders)
);

router.get(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkGlobalAuth,
  catchError(MaterialCtrl.easyLoadMaterials)
);

router.get(
  '/convrrt/list',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkApiJwtAuth,
  catchError(MaterialCtrl.easyLoadMaterials)
);

router.post(
  '/ucraft/list',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkApiKeyAuth,
  catchError(MaterialCtrl.easyLoadMaterials)
);

router.get(
  '/convrrt/load',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkApiJwtAuth,
  catchError(MaterialCtrl.loadFolderVideos)
);
router.post(
  '/list-own',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.listOwnMaterials)
);
router.post(
  '/list-library',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.listLibraryMaterials)
);
router.post(
  '/load-library',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.loadLibrary)
);
router.get(
  '/load-own',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.load)
);
router.get(
  '/load',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.load)
);
router.post(
  '/folder',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(MaterialCtrl.createFolder)
);
router.put(
  '/folder/:id',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.editFolder)
);
router.post(
  '/remove-folder',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.removeFolder)
);
router.post(
  '/remove',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.bulkRemove)
);
router.post(
  '/move-material',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.moveMaterials)
);

router.post(
  '/lead-capture',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.leadCapture)
);

router.post(
  '/download-folder',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(MaterialCtrl.downloadFolder)
);

router.post(
  '/bulk-download',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.bulkDownload)
);

router.post('/track-pdf', catchError(TrackerCtrl.createPDF));
router.post('/extension-track-pdf', catchError(TrackerCtrl.extensionCreatePDF));

router.put('/track-pdf-update/:id', catchError(TrackerCtrl.updatePDF));
router.put(
  '/extension-track-pdf-update/:id',
  catchError(TrackerCtrl.extensionUpdatePDF)
);

router.post('/track-image', catchError(TrackerCtrl.createImage));
router.post(
  '/extension-track-image',
  catchError(TrackerCtrl.extensionCreateImage)
);

router.post(
  '/update-material-theme',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.updateMaterialTheme)
);

router.post(
  '/load-own',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.loadOwn)
);

router.post(
  '/load-library-folder-list',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.loadLibraryFolderList)
);

router.post(
  '/load-views',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.loadViews)
);

router.post(
  '/load-views-with-id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.loadTrackCount)
);

router.post(
  '/toggle-enable-notification',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.toggleEnableNotification)
);

router.post(
  '/req-folderid',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthExtension,
  catchError(MaterialCtrl.getParentFolderId)
);
router.get(
  '/folders',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.loadFolders)
);

router.post(
  '/move',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.moveFiles)
);

router.post(
  '/activities',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(MaterialCtrl.getActivities)
);

module.exports = router;
