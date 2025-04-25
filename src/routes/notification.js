const express = require('express');

const { checkAppJwtAuth } = require('../middleware/auth');
const NotificationCtrl = require('../controllers/notification');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get(
  '/system-notification',
  checkAppJwtAuth,
  catchError(NotificationCtrl.getSystemNotification)
);
router.get('/', checkAppJwtAuth, catchError(NotificationCtrl.get));
router.get(
  '/get-delivery',
  checkAppJwtAuth,
  catchError(NotificationCtrl.getDelivery)
);
// This endpoint is used for the call report dialer notification creation
router.post(
  '/',
  checkAppJwtAuth,
  catchError(NotificationCtrl.createNotificationRecord)
);
router.post(
  '/bulk-read',
  checkAppJwtAuth,
  catchError(NotificationCtrl.bulkRead)
);
router.post(
  '/bulk-unread',
  checkAppJwtAuth,
  catchError(NotificationCtrl.bulkUnread)
);
router.post(
  '/bulk-remove',
  checkAppJwtAuth,
  catchError(NotificationCtrl.bulkRemove)
);

router.post(
  '/queue-task',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadQueueTask)
);

router.post(
  '/remove-email-task',
  checkAppJwtAuth,
  catchError(NotificationCtrl.removeEmailTask)
);

router.post(
  '/remove-email-contact',
  checkAppJwtAuth,
  catchError(NotificationCtrl.removeEmailContact)
);

router.post(
  '/load-queue-contact',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadEmailQueueContacts)
);

router.post(
  '/load-task-contact',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadEmailTaskContacts)
);

router.get(
  '/list/:page',
  checkAppJwtAuth,
  catchError(NotificationCtrl.getPage)
);
router.get('/load/all', checkAppJwtAuth, catchError(NotificationCtrl.getAll));

router.get(
  '/load/:skip',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadNotifications)
);

router.get('/status', checkAppJwtAuth, catchError(NotificationCtrl.getStatus));

router.get(
  '/check-task-count',
  checkAppJwtAuth,
  catchError(NotificationCtrl.checkTaskCount)
);

router.get(
  '/queue/texts',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadTextQueues)
);

router.get(
  '/queue/emails',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadEmailQueues)
);

router.get(
  '/queue/automations',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadAutomationQueues)
);

router.put(
  '/update-task/:id',
  checkAppJwtAuth,
  catchError(NotificationCtrl.updateTaskQueue)
);

router.post(
  '/reschedule-task',
  checkAppJwtAuth,
  catchError(NotificationCtrl.rescheduleTaskQueue)
);

router.post(
  '/update-task-status',
  checkAppJwtAuth,
  catchError(NotificationCtrl.updateTaskQueueStatus)
);

router.get(
  '/unread-texts',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadUnreadTexts)
);

router.get(
  '/all-tasks',
  checkAppJwtAuth,
  catchError(NotificationCtrl.loadTasks)
);

router.get(
  '/remove-task/:id',
  checkAppJwtAuth,
  catchError(NotificationCtrl.removeTask)
);

router.get(
  '/unread-text-notification-status',
  checkAppJwtAuth,
  catchError(NotificationCtrl.unreadTextNotificationStatus)
);

router.post(
  '/test',
  checkAppJwtAuth,
  catchError(NotificationCtrl.sendTestNotification)
);

module.exports = router;
