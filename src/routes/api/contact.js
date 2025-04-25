const express = require('express');

const { checkApiJwtAuth, checkSuspended } = require('../../middleware/auth');
const { catchError } = require('../../controllers/error');
const DeveloperCtrl = require('../../controllers/developer');
const ContactCtrl = require('../../controllers/contact');

const router = express.Router();

router.post(
  '/',
  checkApiJwtAuth,
  checkSuspended,
  DeveloperCtrl.preprocessRequest,
  catchError(ContactCtrl.create)
);
router.get('/', checkApiJwtAuth, catchError(DeveloperCtrl.getContact));
router.put(
  '/',
  checkApiJwtAuth,
  DeveloperCtrl.preprocessRequest,
  DeveloperCtrl.searchContact,
  catchError(ContactCtrl.update)
);
router.post(
  '/tag',
  checkApiJwtAuth,
  DeveloperCtrl.preprocessRequest,
  catchError(DeveloperCtrl.addNewTag)
);

module.exports = router;
