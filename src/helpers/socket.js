/**
 * Send Socket Notification
 * @param {*} message : Notification Message
 * @param {*} user : user id
 * @param {*} notification : notification object
 */
const sendSocketNotification = (message, user, notification) => {
  const group = user._id + '';
  if (message === 'clear_notification') {
    try {
      const emitter = global.emitter;
      emitter &&
        emitter.of('/application').to(group).emit(message, notification);
    } catch (_) {
      console.log('socket_notification_failed', _);
    }
    return;
  }
  if (message === 'notification') {
    const data = { ...notification };
    if (notification['user']) {
      delete data['user'];
    }
    if (notification.contact) {
      data.contact = {
        _id: notification.contact._id,
        first_name: notification.contact.first_name,
        last_name: notification.contact.last_name,
        cell_phone: notification.contact.cell_phone,
        email: notification.contact.email,
      };
    } else {
      data.contact = {
        first_name: 'Someone',
        last_name: '',
        activity: notification['activity'],
      };
    }
    try {
      const emitter = global.emitter;
      emitter && emitter.of('/application').to(group).emit(message, data);
    } catch (_) {
      console.log('socket_notification_failed', _);
    }
  } else if (
    message === 'load_notification' ||
    message === 'notification_created'
  ) {
    try {
      const emitter = global.emitter;
      emitter &&
        emitter.of('/application').to(group).emit(message, notification);
    } catch (_) {
      console.log('socket_notification_failed', _);
    }
  } else if (message === 'messageStatus') {
    try {
      const emitter = global.emitter;
      emitter &&
        emitter
          .of('/application')
          .to(group)
          .emit(message, { ...notification });
    } catch (_) {
      console.log('socket_notification_failed', _);
    }
  } else {
    try {
      const emitter = global.emitter;
      emitter && emitter.of('/application').to(group).emit('command', message);
    } catch (_) {
      console.log('socket_notification_failed', _);
    }
  }
};

const sendExtensionSocketSignal = (user, signal, data) => {
  const group = user._id + '';
  try {
    const emitter = global.emitter;
    emitter && emitter.of('/extension').to(group).emit(signal, data);
  } catch (_) {
    console.log('socket_notification_failed', _);
  }
};

module.exports = {
  sendSocketNotification,
  sendExtensionSocketSignal,
};
