const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:8080", "http://127.0.0.1:8080"], // Allow both origins
    methods: ["GET", "POST"],
  },
});

const activeRooms = {};

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Find first available room with 1 player
  let roomFound = null;
  for (const [roomId, room] of Object.entries(activeRooms)) {
    if (room.playerCount === 1) {
      roomFound = roomId;
      break;
    }
  }

  if (!roomFound) {
    const newRoomId = `room_${Date.now()}`;
    activeRooms[newRoomId] = {
      players: [socket.id],
      playerCount: 1,
    };
    socket.join(newRoomId);
    socket.emit("playerNumber", 1);
    console.log(`Created new room ${newRoomId}`);
  } else {
    activeRooms[roomFound].players.push(socket.id);
    activeRooms[roomFound].playerCount++;
    socket.join(roomFound);
    socket.emit("playerNumber", 2);
    io.to(roomFound).emit("gameStart");
    console.log(`Added to room ${roomFound}`);

    // Send initial state to second player
    const firstPlayer = activeRooms[roomFound].players[0];
    io.to(firstPlayer).emit("requestInitialState");
  }

  // Update player movement handler
  socket.on("playerMove", (data) => {
    const rooms = Array.from(socket.rooms);
    if (rooms.length > 1) {
      socket.to(rooms[1]).emit("opponentMove", data);
    }
  });

  // Add to socket.io connection handler
  socket.on("puckUpdate", (data) => {
    const rooms = Array.from(socket.rooms);
    if (rooms.length > 1) {
      socket.to(rooms[1]).emit("puckSync", data);
    }
  });

  socket.on("scoreUpdate", (scores) => {
    const rooms = Array.from(socket.rooms);
    if (rooms.length > 1) {
      io.to(rooms[1]).emit("scoreSync", scores);
    }
  });

  // Add new handlers:
  socket.on("requestInitialState", () => {
    const rooms = Array.from(socket.rooms);
    if (rooms.length > 1) {
      socket.to(rooms[1]).emit("provideInitialState");
    }
  });

  socket.on("sendInitialState", (state) => {
    const rooms = Array.from(socket.rooms);
    if (rooms.length > 1) {
      io.to(rooms[1]).emit("receiveInitialState", state);
    }
  });

  socket.on("goalScored", (goalData) => {
    const rooms = Array.from(socket.rooms);
    if (rooms.length > 1) {
      io.to(rooms[1]).emit("updateGoalState", goalData);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    Object.keys(activeRooms).forEach((roomId) => {
      const index = activeRooms[roomId].players.indexOf(socket.id);
      if (index !== -1) {
        activeRooms[roomId].players.splice(index, 1);
        activeRooms[roomId].playerCount--;
        if (activeRooms[roomId].playerCount === 0) {
          delete activeRooms[roomId];
        } else {
          io.to(roomId).emit("opponentDisconnected");
        }
      }
    });
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});















