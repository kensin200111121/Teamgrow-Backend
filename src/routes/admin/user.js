const express = require('express');

const { body } = require('express-validator');

const { checkAdminJwtAuth } = require('../../middleware/auth');
const {
  signUp,
  create,
  login,
  editMe,
  getProfile,
  getMe,
  getPaymentCards,
  getPaymentInfo,
  getGarbageAccesseToken,
  getUserStatistics,
  updateUser,
  checkDowngrade,
  disableUser,
  sleepUser,
  suspendUser,
  resumeUser,
  trialUser,
  enableLoginUser,
  pauseUser,
  renewUser,
  removeUser,
  updatePackageUser,
  proceedInvoiceUser,
  resetPassword,
  getUsers,
  getUsersAll,
  exportUsers,
  checkSmtp,
  getSubAccounts,
  searchNumbers,
  updateNumber,
} = require('../../controllers/admin/user');
const { catchError } = require('../../controllers/error');

const router = express.Router();

// SignUp
router.post(
  '/',
  [
    body('email').isEmail(),
    body('user_name')
      .isLength({ min: 3 })
      .withMessage('user_name must be at least 3 chars long'),
    // :TODO phone number regexp should be used
    body('cell_phone')
      .isLength({ min: 9 })
      .matches(/^[\+\d]?(?:[\d-.\s()]*)$/)
      .withMessage('cell_phone must be a valid phone number!'),
  ],
  catchError(signUp)
);

// Create a new user
router.post(
  '/create',
  [
    body('email').isEmail(),
    body('user_name')
      .isLength({ min: 3 })
      .withMessage('user_name must be at least 3 chars long'),
  ],
  catchError(create)
);

// Login
router.post(
  '/login',
  [
    body('email').optional().isLength({ min: 3 }),
    body('user_name').optional().isLength({ min: 3 }),
    body('password').isLength({ min: 1 }),
  ],
  catchError(login)
);

// Get own profile
router.get('/me', checkAdminJwtAuth, catchError(editMe));

// Edit own profile
router.put('/me', checkAdminJwtAuth, catchError(editMe));

// Get the Specific User Profile
router.get('/profile/:id', checkAdminJwtAuth, catchError(getProfile));
router.post('/search-number/:id', checkAdminJwtAuth, catchError(searchNumbers));
router.post('/update-number/:id', checkAdminJwtAuth, catchError(updateNumber));

// Get the Specific User Profile
router.get('/user-profile', checkAdminJwtAuth, catchError(getMe));

router.get('/user-cards', checkAdminJwtAuth, catchError(getPaymentCards));

router.get('/user-payment', checkAdminJwtAuth, catchError(getPaymentInfo));

router.get(
  '/user-garbagetoken',
  checkAdminJwtAuth,
  catchError(getGarbageAccesseToken)
);

router.get(
  '/user-statistics',
  checkAdminJwtAuth,
  catchError(getUserStatistics)
);

// Update User
router.put('/update-user/:id', checkAdminJwtAuth, catchError(updateUser));

// Get overflow plan status
router.post('/check-downgrade', checkAdminJwtAuth, catchError(checkDowngrade));

// Update User Profile
router.put('/update-user-profile', checkAdminJwtAuth, catchError(editMe));

// Set the Specific User Profile
router.post('/disable', checkAdminJwtAuth, catchError(disableUser));

// Set the Specific User Profile
router.post('/sleep', checkAdminJwtAuth, catchError(sleepUser));

// Set the Specific User Profile
router.post('/suspend', checkAdminJwtAuth, catchError(suspendUser));

router.post('/resume', checkAdminJwtAuth, catchError(resumeUser));

router.post('/trial', checkAdminJwtAuth, catchError(trialUser));

router.post('/enablelogin', checkAdminJwtAuth, catchError(enableLoginUser));

router.post('/pause', checkAdminJwtAuth, catchError(pauseUser));

router.post('/renew', checkAdminJwtAuth, catchError(renewUser));

router.post(
  '/update-package',
  checkAdminJwtAuth,
  catchError(updatePackageUser)
);

router.post(
  '/proceed-invoice',
  checkAdminJwtAuth,
  catchError(proceedInvoiceUser)
);

// Get the Specific User Profile
router.post('/delete', checkAdminJwtAuth, catchError(removeUser));

// New Password by old one
router.post('/reset-password', checkAdminJwtAuth, catchError(resetPassword));

// Get All  Users
router.post('/list', checkAdminJwtAuth, catchError(getUsers));
router.post('/all', checkAdminJwtAuth, catchError(getUsersAll));

router.post('/export-users', checkAdminJwtAuth, catchError(exportUsers));

router.post('/smtp-check/:user/:func/:field', catchError(checkSmtp));

// Get the Specific User Profile
router.get('/sub-accounts', checkAdminJwtAuth, catchError(getSubAccounts));

module.exports = router;
