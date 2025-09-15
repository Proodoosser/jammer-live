import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join-room", (roomId, role) => {
    socket.join(roomId);
    socket.role = role;
    socket.roomId = roomId;
    console.log(`${socket.id} joined room ${roomId} as ${role}`);

    socket.to(roomId).emit("peer-joined", { id: socket.id, role });
  });

  socket.on("offer", ({ to, sdp }) => {
    if (to) io.to(to).emit("offer", { from: socket.id, sdp });
  });

  socket.on("answer", ({ to, sdp }) => {
    if (to) io.to(to).emit("answer", { from: socket.id, sdp });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    if (to) io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("message", ({ room, user, text }) => {
    io.to(room).emit("message", { user, text });
  });

  socket.on("disconnect", () => {
    console.log("disconnected", socket.id);
    if (socket.roomId) {
      socket.to(socket.roomId).emit("peer-left", { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
