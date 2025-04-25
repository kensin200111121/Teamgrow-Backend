const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const EventTypeCtrl = require('../controllers/event_type');
const SchedulerEventCtrl = require('../controllers/scheduler_event');
const { catchError } = require('../controllers/error');

const router = express.Router();

const cors = require('cors');
const { generateCorsOptions } = require('../middleware/cors');
const { FRONT_WHITELIST, CALENDAR_WHITELIST } = require('../constants/cors');

router.post(
  '/event-type',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(EventTypeCtrl.create)
);
router.get(
  '/event-type',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(EventTypeCtrl.getAll)
);

router.get(
  '/event-type/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(EventTypeCtrl.get)
);

router.put(
  '/event-type/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(EventTypeCtrl.update)
);

router.delete(
  '/event-type/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(EventTypeCtrl.remove)
);

router.post(
  '/search-link',
  cors(generateCorsOptions(CALENDAR_WHITELIST)),
  catchError(EventTypeCtrl.searchByLink)
);
router.post(
  '/scheduler-event',
  cors(generateCorsOptions(CALENDAR_WHITELIST)),
  catchError(SchedulerEventCtrl.create)
);
router.post(
  '/load-conflicts',
  cors(generateCorsOptions(CALENDAR_WHITELIST)),
  catchError(SchedulerEventCtrl.loadConflicts)
);

router.post(
  '/load-events',
  cors(generateCorsOptions(CALENDAR_WHITELIST)),
  catchError(SchedulerEventCtrl.loadEvents)
);

module.exports = router;
