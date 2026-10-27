const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const QUESTION_TIME_MS = 15000;
const QUESTIONS_PER_GAME = 8;

const questionBank = [
  { q: "Which planet is known as the Red Planet?", answers: ["Venus", "Mars", "Jupiter", "Mercury"], correct: 1, category: "Science" },
  { q: "How many sides does a hexagon have?", answers: ["Five", "Six", "Seven", "Eight"], correct: 1, category: "Math" },
  { q: "Which ocean is the largest?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3, category: "Geography" },
  { q: "What is the chemical symbol for gold?", answers: ["Ag", "Go", "Au", "Gd"], correct: 2, category: "Science" },
  { q: "Who wrote Romeo and Juliet?", answers: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"], correct: 1, category: "Literature" },
  { q: "What is 9 × 7?", answers: ["56", "63", "72", "67"], correct: 1, category: "Math" },
  { q: "Which animal is the largest mammal?", answers: ["African elephant", "Giraffe", "Blue whale", "Hippopotamus"], correct: 2, category: "Nature" },
  { q: "What is the capital of Japan?", answers: ["Kyoto", "Seoul", "Tokyo", "Osaka"], correct: 2, category: "Geography" },
  { q: "Which instrument has keys, pedals, and strings?", answers: ["Flute", "Piano", "Trumpet", "Drum"], correct: 1, category: "Music" },
  { q: "How many minutes are in two hours?", answers: ["100", "110", "120", "140"], correct: 2, category: "General" },
  { q: "Which gas do plants absorb from the atmosphere?", answers: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correct: 2, category: "Science" },
  { q: "On which continent is Egypt primarily located?", answers: ["Asia", "Africa", "Europe", "South America"], correct: 1, category: "Geography" },
  { q: "What is the first month of the year?", answers: ["December", "March", "January", "February"], correct: 2, category: "General" },
  { q: "Which shape has exactly three sides?", answers: ["Rectangle", "Triangle", "Pentagon", "Circle"], correct: 1, category: "Math" },
  { q: "What is the hardest naturally occurring substance?", answers: ["Quartz", "Iron", "Diamond", "Granite"], correct: 2, category: "Science" },
  { q: "Which sport uses a shuttlecock?", answers: ["Tennis", "Badminton", "Squash", "Table tennis"], correct: 1, category: "Sports" }
];

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, score: p.score,
    answered: room.status === "playing" ? p.answer !== null : false
  }));
}

function roomSnapshot(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: publicPlayers(room),
    questionNumber: room.questionIndex + 1,
    totalQuestions: room.questions.length
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", roomSnapshot(room));
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function sendError(socket, message) {
  socket.emit("game:error", message);
}

function getRoomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function removePlayer(socket) {
  const room = getRoomForSocket(socket);
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(room.code);
  socket.data.roomCode = null;

  if (room.players.size === 0) {
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    io.to(room.code).emit("game:notice", `${room.players.get(room.hostId).name} is now the host.`);
  }
  if (room.status === "playing" && [...room.players.values()].every(p => p.answer !== null)) {
    finishQuestion(room);
  }
  broadcastRoom(room);
}

function shuffledQuestions() {
  const pool = [...questionBank];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, QUESTIONS_PER_GAME);
}

function startQuestion(room) {
  if (!rooms.has(room.code)) return;
  room.status = "playing";
  room.questionStartedAt = Date.now();
  room.players.forEach(p => p.answer = null);
  const q = room.questions[room.questionIndex];
  io.to(room.code).emit("question:show", {
    number: room.questionIndex + 1,
    total: room.questions.length,
    text: q.q,
    answers: q.answers,
    category: q.category,
    durationMs: QUESTION_TIME_MS
  });
  broadcastRoom(room);
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => finishQuestion(room), QUESTION_TIME_MS);
}

function finishQuestion(room) {
  if (room.status !== "playing") return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  const q = room.questions[room.questionIndex];
  io.to(room.code).emit("question:result", {
    correctIndex: q.correct,
    correctAnswer: q.answers[q.correct],
    scores: publicPlayers(room).sort((a, b) => b.score - a.score)
  });
  room.status = "review";
  broadcastRoom(room);
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.questionIndex += 1;
    if (room.questionIndex >= room.questions.length) {
      room.status = "finished";
      io.to(room.code).emit("game:finished", {
        players: publicPlayers(room).sort((a, b) => b.score - a.score)
      });
      broadcastRoom(room);
      return;
    }
    startQuestion(room);
  }, 3500);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}) => {
    removePlayer(socket);
    const playerName = cleanName(name);
    if (!playerName) return sendError(socket, "Enter a name before creating a room.");
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = {
      code, hostId: socket.id, players: new Map(),
      status: "lobby", questions: [], questionIndex: -1,
      timer: null, questionStartedAt: null
    };
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, answer: null });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room:joined", { code, host: true });
    broadcastRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}) => {
    removePlayer(socket);
    const roomCode = String(code || "").trim().toUpperCase();
    const playerName = cleanName(name);
    const room = rooms.get(roomCode);
    if (!playerName) return sendError(socket, "Enter a name before joining.");
    if (!room) return sendError(socket, "Room not found. Check the code and try again.");
    if (room.status !== "lobby") return sendError(socket, "That game has already started.");
    if (room.players.size >= 12) return sendError(socket, "This room is full (12 players maximum).");
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return sendError(socket, "That name is already being used in this room.");
    }
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, answer: null });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit("room:joined", { code: room.code, host: false });
    io.to(room.code).emit("game:notice", `${playerName} joined the room.`);
    broadcastRoom(room);
  });

  socket.on("game:start", () => {
    const room = getRoomForSocket(socket);
    if (!room) return sendError(socket, "Join a room first.");
    if (room.hostId !== socket.id) return sendError(socket, "Only the host can start the game.");
    if (room.status !== "lobby") return sendError(socket, "This game has already started.");
    if (room.players.size < 2) return sendError(socket, "At least two players are needed to start.");
    room.questions = shuffledQuestions();
    room.questionIndex = 0;
    room.players.forEach(p => p.score = 0);
    io.to(room.code).emit("game:notice", "The match is starting. Good luck!");
    startQuestion(room);
  });

  socket.on("answer:submit", ({ index } = {}) => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== "playing") return;
    const player = room.players.get(socket.id);
    if (!player || player.answer !== null) return;
    const choice = Number(index);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return;
    player.answer = choice;
    const q = room.questions[room.questionIndex];
    if (choice === q.correct) {
      const elapsed = Date.now() - room.questionStartedAt;
      const remainingRatio = Math.max(0, 1 - elapsed / QUESTION_TIME_MS);
      player.score += 500 + Math.round(500 * remainingRatio);
    }
    socket.emit("answer:ack", { correct: choice === q.correct });
    io.to(room.code).emit("player:answered", { playerId: socket.id, playerName: player.name });
    broadcastRoom(room);
    if ([...room.players.values()].every(p => p.answer !== null)) finishQuestion(room);
  });

  socket.on("room:leave", () => removePlayer(socket));
  socket.on("disconnect", () => removePlayer(socket));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Multiplayer Quiz Battle running on port ${PORT}`);
});
