// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // папка для фронтенда

io.on("connection", (socket) => {
  console.log("✅ Новый пользователь подключился");

  socket.on("chat message", (msg) => {
    console.log("💬", msg);
    io.emit("chat message", msg); // рассылаем всем
  });

  socket.on("disconnect", () => {
    console.log("❌ Пользователь отключился");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});
