// server.js (CommonJS) — простой signalling server для WebRTC
const express = require('express');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const http = createServer(app);

// static folder
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true }));

// socket.io
const io = new Server(http, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('join-room', (room, role) => {
    try {
      socket.join(room);
      socket.data.room = room;
      socket.data.role = role;
      // notify others in room that someone joined
      socket.to(room).emit('peer-joined', { id: socket.id, role });
      console.log(`${socket.id} joined ${room} as ${role}`);
    } catch (e) {
      console.error('join-room error', e);
    }
  });

  socket.on('offer', (payload) => {
    // { to?, room?, sdp }
    try {
      if (payload.to) {
        io.to(payload.to).emit('offer', { from: socket.id, sdp: payload.sdp });
      } else if (payload.room) {
        socket.to(payload.room).emit('offer', { from: socket.id, sdp: payload.sdp });
      }
    } catch (e) { console.error('offer relay error', e); }
  });

  socket.on('answer', (payload) => {
    // { to, sdp }
    try {
      if (payload.to) {
        io.to(payload.to).emit('answer', { from: socket.id, sdp: payload.sdp });
      }
    } catch (e) { console.error('answer relay error', e); }
  });

  socket.on('ice-candidate', (payload) => {
    // { to? , room?, candidate }
    try {
      if (payload.to) {
        io.to(payload.to).emit('ice-candidate', { from: socket.id, candidate: payload.candidate });
      } else if (payload.room) {
        socket.to(payload.room).emit('ice-candidate', { from: socket.id, candidate: payload.candidate });
      }
    } catch (e) { console.error('ice relay error', e); }
  });

  socket.on('message', (payload) => {
    // chat: { room, user, text }
    try {
      if (payload.room) {
        socket.to(payload.room).emit('message', payload);
      }
    } catch (e) { console.error('msg relay error', e); }
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('peer-left', { id: socket.id });
    }
    console.log('disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server listening on', PORT));
