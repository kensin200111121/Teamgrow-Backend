const express = require('express');
const { body, query } = require('express-validator');
const UserCtrl = require('../controllers/user');
const {
  checkAppJwtAuth,
  checkApiJwtAuth,
  checkUser,
  checkAuthExtension,
  checkAuthGuest,
  checkLastLogin,
  checkUserDisabled,
  checkSuspended,
  checkSignUpEmail,
  checkBlackEmail,
} = require('../middleware/auth');
const { catchError } = require('../controllers/error');

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const mime = require('mime-types');
const api = require('../configs/api');
const cors = require('cors');
const { generateCorsOptions, checkOrigin } = require('../middleware/cors');

const {
  LANDING_WHITELIST,
  RECORDER_WHITELIST,
  SPECIAL_WHITELIST,
  FRONT_WHITELIST,
  EXTENSION_WHITELIST,
  UCRAFT_WHITELIST,
} = require('../constants/cors');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const bucketStorage = multerS3({
  s3,
  bucket: api.AWS.AWS_S3_BUCKET_NAME,
  acl: 'public-read',
  key: (req, file, cb) => {
    const fileKey =
      'avatar/' + req.currentUser._id + '.' + mime.extension(file.mimetype);
    cb(null, fileKey);
  },
});
const s3Upload = multer({
  storage: bucketStorage,
});

const router = express.Router();

// SignUp
router.post(
  '/',
  [
    body('email').isEmail(),
    body('user_name')
      .isLength({ min: 3 })
      .withMessage('user_name must be at least 3 chars long'),
    // password must be at least 5 chars long
    body('password')
      .isLength({ min: 5 })
      .withMessage('password must be at least 5 chars long'),
    // :TODO phone number regexp should be used
    body('cell_phone')
      .isLength({ min: 9 })
      .matches(/^[\+\d]?(?:[\d-.\s()]*)$/)
      .withMessage('cell_phone must be a valid phone number!'),
  ],
  checkSignUpEmail,
  checkBlackEmail,
  catchError(UserCtrl.signUp)
);

// router.post(
//   '/signup-mobile',
//   [
//     body('email').isEmail(),
//     body('user_name')
//       .isLength({ min: 3 })
//       .withMessage('user_name must be at least 3 chars long'),
//     // password must be at least 5 chars long
//     body('password')
//       .isLength({ min: 5 })
//       .withMessage('password must be at least 5 chars long'),
//     // :TODO phone number regexp should be used
//     body('cell_phone')
//       .isLength({ min: 9 })
//       .matches(/^[\+\d]?(?:[\d-.\s()]*)$/)
//       .withMessage('cell_phone must be a valid phone number!'),
//   ],
//   catchError(UserCtrl.signUpMobile)
// );

// // SignUp
// router.post(
//   '/extension-signup',
//   [
//     body('email').isEmail(),
//     body('user_name')
//       .isLength({ min: 3 })
//       .withMessage('user_name must be at least 3 chars long'),
//     // password must be at least 5 chars long
//     body('password')
//       .isLength({ min: 5 })
//       .withMessage('password must be at least 5 chars long'),
//     // :TODO phone number regexp should be used
//   ],
//   cors(generateCorsOptions(EXTENSION_WHITELIST)),
//   catchError(UserCtrl.extensionSignup)
// );

// Login
router.post(
  '/login',
  [
    body('email').optional().isLength({ min: 3 }),
    body('user_name').optional().isLength({ min: 3 }),
    body('password').isLength({ min: 1 }),
  ],
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  catchError(UserCtrl.login)
);

router.post(
  '/check',
  cors(generateCorsOptions(SPECIAL_WHITELIST)),
  catchError(checkUser)
);

router.post('/logout', checkAppJwtAuth, catchError(UserCtrl.logout));

// Edit own profile
router.get(
  '/convrrt/me',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkApiJwtAuth,
  catchError(UserCtrl.getMyInfo)
);
router.get(
  '/ucraft/me',
  cors(generateCorsOptions(UCRAFT_WHITELIST)),
  checkOrigin,
  checkApiJwtAuth,
  catchError(UserCtrl.getMyInfo2Ucraft)
);
router.get(
  '/me',
  cors(generateCorsOptions(RECORDER_WHITELIST)),
  checkAuthExtension,
  catchError(UserCtrl.getMe)
);
router.get(
  '/access',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(checkLastLogin),
  (_, res) => {
    res.send({
      status: true,
    });
  }
);
router.get(
  '/statistics',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.getUserStatistics)
);

// Edit own profile
router.put(
  '/me',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  checkAuthGuest,
  s3Upload.single('avatar'),
  catchError(UserCtrl.editMe)
);

router.put(
  '/firebase-token',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAuthGuest,
  catchError(UserCtrl.updateFirebaseToken)
);

router.get(
  '/add-nick',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.addNick)
);

// New Password by old one
router.post(
  '/new-password',
  checkAppJwtAuth,
  [
    body('old_password').isLength({ min: 5 }),
    body('new_password').isLength({ min: 5 }),
  ],
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.resetPasswordByOld)
);

router.post(
  '/create-password',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.createPassword)
);

// Forgot password
router.post(
  '/forgot-password',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.forgotPassword)
);

// Rest own profile
router.post(
  '/reset-password',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.resetPasswordByCode)
);

router.post(
  '/sync-social',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.generateSyncSocialLink)
);

// Synchronize with outlook email
router.get(
  '/sync-outlook',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncOutlook)
);

// Synchronize with gmail
router.get(
  '/sync-gmail',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncGmail)
);

// Disconnect with gmail
router.post(
  '/discon-email',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.disconnectEmail)
);

// Synchronize with yahoo
router.get(
  '/sync-yahoo',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncYahoo)
);

// Outlook Email authorization
router.get(
  '/authorize-outlook',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeOutlook)
);

// Synchorinze other mailer
router.post(
  '/authorize-mailer',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeOtherEmailer)
);

// Gmail authorized
router.get(
  '/authorize-gmail',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeGmail)
);

// Yahoo authorized
router.get(
  '/authorize-yahoo',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeYahoo)
);

// Zoom authorized
router.get(
  '/authorize-zoom',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeZoom)
);

// Zoom authorized
router.get(
  '/sync-zoom/:source',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncZoom)
);

/**
 * Calendar
 */

// Synchronize calendar with connected outlook email
router.get(
  '/sync-google-calendar',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncGoogleCalendar)
);

// Synchronize calendar with connected outlook email
router.get(
  '/sync-outlook-calendar',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncOutlookCalendar)
);

// Synchronize calendar with connected outlook email
router.get(
  '/authorize-google-calendar',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeGoogleCalendar)
);

// Synchronize calendar with connected outlook email
router.get(
  '/authorize-outlook-calendar',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeOutlookCalendar)
);

// Daily Report
router.get(
  '/daily-report',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.dailyReport)
);

// Disconnect Daily Report
router.get(
  '/discon-daily',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.disconDaily)
);

// Daily Report
router.get(
  '/weekly-report',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.weeklyReport)
);

// Disconnect Weekly Report
router.get(
  '/discon-weekly',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.disconWeekly)
);

// Desktop Notification
router.post(
  '/desktop-notification',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.desktopNotification)
);

// Text Notification
router.get(
  '/text-notification',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.textNotification)
);

// Disconnect Google Calendar
router.post(
  '/discon-calendar',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.disconnectCalendar)
);

// Signup Gmail
router.get(
  '/signup-gmail',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.signUpGmail)
);

// Signup Outlook
router.get(
  '/signup-outlook',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.signUpOutlook)
);

// Social google profile
router.get(
  '/social-gmail',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.socialGmail)
);

// Edit outlook profile
router.get(
  '/social-outlook',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.socialOutlook)
);

// Edit own profile
router.post(
  '/social-login',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.socialLogin)
);

// Social signup
router.post(
  '/social-signup',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkBlackEmail,
  catchError(UserCtrl.socialSignUp)
);

// // Social signup mobile
// router.post(
//   '/social-signup-mobile',
//   cors(generateCorsOptions(FRONT_WHITELIST)),
//   catchError(UserCtrl.socialSignUpMobile)
// );

// // Social extrension signup
// router.post(
//   '/social-signup',
//   cors(generateCorsOptions(FRONT_WHITELIST)),
//   catchError(UserCtrl.socialExtensionSignup)
// );

router.get(
  '/app-google-signin',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.appGoogleSignIn)
);

router.get(
  '/app-outlook-signin',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.appOutlookSignIn)
);

router.get(
  '/wavv_id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.getWavvID)
);

// Extension login
router.post(
  '/extension-login',
  cors(generateCorsOptions(EXTENSION_WHITELIST)),
  catchError(UserCtrl.extensionLogin)
);

// Extension social profile
router.post(
  '/social-extension-login',
  catchError(UserCtrl.socialExtensionLogin)
);

router.post(
  '/extension-upgrade',
  cors(generateCorsOptions(LANDING_WHITELIST)),
  checkAuthExtension,
  catchError(UserCtrl.extensionUpgrade)
);

router.post(
  '/extension-upgrade-web',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAuthExtension,
  catchError(UserCtrl.extensionUpgradeWeb)
);

// Connect Another Email Service
router.get(
  '/another-con',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.connectAnotherEmail)
);

// Search user email
router.post(
  '/search-email',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.searchUserEmail)
);

// Search nickname
router.post(
  '/search-nickname',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  catchError(UserCtrl.searchNickName)
);

// Search Phonenumber
router.post(
  '/search-phone',
  cors(generateCorsOptions(SPECIAL_WHITELIST)),
  catchError(UserCtrl.searchPhone)
);

// update package
router.post(
  '/update-package',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkUserDisabled,
  catchError(UserCtrl.updatePackage)
);

// Schedule a paid demo
router.get(
  '/schedule-demo',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.schedulePaidDemo)
);

// Schedule a paid demo
router.get(
  '/scheduled-demo',
  checkAppJwtAuth,
  catchError(UserCtrl.scheduledPaidDemo)
);

router.get('/push-notification/:id', catchError(UserCtrl.pushNotification));

// Cancel account
router.post(
  '/cancel-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.disableAccount)
);

router.get(
  '/sleep-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.sleepAccount)
);

router.get('/get-call-token', UserCtrl.getCallToken);

router.get(
  '/easy-sub-accounts',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.easyLoadSubAccounts)
);

// Get sub accounts
router.get(
  '/sub-accounts',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.getSubAccounts)
);

// router.post(
//   '/sub-account',
//   checkAppJwtAuth,
//   catchError(UserCtrl.createSubAccount)
// );

router.get(
  '/builder-token',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.generateBuilderToken)
);

router.put(
  '/sub-account/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.editSubAccount)
);

router.delete(
  '/sub-account/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.removeSubAccount)
);

router.post(
  '/switch-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.switchAccount)
);

router.post(
  '/recall-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.recallSubAccount)
);

// router.post(
//   '/buy-account',
//   checkAppJwtAuth,
//   catchError(UserCtrl.buySubAccount)
// );

router.post(
  '/new-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkUserDisabled,
  catchError(UserCtrl.newSubAccount)
);

router.post(
  '/resume',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.resumeAccount)
);

router.post(
  '/renew',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.renewAccount)
);

router.get(
  '/list-meeting',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.listMeetings)
);

router.get(
  '/sync-google-contact',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncGoogleContact)
);

router.get(
  '/auth-google-contact',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authGoogleContact)
);

router.get(
  '/team-info',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.getTeamInfo)
);

router.post(
  '/reports',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.reports)
);

// Edit own profile
router.get(
  '/:id',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.getUser)
);

// Get overflow plan status
router.post(
  '/check-downgrade',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.checkDowngrade)
);

router.put(
  '/update-draft',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.updateDraft)
);

router.post(
  '/sync-smtp',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.syncSMTP)
);

router.post(
  '/authorize-smtp',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  checkSuspended,
  catchError(UserCtrl.authorizeSMTP)
);

router.post(
  '/authorize-smtp-code',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.authorizeSMTPCode)
);
router.post(
  '/contact_us',
  cors(generateCorsOptions(LANDING_WHITELIST)),
  catchError(UserCtrl.contactUs)
);
router.post(
  '/disable_request',
  cors(generateCorsOptions(LANDING_WHITELIST)),
  catchError(UserCtrl.disableRequest)
);

router.post(
  '/create-alias',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.createEmailAlias)
);

router.post(
  '/edit-alias',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.updateEmailAlias)
);

router.post(
  '/add-payment-sub-account',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.onAddedPaymentToSubAccount)
);

router.post(
  '/update-my-link',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.onUpdateMyLink)
);

router.post(
  '/verify-connection-status',
  cors(generateCorsOptions(FRONT_WHITELIST)),
  checkAppJwtAuth,
  catchError(UserCtrl.verifyConnectionStatus)
);

module.exports = router;
