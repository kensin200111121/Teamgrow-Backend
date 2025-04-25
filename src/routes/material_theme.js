const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const MaterialThemeCtrl = require('../controllers/material_theme');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/', checkAppJwtAuth, catchError(MaterialThemeCtrl.getAll));

router.get(
  '/newsletters',
  checkAppJwtAuth,
  catchError(MaterialThemeCtrl.getNewsletters)
);

router.get('/:id', checkAppJwtAuth, catchError(MaterialThemeCtrl.get));

router.post(
  '/set-video',
  checkAppJwtAuth,
  catchError(MaterialThemeCtrl.setVideo)
);

router.post(
  '/get-templates',
  checkAppJwtAuth,
  catchError(MaterialThemeCtrl.getTemplates)
);

router.post('/', checkAppJwtAuth, catchError(MaterialThemeCtrl.create));

router.post(
  '/get-template',
  checkAppJwtAuth,
  catchError(MaterialThemeCtrl.getTemplate)
);

router.put('/:id', checkAppJwtAuth, catchError(MaterialThemeCtrl.update));

router.delete('/:id', checkAppJwtAuth, catchError(MaterialThemeCtrl.remove));

router.post(
  '/bulk-remove',
  checkAppJwtAuth,
  catchError(MaterialThemeCtrl.bulkRemove)
);

router.get('/load-own', checkAppJwtAuth, catchError(MaterialThemeCtrl.load));

module.exports = router;
