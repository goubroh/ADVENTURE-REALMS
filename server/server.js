import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 5000,
  pingTimeout: 10000
});

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;

const players = {};

const COLOR_PALETTE = [
  0xff5555, 0x55ff88, 0x5599ff, 0xffaa33,
  0xaa55ff, 0xff55aa, 0x55ffee, 0xffee55
];

function getRandomColor() {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

function sanitizeString(input, maxLength) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>]/g, '').trim().slice(0, maxLength);
}

app.get('/', function (req, res) {
  res.send('Adventure Realms Server is running. Active players: ' + Object.keys(players).length);
});

app.get('/health', function (req, res) {
  res.json({ status: 'ok', players: Object.keys(players).length, uptime: process.uptime() });
});

io.on('connection', function (socket) {
  console.log('[CONNECT] ' + socket.id);

  socket.on('playerJoin', function (data) {
    const rawUsername = data && data.username ? data.username : '';
    const username = sanitizeString(rawUsername, 16) || ('Guest' + socket.id.slice(0, 4));

    players[socket.id] = {
      id: socket.id,
      username: username,
      position: { x: 0, y: 2, z: 0 },
      rotation: 0,
      animState: 'idle',
      color: getRandomColor()
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('playerJoined', players[socket.id]);
    io.emit('onlineCount', Object.keys(players).length);

    console.log('[JOIN] ' + username + ' (' + socket.id + ')');
  });

  socket.on('playerUpdate', function (data) {
    const player = players[socket.id];
    if (!player || !data) return;

    if (data.position &&
        typeof data.position.x === 'number' &&
        typeof data.position.y === 'number' &&
        typeof data.position.z === 'number') {
      player.position = {
        x: data.position.x,
        y: data.position.y,
        z: data.position.z
      };
    }

    if (typeof data.rotation === 'number') {
      player.rotation = data.rotation;
    }

    if (typeof data.animState === 'string') {
      player.animState = sanitizeString(data.animState, 20);
    }
  });

  socket.on('chatMessage', function (msg) {
    const player = players[socket.id];
    if (!player) return;

    const cleanMsg = sanitizeString(msg, 200);
    if (!cleanMsg) return;

    io.emit('chatMessage', {
      username: player.username,
      message: cleanMsg,
      id: socket.id,
      timestamp: Date.now()
    });
  });

  socket.on('ping', function (clientTime) {
    socket.emit('pong', clientTime);
  });

  socket.on('disconnect', function () {
    const player = players[socket.id];
    if (player) {
      console.log('[DISCONNECT] ' + player.username + ' (' + socket.id + ')');
    }
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    io.emit('onlineCount', Object.keys(players).length);
  });
});

setInterval(function () {
  if (Object.keys(players).length > 0) {
    io.emit('playersUpdate', players);
  }
}, TICK_MS);

server.listen(PORT, function () {
  console.log('Adventure Realms server listening on http://localhost:' + PORT);
});
