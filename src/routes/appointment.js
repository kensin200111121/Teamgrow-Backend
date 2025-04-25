const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const AppointmentCtrl = require('../controllers/appointment');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AppointmentCtrl.create)
);

router.get('/', checkAppJwtAuth, catchError(AppointmentCtrl.getAll));

// Update appointment by id
router.put(
  '/:id',
  checkAppJwtAuth,
  checkSuspended,
  catchError(AppointmentCtrl.edit)
);

// Update appointment by id
router.post('/accept', checkAppJwtAuth, catchError(AppointmentCtrl.accept));

// Update appointment by id
router.post('/decline', checkAppJwtAuth, catchError(AppointmentCtrl.decline));

// Get calendar list
// eslint-disable-next-line prettier/prettier
router.get(
  '/calendar',
  checkAppJwtAuth,
  catchError(AppointmentCtrl.getCalendarList)
);

router.post(
  '/detail',
  checkAppJwtAuth,
  catchError(AppointmentCtrl.getEventById)
);

// Remove contact and its all related info (activity, followup) by id
router.post('/delete', checkAppJwtAuth, catchError(AppointmentCtrl.remove));

// Remove contact from appointment
router.post(
  '/delete-contact',
  checkAppJwtAuth,
  catchError(AppointmentCtrl.removeContact)
);

router.get('/:id', checkAppJwtAuth, catchError(AppointmentCtrl.get));

router.post(
  '/get-appointments',
  checkAppJwtAuth,
  catchError(AppointmentCtrl.getAppointments)
);
module.exports = router;
