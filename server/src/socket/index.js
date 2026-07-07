import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;
const online = new Map(); // userId -> Set of socketIds

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || '*', credentials: true },
  });

  // Authenticate sockets with the same JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.userId;
    if (!online.has(uid)) online.set(uid, new Set());
    online.get(uid).add(socket.id);
    socket.join(uid); // personal room
    broadcastPresence();

    socket.on('disconnect', () => {
      const set = online.get(uid);
      if (set) {
        set.delete(socket.id);
        if (!set.size) online.delete(uid);
      }
      broadcastPresence();
    });
  });

  return io;
}

function broadcastPresence() {
  if (io) io.emit('presence', { online: [...online.keys()] });
}

export function emitToUser(userId, event, payload) {
  if (io) io.to(String(userId)).emit(event, payload);
}

export function getOnlineUsers() {
  return [...online.keys()];
}
