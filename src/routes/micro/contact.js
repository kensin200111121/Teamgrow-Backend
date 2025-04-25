const express = require('express');

const { catchError } = require('../../controllers/error');
const { checkMicroAuth } = require('../../middleware/auth');
const { getTagsDetail } = require('../../controllers/tag');
const {
  create,
  bulkUpdate,
  shareContacts,
  getDetail,
} = require('../../controllers/contact');
const { bulkEmail, bulkText } = require('../../controllers/material');

const router = express.Router();

router.get('/export', checkMicroAuth, catchError(getTagsDetail));
router.post('/', checkMicroAuth, catchError(create));
router.put('/update', checkMicroAuth, catchError(bulkUpdate));
router.post('/bulk-email', checkMicroAuth, catchError(bulkEmail));
router.post('/bulk-text', checkMicroAuth, catchError(bulkText));
router.post('/share-contact', checkMicroAuth, catchError(shareContacts));
router.post('/get-detail/:id', checkMicroAuth, catchError(getDetail));

module.exports = router;
