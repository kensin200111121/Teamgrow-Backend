const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const {
  create,
  sendEmails,
  sendTexts,
  createNote,
  createFollowUp,
  updateFollowUp,
  completeFollowUp,
  moveDeal,
} = require('../../controllers/deal');
const { bulkUpdate } = require('../../controllers/contact');

const router = express.Router();

router.post('/', checkMicroAuth, catchError(create));
router.post('/send-email', checkMicroAuth, catchError(sendEmails));
router.post('/send-text', checkMicroAuth, catchError(sendTexts));
router.post('/create-note', checkMicroAuth, catchError(createNote));
router.post('/add-follow', checkMicroAuth, catchError(createFollowUp));
router.post('/update-follow', checkMicroAuth, catchError(updateFollowUp));
router.post('/complete-follow', checkMicroAuth, catchError(completeFollowUp));
router.post('/move-deal', checkMicroAuth, catchError(moveDeal));
router.post('/update-contact', checkMicroAuth, catchError(bulkUpdate));

module.exports = router;
