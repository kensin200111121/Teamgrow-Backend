const express = require('express');
const fs = require('fs');
const multer = require('multer');
const {
  checkAppJwtAuth,
  checkSuspended,
  checkGlobalAuth,
  checkConvrrtEvent,
  checkApiKeyAuth,
  checkLastLogin,
} = require('../middleware/auth');
const TagCtrl = require('../controllers/tag');
const ContactCtrl = require('../controllers/contact');
const { catchError } = require('../controllers/error');
const { FILES_PATH } = require('../configs/path');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');
const {
  FRONT_WHITELIST,
  UCRAFT_WHITELIST,
  MATERIAL_WHITELIST,
} = require('../constants/cors');

const fileStorage = multer.diskStorage({
  destination(req, file, cb) {
    if (!fs.existsSync(FILES_PATH)) {
      fs.mkdirSync(FILES_PATH);
    }
    cb(null, FILES_PATH);
  },
});

const upload = multer({ storage: fileStorage });

router.post(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(ContactCtrl.create)
);

router.get(
  '/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAll)
);

// TODO: Need to update the auth middleware for only api call (Other GlobalAuth Middleware apis)
router.get(
  '/export',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkGlobalAuth,
  catchError(TagCtrl.getTagsDetail)
);

router.get(
  '/ids',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAllIds)
);

router.post(
  '/load-by-ids',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadByIds)
);

// Edit contact by id
router.put(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.update)
);

// Remove contact and its all related info (activity, followup) by id
router.delete(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.remove)
);

// Remove contacts and their relative info
router.post(
  '/remove',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.bulkRemove)
);

router.post(
  '/lead',
  cors(generateCorsOptions(MATERIAL_WHITELIST)),
  catchError(ContactCtrl.leadContact)
);
router.post(
  '/convrrt-lead',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkConvrrtEvent,
  catchError(ContactCtrl.leadContact)
);
router.post('/interest', catchError(ContactCtrl.interestSubmitContact));
router.post('/interest-submit', catchError(ContactCtrl.interestContact));

router.post(
  '/ucraft/create',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkApiKeyAuth,
  catchError(ContactCtrl.createContactByUcraft)
);
// Import contact list as file
router.post(
  '/import-csv',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.single('csv'),
  catchError(ContactCtrl.importCSV)
);

router.post(
  '/import-csv-chunk',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.single('csv'),
  catchError(ContactCtrl.importCSVChunk)
);

router.post(
  '/import-contacts',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(ContactCtrl.importContacts)
);

router.post(
  '/overwrite-csv',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.single('csv'),
  catchError(ContactCtrl.overwriteCSV)
);

router.post(
  '/duplicate-csv',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  upload.single('csv'),
  catchError(ContactCtrl.duplicateCSV)
);

// Download contact list as csv file
router.post(
  '/export-csv',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.exportCSV)
);

// Get a search contact info for profile page
router.post(
  '/search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.search)
);

// Get a easy search contact info for profile page
router.post(
  '/search-easy',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.searchEasy)
);

// Advanced Search
router.post(
  '/advance-search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.advanceSearch)
);

router.post(
  '/advance-search/:action',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.advanceSearch)
);

router.post(
  '/search-by-custom',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.additionalFieldSearch)
);
router.post(
  '/field-count',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.additionalFields)
);

// Verify Email
// router.post('/verify-email', catchError(ContactCtrl.verifyEmail));

// Verify Phone number
router.post(
  '/verify-phone',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(ContactCtrl.verifyPhone)
);

// Get contacts by All last activity
router.get(
  '/all',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAllByLastActivity)
);

// Get contacts by last activity
router.get(
  '/last',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getByLastActivity)
);

// Get contacts by last activity
router.post(
  '/last/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(checkLastLogin),
  catchError(ContactCtrl.getByLastActivity)
);

router.get(
  '/select-all',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.selectAllContacts)
);
// Get a Brokerage data
router.get(
  '/brokerage',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getBrokerages)
);

// Get Source data
router.get(
  '/sources',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getSources)
);

// Get City data
router.get(
  '/cities',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getCities)
);

// Get a Contact data with ID
router.get(
  '/get/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getById)
);

// Load Duplicated Contacts
router.get(
  '/load-duplication',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadDuplication)
);

// Get All Contacts
router.get(
  '/get-all',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAllContacts)
);

// Get Contacts data with ID array
router.post(
  '/get',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getByIds)
);

// Bulk Edit the contacts Label
router.post(
  '/bulk-label',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.bulkEditLabel)
);

// Load Follows
router.post(
  '/follows',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadFollows)
);

// Load Timelines
router.post(
  '/timelines',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadTimelines)
);

// Bulk Edit(update) the contacts
router.post(
  '/bulk-update',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.bulkUpdate)
);

// Get the Nth Contact
router.get(
  '/nth-get/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getNthContact)
);

// Check the Email
router.post(
  '/check-email',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.checkEmail)
);

// Set Primary Email
router.post(
  '/set-primary-email',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.setPrimaryEmail)
);

// Set Primary PhoneNumber
router.post(
  '/set-primary-phone',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.setPrimaryPhoneNumber)
);

router.post(
  '/set-primary-address',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.setPrimaryAddress)
);

// Check the Phone
router.post(
  '/check-phone',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.checkPhone)
);

// Check the Merge
router.post(
  '/merge',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.mergeContacts)
);

router.post(
  '/bulk-create',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.bulkCreate)
);

router.post(
  '/resubscribe',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.resubscribe)
);

router.post(
  '/filter',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.filter)
);

router.post(
  '/contact-merge',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.mergeContact)
);

router.post(
  '/update-contact',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.updateContact)
);

// Share contact
router.post(
  '/share-contact',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.shareContacts)
);

// Stop Share contact
router.post(
  '/stop-share',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.stopShare)
);

router.post(
  '/load-by-emails',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadByEmails)
);

router.post(
  '/get-detail/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getDetail)
);

router.post(
  '/get-activities/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getActivities)
);

router.post(
  '/load-activities/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadGroupActivities)
);

router.post(
  '/get-total-count-contact-actions/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getTotalCountContactAction)
);

router.post(
  '/get-contact-actions/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getContactActionContentList)
);

router.post(
  '/get-contact-activity-detail/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getContactActivityDetail)
);

router.post(
  '/remove-task',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.removeFromTask)
);

router.post(
  '/merge-additional-fields',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.mergeAdditionalFields)
);

router.get(
  '/load-properties/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadProperties)
);

router.post(
  '/load-additional-fields-conflict-contacts-pagination',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadAdditionalFieldsConflictContactsPagination)
);

router.get(
  '/load-notes/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadNotes)
);

router.get(
  '/get-timeline/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getTimeline)
);

router.get(
  '/get-tasks/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getTasks)
);

// count of contacts by fields
router.post(
  '/count-by-fields',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.groupByFields)
);

// count of the contacts by activities and those date ranges
router.post(
  '/count-by-activities',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.groupByActivities)
);

router.post(
  '/count-by-rates',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.groupByRates)
);

router.post(
  '/calculate-rates',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.calculateRates)
);

router.post(
  '/unlock',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.unlockRate)
);

router.post(
  '/move-accept',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.acceptMoveContacts)
);

router.post(
  '/move-decline',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.declineMoveContacts)
);

// // count of the contacts by tasks, schedule and appointments and those date ranges
// router.post(
//   '/count-by-tasks',
//   checkAppJwtAuth,
//   catchError(ContactCtrl.groupByTasks)
// );

// TODO: count of the deals, pipelines
// TODO: count of the campaigns

// Get a pull contact info for profile page

// Share Pending Contacts
router.post(
  '/share-pending/advance-search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.sharePendingAdvanceSearch)
);

router.post(
  '/share-pending/advance-search/:action',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.sharePendingAdvanceSearch)
);

router.get(
  '/share-pending/get-all',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAllSharePendingContacts)
);

router.post(
  '/share-pending/:skip',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getSharePendingContacts)
);

// Shared Contacts
router.post(
  '/shared/advance-search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.sharedAdvanceSearch)
);

router.post(
  '/shared/advance-search/:action',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.sharedAdvanceSearch)
);

router.get(
  '/shared/get-all',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAllSharedContacts)
);

router.post(
  '/shared/:skip',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getSharedContacts)
);

// Get Contact List (Universal API)

router.post(
  '/load-contacts/:skip',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getContactList)
);

router.post(
  '/get-contacts-count/',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getContactsTotalCount)
);

// Move Pending Contacts
router.post(
  '/move-pending/advance-search',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.pendingAdvanceSearch)
);

router.post(
  '/move-pending/advance-search/:action',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.pendingAdvanceSearch)
);

router.get(
  '/move-pending/get-all',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getAllPendingContacts)
);

router.post(
  '/move-pending/:skip',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getPendingContacts)
);

router.post(
  '/accept-sharing',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.acceptContactsSharing)
);

router.post(
  '/decline-sharing',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.declineContactsSharing)
);

router.get(
  '/pending-contacts-count',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getPendingContactsCount)
);

router.post(
  '/mark-as-completed',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.markAsCompleted)
);

router.post(
  '/load-conversation',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.loadConversations)
);

router.post(
  '/assign-bucket',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.assignBucket)
);

router.get(
  '/count',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getCount)
);

router.post(
  '/detail/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(ContactCtrl.getStatus)
);

module.exports = router;
