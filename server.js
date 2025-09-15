const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("client connected");

  socket.on("join", ({ roomId, role }) => {
    socket.join(roomId);
    socket.to(roomId).emit("chat", { user: "system", text: `${role} joined` });
  });

  socket.on("offer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("offer", { sdp });
  });

  socket.on("answer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("answer", { sdp });
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", { candidate });
  });

  socket.on("chat", ({ roomId, user, text }) => {
    io.to(roomId).emit("chat", { user, text });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on", PORT));
