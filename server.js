const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://air-hockey-frontend.vercel.app",
    ], // Allow both origins
    methods: ["GET", "POST"],
  },
});

const activeRooms = {};

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Ping-pong mechanism for measuring latency
  socket.on("pingRequest", (clientTime) => {
    socket.emit("pongResponse", clientTime);
  });

  socket.on("createRoom", (data) => {
    const { room_id } = data;
    const player_number = Number(data.player_number) || 1;

    // Extract room ID and player number from the frontend
    console.log("Received room creation request:", data);

    if (!(room_id && activeRooms[room_id])) {
      // Create a new room if the provided room_id doesn't exist
      const newRoomId = room_id || `room_${Date.now()}`;
      activeRooms[newRoomId] = {
        players: [socket.id],
        playerCount: 1,
      };
      socket.join(newRoomId);
      socket.emit("playerNumber", player_number || 1); // Default to 1 if not specified
      console.log(
        `Createdss new room ${newRoomId} with Player ${player_number || 1}`
      );
    } else {
      // Room already exists, add the player as Player 2
      activeRooms[room_id].players.push(socket.id);
      activeRooms[room_id].playerCount++;
      socket.join(room_id);
      socket.emit("playerNumber", player_number || 2); // Default to 2 if not specified
      io.to(room_id).emit("gameStart");
      console.log(
        `Player ${player_number || 2} joined existing room ${room_id}`
      );

      // Send initial state to the first player
      const firstPlayer = activeRooms[room_id].players[0];
      io.to(firstPlayer).emit("requestInitialState");
    }
  });

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
      io.to(rooms[1]).emit("puckSync", {
        x: data.x,
        y: data.y,
        velocityX: data.velocityX,
        velocityY: data.velocityY,
        timestamp: Date.now(), // Add a timestamp to track delays
      });
    }
  });

  socket.on("scoreUpdate", (scores) => {
    console.log("Score update:", scores);
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
