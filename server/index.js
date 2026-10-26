
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "NEXION signalling" });
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-room", async ({ roomId, name } = {}) => {
    if (
      socket.data.roomId ||
      typeof roomId !== "string" ||
      !/^[a-zA-Z0-9_-]{3,64}$/.test(roomId) ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      socket.emit("room-error", "Invalid room ID or name.");
      return;
    }

    const members = await io.in(roomId).fetchSockets();

    if (members.length >= 2) {
      socket.emit("room-error", "This room is full.");
      return;
    }

    socket.data.roomId = roomId;
    socket.data.name = name.trim().slice(0, 40);
    await socket.join(roomId);

    socket.emit("room-joined", {
      roomId,
      selfId: socket.id,
      peers: members.map((peer) => ({
        id: peer.id,
        name: peer.data.name || "Guest",
      })),
    });

    socket.to(roomId).emit("peer-joined", {
      id: socket.id,
      name: socket.data.name,
    });

    console.log(`${socket.data.name} joined ${roomId}`);
  });

  for (const event of ["offer", "answer", "ice-candidate"]) {
    socket.on(event, ({ to, data } = {}) => {
      const roomId = socket.data.roomId;
      const target = io.sockets.sockets.get(to);

      if (
        !roomId ||
        !target ||
        !socket.rooms.has(roomId) ||
        !target.rooms.has(roomId) ||
        target.id === socket.id
      ) {
        return;
      }

      io.to(target.id).emit(event, {
        from: socket.id,
        data,
      });
    });
  }

  socket.on("chat-message", ({ message } = {}) => {
    const roomId = socket.data.roomId;

    if (
      !roomId ||
      typeof message !== "string" ||
      !message.trim()
    ) return;

    io.to(roomId).emit("chat-message", {
      from: socket.id,
      name: socket.data.name,
      message: message.trim().slice(0, 1000),
      time: Date.now(),
    });
  });

  function leaveRoom() {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit("peer-left", { id: socket.id });
    socket.leave(roomId);
    delete socket.data.roomId;
    delete socket.data.name;
  }

  socket.on("leave-room", leaveRoom);
  socket.on("disconnect", leaveRoom);
});

server.listen(4000, () => {
  console.log("NEXION signalling server: http://localhost:4000");
});
