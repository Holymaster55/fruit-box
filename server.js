const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const rooms = {}; // Stores rooms and their data
const highscoreMap = {}; // Stores highscores

// Function to generate a solvable grid
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

// Handle new socket connections
io.on('connection', (socket) => {
  console.log(`🟢 Connected: ${socket.id}`);

  // Join a room
  socket.on('join', ({ roomCode, nickname }) => {
    socket.join(roomCode);

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        grid: generateSolvableGrid(),
      };
    }

    rooms[roomCode].players.push({ id: socket.id, nickname, ready: false });
    io.to(roomCode).emit('players', rooms[roomCode].players);
    console.log(`👤 ${nickname} joined room ${roomCode}`);
  });

  // Handle ready button for multiplayer
  socket.on('ready', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.ready = true;

    const allReady = room.players.length > 1 && room.players.every(p => p.ready);
    if (allReady) {
      console.log(`🚀 All players in room ${roomCode} are ready. Starting game.`);
      io.to(roomCode).emit('startGame', { grid: room.grid });
    }
  });

  // Handle score updates in multiplayer mode
  socket.on('scoreUpdate', ({ roomCode, nickname, score }) => {
    socket.to(roomCode).emit('scoreUpdate', { nickname, score });
  });

  // Disconnect socket handling
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

  // Highscore tracking
  socket.on('highscore', ({ nickname, score }) => {
    if (!nickname || typeof score !== 'number') return;

    if (!highscoreMap[nickname] || score > highscoreMap[nickname]) {
      highscoreMap[nickname] = score;
    }

    io.emit('updateLeaderboard', Object.entries(highscoreMap).map(([nickname, score]) => ({ nickname, score })).sort((a, b) => b.score - a.score).slice(0, 20));
  });

  // Handle get leaderboard
  socket.on('getLeaderboard', () => {
    const leaderboard = Object.entries(highscoreMap)
      .map(([nickname, score]) => ({ nickname, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    socket.emit('updateLeaderboard', leaderboard);
  });
});

// Serve the game files and assets
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌍 Server running at http://localhost:${PORT}`);
});
