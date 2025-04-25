const socketIO = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const { Emitter } = require('@socket.io/redis-emitter');
const { setupTracking } = require('../src/controllers/tracker');
const { setupRecording } = require('../src/controllers/video');
const { setupExtension } = require('../src/controllers/extension');
const { setupNotification } = require('../src/helpers/notification');
const { REDIS_ENDPOINT } = require('../src/configs/redis');
const urls = require('../src/constants/urls');
const { server } = require('./http');

const io = socketIO(server, {
  cors: {
    origin: urls.SOCKET_ORIGINS,
  },
});

const pubClient = createClient({ url: `redis://${REDIS_ENDPOINT}:6379` });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
global.emitter = new Emitter(pubClient);

module.exports.ioObject = io;
pubClient.on('error', (err) => {
  console.log('pubconnection:', err.message);
});

subClient.on('error', (err) => {
  // console.log('subconnection:', err.message);
});
Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    console.log('pub client is connected');
    io.adapter(createAdapter(pubClient, subClient));
    setupTracking(io);
    setupRecording(io);
    setupExtension(io.of('/extension'));
    setupNotification(io.of('/application'));
  })
  .catch((_) => {
    console.log('failed', _);
  });
