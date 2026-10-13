import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getLocalIpAddresses } from './networkUtils.js';
import { GameRoom } from './gameRoom.js';
import type { ClientInputMsg, PlayerSlot } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = express();
const server = http.createServer(app);

// Use WebSocket transport only to avoid polling overhead
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket']
});

// Serve production client build if exists
const distPath = path.resolve(__dirname, '../../dist');
const distPathAlt = path.resolve(__dirname, '../dist');
const staticPath = fs.existsSync(distPath) ? distPath : (fs.existsSync(distPathAlt) ? distPathAlt : null);

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('<h1>VoxelPong 3D LAN Server is running</h1><p>Client build not found. Run Vite dev server for development.</p>');
  });
}

const gameRoom = new GameRoom(io);
const localIps = getLocalIpAddresses();
const primaryHostIp = localIps[0] || '127.0.0.1';
const hostUrl = `http://${primaryHostIp}:${PORT}`;

io.on('connection', (socket) => {
  // Immediately emit current room state
  socket.emit('s2c_room_state', gameRoom.getRoomState(hostUrl));

  // Automatically assign slot (P1 or P2)
  const assignedSlot = gameRoom.autoAssignSlotOnConnect(socket);
  socket.emit('s2c_assigned_slot', { slot: assignedSlot });
  gameRoom.broadcastRoomState(hostUrl);

  // Join room
  socket.on('c2s_join_room', (data: { playerName: string; slot?: PlayerSlot }) => {
    gameRoom.handleJoin(socket, data.playerName, data.slot, hostUrl);
  });

  // Ready toggle
  socket.on('c2s_ready', (data: { ready: boolean }) => {
    gameRoom.handleReady(socket, data.ready, hostUrl);
  });

  // High-frequency volatile player input (60Hz)
  socket.on('c2s_input', (input: ClientInputMsg) => {
    gameRoom.handleInput(socket, input);
  });

  // Serve action (toss ball)
  socket.on('c2s_serve_action', () => {
    gameRoom.handleServeAction(socket);
  });

  // Pause toggle (Esc)
  socket.on('c2s_pause_toggle', () => {
    gameRoom.handlePauseToggle(socket);
  });

  // Rematch request
  socket.on('c2s_rematch', () => {
    gameRoom.handleRematch(socket, hostUrl);
  });

  // Low-latency clock sync & ping
  socket.on('c2s_ping', (data: { clientTime: number }) => {
    socket.emit('s2c_pong', {
      clientTime: data.clientTime,
      serverTime: Date.now()
    });
  });

  socket.on('disconnect', () => {
    gameRoom.handleDisconnect(socket, hostUrl);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================================');
  console.log('  VOXELPONG 3D LAN - SERVER RUNNING');
  console.log('========================================================');
  console.log(`  Local URL:        http://localhost:${PORT}`);
  for (const ip of localIps) {
    console.log(`  LAN URL (Guest):  http://${ip}:${PORT}`);
  }
  console.log('========================================================');
});
