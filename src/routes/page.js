const express = require('express');

const { checkAppJwtAuth, checkGlobalAuth } = require('../middleware/auth');
const PageCtrl = require('../controllers/page');
const { catchError } = require('../controllers/error');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const { FRONT_WHITELIST, ONLY_VORTEX_WHITELIST } = require('../constants/cors');

router.post(
  '/create',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.create)
);
router.put(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.update)
);
router.delete(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.delete)
);
router.get(
  '/list/:page',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.load)
);
router.post(
  '/bulk-remove',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.bulkRemove)
);
router.search(
  '/search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.search)
);
router.get(
  '/defaults',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.loadDefault)
);
router.get(
  '/list',
  cors(generateCorsOptions(ONLY_VORTEX_WHITELIST)),
  checkOrigin,
  checkGlobalAuth,
  catchError(PageCtrl.loadLandingPages)
);

router.get(
  '/templates',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.loadTemplates)
);

router.post(
  '/sites',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.loadSites)
);

router.post(
  '/sites/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.deleteSite)
);

router.post(
  '/sites/create',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.createSite)
);

router.get(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(PageCtrl.read)
);

module.exports = router;
