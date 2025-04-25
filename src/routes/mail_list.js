const express = require('express');

const { checkAppJwtAuth, checkSuspended } = require('../middleware/auth');
const MailListCtrl = require('../controllers/mail_list');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  checkAppJwtAuth,
  checkSuspended,
  catchError(MailListCtrl.create)
);

router.post(
  '/add-contacts',
  checkAppJwtAuth,
  checkSuspended,
  catchError(MailListCtrl.addContacts)
);

router.post(
  '/remove-contacts',
  checkAppJwtAuth,
  catchError(MailListCtrl.removeContacts)
);
router.post(
  '/move-top',
  checkAppJwtAuth,
  catchError(MailListCtrl.moveTopContacts)
);
router.get('/', checkAppJwtAuth, catchError(MailListCtrl.getAll));
router.get('/:id', checkAppJwtAuth, catchError(MailListCtrl.get));

router.delete(
  '/:id',
  checkAppJwtAuth,
  checkSuspended,
  catchError(MailListCtrl.remove)
);
router.post('/delete', checkAppJwtAuth, catchError(MailListCtrl.bulkRemove));
router.put('/:id', checkAppJwtAuth, catchError(MailListCtrl.update));
router.post('/contacts', checkAppJwtAuth, catchError(MailListCtrl.getContacts));
router.post(
  '/get-all',
  checkAppJwtAuth,
  catchError(MailListCtrl.getAllContacts)
);
module.exports = router;
