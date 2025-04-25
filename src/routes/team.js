const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const TeamCtrl = require('../controllers/team');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/', checkAppJwtAuth, catchError(TeamCtrl.create));
router.get('/load', checkAppJwtAuth, catchError(TeamCtrl.getAll));
router.get('/load-leaders', checkAppJwtAuth, catchError(TeamCtrl.getLeaders));
router.get(
  '/load-invited',
  checkAppJwtAuth,
  catchError(TeamCtrl.getInvitedTeam)
);
router.get(
  '/load-requested',
  checkAppJwtAuth,
  catchError(TeamCtrl.getRequestedTeam)
);

router.post(
  '/get-all',
  checkAppJwtAuth,
  catchError(TeamCtrl.getAllSharedContacts)
);

router.get('/user/:id', checkAppJwtAuth, catchError(TeamCtrl.getTeam));
router.post(
  '/request',
  checkAppJwtAuth,
  checkSuspended,
  catchError(TeamCtrl.requestTeam)
);

router.post(
  '/cancel-request/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.cancelRequest)
);

router.post(
  '/bulk-invite/:id',
  checkAppJwtAuth,
  checkSuspended,
  catchError(TeamCtrl.bulkInvites)
);

router.post(
  '/cancel-invite/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.cancelInvite)
);

router.post(
  '/accept/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.acceptInviation)
);

router.post(
  '/decline/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.declineInviation)
);

router.post(
  '/admin-accept',
  checkAppJwtAuth,
  catchError(TeamCtrl.acceptRequest)
);

router.post(
  '/admin-decline',
  checkAppJwtAuth,
  catchError(TeamCtrl.declineRequest)
);

// router.post(
//   '/share-videos',
//   checkAppJwtAuth,
//   catchError(TeamCtrl.shareVideos)
// );
// router.post('/share-pdfs', checkAppJwtAuth, catchError(TeamCtrl.sharePdfs));
// router.post(
//   '/share-images',
//   checkAppJwtAuth,
//   catchError(TeamCtrl.shareImages)
// );
router.post(
  '/share-materials',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareMaterials)
);

router.post(
  '/share-team-materials',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareTeamMaterials)
);

router.post(
  '/share-automations',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareAutomations)
);
router.post(
  '/share-templates',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareEmailTemplates)
);

router.post(
  '/remove-videos/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeVideos)
);
router.post(
  '/remove-pdfs/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.removePdfs)
);
router.post(
  '/remove-images/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeImages)
);
router.post(
  '/remove-folder/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeFolders)
);
router.post(
  '/remove-templates/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeEmailTemplates)
);
router.post(
  '/remove-automation/:id',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeAutomations)
);
router.post('/search-team', checkAppJwtAuth, catchError(TeamCtrl.searchTeam));
router.post('/update', checkAppJwtAuth, catchError(TeamCtrl.updateTeam));

router.post(
  '/shared-contacts',
  checkAppJwtAuth,
  catchError(TeamCtrl.getSharedContacts)
);

router.post(
  '/search-contact',
  checkAppJwtAuth,
  catchError(TeamCtrl.searchContact)
);

router.post(
  '/share-folders',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareFolders)
);

router.post(
  '/unshare-folders',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareFolders)
);

router.post(
  '/unshare-templates',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareTemplates)
);

router.post(
  '/unshare-automations',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareAutomations)
);

router.post(
  '/unshare-materials',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareMaterials)
);

router.post(
  '/shared-teams',
  checkAppJwtAuth,
  catchError(TeamCtrl.loadSharedTeams)
);

router.post('/stop-share', checkAppJwtAuth, catchError(TeamCtrl.stopShare));
router.post('/stop-shares', checkAppJwtAuth, catchError(TeamCtrl.stopShares));

router.post('/material', checkAppJwtAuth, catchError(TeamCtrl.loadMaterial));
router.post(
  '/automation',
  checkAppJwtAuth,
  catchError(TeamCtrl.loadAutomation)
);
router.post('/template', checkAppJwtAuth, catchError(TeamCtrl.loadTemplate));
router.put('/:id', checkAppJwtAuth, catchError(TeamCtrl.update));
router.get('/:id', checkAppJwtAuth, catchError(TeamCtrl.get));
router.delete('/:id', checkAppJwtAuth, catchError(TeamCtrl.remove));

router.post('/leave', checkAppJwtAuth, catchError(TeamCtrl.leaveTeam));

router.post(
  '/removeMemberItems',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeTeamMemberItems)
);

router.post(
  '/remove-member',
  checkAppJwtAuth,
  catchError(TeamCtrl.removeTeamMember)
);

router.post(
  '/bulk-stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.bulkStopShare)
);

router.post(
  '/material/share',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareMaterialsV2)
);

router.post(
  '/material/stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareMaterialsV2)
);

router.post(
  '/material/check-download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadMaterialCheck)
);

router.post(
  '/material/download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadMaterial)
);

router.post(
  '/automation/check-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.checkShareAutomationV2)
);

router.post(
  '/automation/get-related-resources',
  checkAppJwtAuth,
  catchError(TeamCtrl.getRelatedResources)
);

router.post(
  '/automation/share',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareAutomationsV2)
);

router.post(
  '/automation/stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareAutomationsV2)
);

router.post(
  '/automation/check-download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadAutomationCheck)
);

router.post(
  '/automation/download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadAutomation)
);

router.post(
  '/pipeline/check-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.checkSharePipelineV2)
);

router.post(
  '/pipeline/share',
  checkAppJwtAuth,
  catchError(TeamCtrl.sharePipelinesV2)
);

router.post(
  '/pipeline/check-stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareCheckPipelinesV2)
);

router.post(
  '/pipeline/stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unsharePipelinesV2)
);

router.post('/pipeline', checkAppJwtAuth, catchError(TeamCtrl.loadPipeline));

router.post(
  '/pipeline/check-download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadPipelineCheck)
);

router.post(
  '/pipeline/download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadPipeline)
);

router.post(
  '/template/check-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.checkShareTemplateV2)
);

router.post(
  '/template/get-template-resources',
  checkAppJwtAuth,
  catchError(TeamCtrl.checkShareTemplateV2)
);

router.post(
  '/template/share',
  checkAppJwtAuth,
  catchError(TeamCtrl.shareTemplatesV2)
);

router.post(
  '/template/stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareTemplatesV2)
);

router.post(
  '/template/check-download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadTemplateCheck)
);

router.post(
  '/template/download',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadTemplate)
);

router.post(
  '/material/check-stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareCheckMaterialsV2)
);
router.post(
  '/automation/check-stop-share',
  checkAppJwtAuth,
  catchError(TeamCtrl.unshareCheckAutomationsV2)
);

router.post(
  '/download-duplicated-tokens',
  checkAppJwtAuth,
  catchError(TeamCtrl.downloadDuplicatedTokens)
);

module.exports = router;
