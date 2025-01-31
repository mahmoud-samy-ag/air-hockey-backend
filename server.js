const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

const rooms = {}; // Store room data

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Handle room creation (Room Creator is always Player 1)
    socket.on("createRoom", (playerName) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, roomCode, playerIndex: 0 }], // Player 1 (Left Side)
            puck: { x: 400, y: 300, vx: 0, vy: 0 },
            puckDirection: -1 // Always start moving toward Player 1
        };
        socket.join(roomCode);
        io.to(socket.id).emit("roomCreated", { roomCode });
        console.log(`Room ${roomCode} created by ${playerName} (Player 1 - Left)`);
    });

    // Handle joining a room (Joiner is always Player 2)
    socket.on("joinRoom", ({ roomCode, playerName }) => {
        if (rooms[roomCode] && rooms[roomCode].players.length < 2) {
            // Joiner is always Player 2
            rooms[roomCode].players.push({ id: socket.id, name: playerName, roomCode, playerIndex: 1 });
    
            socket.join(roomCode);
            io.to(roomCode).emit("playerJoined", { players: rooms[roomCode].players, roomCode });
    
            console.log(`${playerName} joined room ${roomCode} as Player 2 (Right)`);
        } else {
            io.to(socket.id).emit("errorMessage", "Room is full or doesn't exist");
        }
    });

// Ensure players always get assigned their correct side
socket.on("checkPlayer", (roomCode) => {
    if (rooms[roomCode]) {
        const player = rooms[roomCode].players.find(p => p.id === socket.id);
        const opponent = rooms[roomCode].players.find(p => p.id !== socket.id);

        if (player) {
            io.to(socket.id).emit("assignPlayer", {
                playerNumber: player.playerIndex + 1, // 1 or 2
                playerName: player.name,
                opponentName: opponent ? opponent.name : "Waiting..."
            });
        }
    }
});

    // Handle player readiness
    socket.on("playerReady", (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].readyPlayers = (rooms[roomCode].readyPlayers || 0) + 1;
            console.log(`Player in room ${roomCode} is ready. Total Ready: ${rooms[roomCode].readyPlayers}`);

            if (rooms[roomCode].readyPlayers === 2) {
                console.log(`Starting countdown for room ${roomCode}`);
                io.to(roomCode).emit("startCountdown", 5);

                // Wait 5 seconds, then start the game
                setTimeout(() => {
                    console.log(`Game started for room ${roomCode}`);
                    io.to(roomCode).emit("startGame");
                }, 5000);
            }
        }
    });

    // Handle paddle movement
    socket.on("movePaddle", ({ roomCode, playerId, paddleX, paddleY }) => {
        if (rooms[roomCode]) {
            const playerIndex = rooms[roomCode].players.findIndex(p => p.id === playerId);
            if (playerIndex === 0) {
                // Player 1's paddle is locked to the left side
                paddleX = Math.min(paddleX, 400 - 30);
            } else {
                // Player 2's paddle is locked to the right side
                paddleX = Math.max(paddleX, 400 + 30);
            }

            // Emit both X and Y positions to sync the paddle movement
            io.to(roomCode).emit("updatePaddle", { playerId, paddleX, paddleY });
        }
    });

    // Handle puck movement
    socket.on("updatePuck", ({ roomCode, puck }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].puck = puck;
            // Broadcast to all in the room EXCEPT the sender
            socket.broadcast.to(roomCode).emit("updatePuck", puck);
        }
    });

    // Handle scoring
    socket.on("updateScore", ({ roomCode, score1, score2 }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].score1 = score1;
            rooms[roomCode].score2 = score2;
            io.to(roomCode).emit("updateScore", { score1, score2 });
        }
    });

    // Handle player disconnect
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        // Remove the player from their room
        let roomCodeToDelete = null;
        for (const roomCode in rooms) {
            const playerIndex = rooms[roomCode].players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                console.log(`Removing Player ${playerIndex + 1} from room ${roomCode}`);
                rooms[roomCode].players.splice(playerIndex, 1);

                // If the room is empty, mark it for deletion
                if (rooms[roomCode].players.length === 0) {
                    roomCodeToDelete = roomCode;
                } else {
                    io.to(roomCode).emit("playerLeft", rooms[roomCode].players);
                }
            }
        }

        // Delete empty rooms
        if (roomCodeToDelete) {
            console.log(`Deleting empty room: ${roomCodeToDelete}`);
            delete rooms[roomCodeToDelete];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));






















