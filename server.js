const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateSolvableGrid() {
  const COLS = 17;
  const ROWS = 10;
  const SIZE = COLS * ROWS;
  let nums = [];
  for (let i = 1; i < 10; i++) {
    for (let j = 0; j < SIZE / 2 / 9; j++) {
      nums.push(i, 10 - i);
    }
  }
  while (nums.length < SIZE) nums.push(5, 5);
  nums = nums.sort(() => Math.random() - 0.5);

  const grid = [];
  for (let y = 0; y < ROWS; y++) {
    grid[y] = [];
    for (let x = 0; x < COLS; x++) {
      grid[y][x] = nums.pop();
    }
  }
  return grid;
}

io.on('connection', (socket) => {
  console.log(`🟢 Connected: ${socket.id}`);

  socket.on('join', ({ roomCode, nickname }) => {
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        grid: generateSolvableGrid()
      };
    }

    rooms[roomCode].players.push({ id: socket.id, nickname, ready: false });
    console.log(`👤 ${nickname} joined room ${roomCode}`);
    io.to(roomCode).emit('players', rooms[roomCode].players);
  });

  socket.on('ready', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = true;
      console.log(`✅ ${player.nickname} is ready in room ${roomCode}`);
    }

    const readyStates = room.players.map(p => `${p.nickname}: ${p.ready}`).join(', ');
    console.log(`📋 Ready check in room ${roomCode}: ${readyStates}`);

    const allReady = room.players.length > 1 && room.players.every(p => p.ready);
    if (allReady) {
      console.log(`🚀 All players in room ${roomCode} are ready. Starting game.`);
      io.to(roomCode).emit('startGame', { grid: room.grid });
    }
  });

  socket.on('scoreUpdate', ({ roomCode, nickname, score }) => {
    socket.to(roomCode).emit('scoreUpdate', { nickname, score });
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (!room) continue;

      room.players = room.players.filter(p => p.id !== socket.id);
      io.to(roomCode).emit('players', room.players);

      if (room.players.length === 0) {
        delete rooms[roomCode];
        console.log(`🧹 Cleaned up empty room: ${roomCode}`);
      }
    }
    console.log(`🔴 Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌍 Server running at http://localhost:${PORT}`);
});
