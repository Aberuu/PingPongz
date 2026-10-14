import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getLocalIpAddresses } from './networkUtils.js';
import { GameRoom } from './gameRoom.js';
import type { ClientInputMsg, PlayerSlot, GameMode, BotDifficulty, PracticeZone } from '../shared/types.js';

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
// On cloud hosts (e.g. Railway) use the public domain instead of the internal container IP
const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
const hostUrl = publicDomain ? `https://${publicDomain}` : `http://${primaryHostIp}:${PORT}`;
gameRoom.hostAddress = hostUrl;

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

  // Game Mode & AI / Practice Configuration
  socket.on('c2s_set_mode', (data: { mode: GameMode; botDifficulty?: BotDifficulty; practiceZone?: PracticeZone }) => {
    gameRoom.handleSetMode(data.mode, data.botDifficulty, data.practiceZone, hostUrl);
  });

  socket.on('c2s_set_practice_zone', (data: { zone: PracticeZone }) => {
    gameRoom.handleSetPracticeZone(data.zone, hostUrl);
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
  socket.on('c2s_rematch', (data?: { slot?: PlayerSlot }) => {
    gameRoom.handleRematch(socket, data, hostUrl);
  });

  // Quit back to lobby request
  socket.on('c2s_quit_to_lobby', () => {
    gameRoom.handleQuitToLobby(hostUrl);
  });

  // Live in-game chat message
  socket.on('c2s_chat_message', (data: { text: string; isQuickChat?: boolean }) => {
    gameRoom.handleChatMessage(socket, data);
  });

  // Typing status indicator
  socket.on('c2s_typing', (data: { isTyping: boolean }) => {
    gameRoom.handleTypingStatus(socket, data?.isTyping);
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
  if (publicDomain) {
    console.log(`  Public URL:       ${hostUrl}`);
  }
  console.log('========================================================');
});
