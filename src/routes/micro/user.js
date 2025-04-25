const express = require('express');
const { body } = require('express-validator');

const { catchError } = require('../../controllers/error');
const {
  updatePackage,
  suspendUser,
  reactivateUser,
} = require('../../controllers/micro/user');
const { create, editMe } = require('../../controllers/user');
const { checkMicroRequest, checkMicroAuth } = require('../../middleware/auth');

const router = express.Router();

router.post(
  '/create',
  [
    body('email').isEmail(),
    body('user_name')
      .isLength({ min: 3 })
      .withMessage('user_name must be at least 3 chars long'),
    // password must be at least 5 chars long
    body('cell_phone')
      .isLength({ min: 9 })
      .matches(/^[\+\d]?(?:[\d-.\s()]*)$/)
      .withMessage('cell_phone must be a valid phone number!'),
  ],
  checkMicroRequest,
  catchError(create)
);

router.post('/update-package', checkMicroAuth, catchError(updatePackage));

router.post('/cancel-account', checkMicroAuth, catchError(suspendUser));

router.post('/reactivate-account', checkMicroAuth, catchError(reactivateUser));

router.put('/', checkMicroAuth, catchError(editMe));

module.exports = router;
