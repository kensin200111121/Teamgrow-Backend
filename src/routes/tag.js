const express = require('express');

const { checkAppJwtAuth, checkGlobalAuth } = require('../middleware/auth');
const TagCtrl = require('../controllers/tag');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/', checkAppJwtAuth, catchError(TagCtrl.create));
router.get('/', checkGlobalAuth, catchError(TagCtrl.getAll));
// TODO: Remove the following endpoint
router.get('/getAll', checkGlobalAuth, catchError(TagCtrl.getAll));
router.get('/shared-tags/:id', checkGlobalAuth, catchError(TagCtrl.getSharedAll));
router.get(
  '/getAllForTeam',
  checkGlobalAuth,
  catchError(TagCtrl.getAllForTeam)
);

router.post('/search', checkAppJwtAuth, catchError(TagCtrl.search));
// TODO: remove the following endpoint, Instead of this, please use api/contact/export
router.post(
  '/load-contacts',
  checkGlobalAuth,
  catchError(TagCtrl.getTagsDetail)
);
router.post(
  '/load-all-contacts',
  checkAppJwtAuth,
  catchError(TagCtrl.getTagsDetail1)
);
router.post('/update', checkAppJwtAuth, catchError(TagCtrl.updateTag));
router.post('/delete', checkAppJwtAuth, catchError(TagCtrl.deleteTag));
router.post('/multi-delete', checkAppJwtAuth, catchError(TagCtrl.deleteTags));
router.post('/merge', checkAppJwtAuth, catchError(TagCtrl.mergeTag));

module.exports = router;
