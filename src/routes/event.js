const express = require('express');

const { checkApiCryptoAuth } = require('../middleware/auth');
const {
  receiveLeadEvent,
  loadLeadEvents,
  getLeadEventDetail,
  setFilter,
} = require('../controllers/event');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/lead', checkApiCryptoAuth, catchError(receiveLeadEvent));

router.get('/lead', checkApiCryptoAuth, catchError(loadLeadEvents));

router.get('/start', checkApiCryptoAuth, catchError(setFilter));

router.get('/lead/:id', checkApiCryptoAuth, catchError(getLeadEventDetail));

module.exports = router;
