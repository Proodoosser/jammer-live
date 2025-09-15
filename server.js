// server.js
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join-room", (room, role) => {
    socket.join(room);
    socket.data.room = room;
    socket.data.role = role;
    socket.to(room).emit("peer-joined", { id: socket.id, role });
  });

  socket.on("offer", (payload) => {
    if (payload.room) socket.to(payload.room).emit("offer", { from: socket.id, sdp: payload.sdp });
  });

  socket.on("answer", (payload) => {
    if (payload.room) socket.to(payload.room).emit("answer", { from: socket.id, sdp: payload.sdp });
  });

  socket.on("ice-candidate", (payload) => {
    if (payload.room) socket.to(payload.room).emit("ice-candidate", { from: socket.id, candidate: payload.candidate });
  });

  socket.on("message", (payload) => {
    if (payload.room) socket.to(payload.room).emit("message", payload);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (room) socket.to(room).emit("peer-left", { id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server listening on " + PORT));
