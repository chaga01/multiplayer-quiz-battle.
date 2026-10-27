const socket = io();
const $ = id => document.getElementById(id);
const screens = ["homeScreen", "lobbyScreen", "gameScreen", "finishScreen"];
let roomCode = null;
let isHost = false;
let myId = null;
let latestRoom = null;
let timerInterval = null;
let questionDeadline = 0;
let answered = false;
let lastQuestion = null;

function showScreen(id) {
  screens.forEach(s => $(s).classList.toggle("hidden", s !== id));
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => el.classList.remove("show"), 2600);
}
function setError(id, message) { $(id).textContent = message || ""; }
function nameValue() { return $("nameInput").value.trim(); }
function playerRow(player, hostId, inGame = false) {
  const li = document.createElement("li");
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = player.name.slice(0, 1).toUpperCase();
  const name = document.createElement("span");
  name.className = "player-name";
  name.textContent = player.name + (player.id === myId ? " (you)" : "");
  li.append(avatar, name);
  if (player.id === hostId) {
    const tag = document.createElement("span"); tag.className = "host-tag"; tag.textContent = "HOST"; li.append(tag);
  }
  if (inGame) {
    const score = document.createElement("span"); score.className = "score"; score.textContent = player.score.toLocaleString(); li.append(score);
    if (player.answered) { const check = document.createElement("span"); check.textContent = "✓"; check.style.color = "#65e8cf"; li.append(check); }
  }
  return li;
}
function renderRoom(room) {
  latestRoom = room;
  roomCode = room.code;
  $("roomCode").textContent = room.code;
  $("playerCount").textContent = `${room.players.length} / 12`;
  $("lobbyPlayers").replaceChildren(...room.players.map(p => playerRow(p, room.hostId)));
  $("startBtn").classList.toggle("hidden", room.hostId !== myId);
  $("hostHint").classList.toggle("hidden", room.hostId === myId);
  $("startBtn").disabled = room.players.length < 2;
  $("gamePlayers").replaceChildren(...[...room.players].sort((a,b)=>b.score-a.score).map(p => playerRow(p, room.hostId, true)));
  if (room.status === "lobby") showScreen("lobbyScreen");
  else if (room.status === "playing" || room.status === "review") showScreen("gameScreen");
}
function joinResult(data) {
  roomCode = data.code;
  isHost = data.host;
  myId = socket.id;
  setError("homeError", "");
  setError("lobbyError", "");
  showScreen("lobbyScreen");
}
$("createBtn").addEventListener("click", () => {
  setError("homeError", "");
  socket.emit("room:create", { name: nameValue() });
});
$("joinBtn").addEventListener("click", () => {
  setError("homeError", "");
  socket.emit("room:join", { name: nameValue(), code: $("codeInput").value });
});
$("codeInput").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,5));
$("nameInput").addEventListener("keydown", e => { if (e.key === "Enter") $("createBtn").click(); });
$("startBtn").addEventListener("click", () => socket.emit("game:start"));
$("leaveLobbyBtn").addEventListener("click", () => {
  socket.emit("room:leave");
  roomCode = null; latestRoom = null; showScreen("homeScreen");
});
$("playAgainBtn").addEventListener("click", () => {
  socket.emit("room:leave");
  roomCode = null; latestRoom = null; clearInterval(timerInterval); showScreen("homeScreen");
});

socket.on("connect", () => { myId = socket.id; });
socket.on("room:joined", joinResult);
socket.on("room:update", room => {
  renderRoom(room);
  if (room.status === "finished") clearInterval(timerInterval);
});
socket.on("game:error", message => {
  if ($("homeScreen").classList.contains("hidden")) setError("lobbyError", message);
  else setError("homeError", message);
});
socket.on("game:notice", message => toast(message));
socket.on("question:show", q => {
  lastQuestion = q;
  answered = false;
  $("resultBanner").classList.add("hidden");
  $("categoryLabel").textContent = (q.category || "TRIVIA").toUpperCase();
  $("questionNum").textContent = q.number;
  $("totalQuestions").textContent = ` / ${q.total}`;
  $("questionText").textContent = q.text;
  $("answerStatus").textContent = "";
  const letters = ["A","B","C","D"];
  $("answerGrid").replaceChildren(...q.answers.map((answer, index) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    const letter = document.createElement("span"); letter.className = "answer-letter"; letter.textContent = letters[index];
    const label = document.createElement("span"); label.textContent = answer;
    btn.append(letter, label);
    btn.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      socket.emit("answer:submit", { index });
      [...$("answerGrid").children].forEach(b => b.disabled = true);
      $("answerStatus").textContent = "Answer submitted — waiting for the reveal…";
    });
    return btn;
  }));
  questionDeadline = Date.now() + q.durationMs;
  clearInterval(timerInterval);
  const tick = () => {
    const left = Math.max(0, questionDeadline - Date.now());
    $("timerBar").style.width = `${left / q.durationMs * 100}%`;
    if (left <= 0) clearInterval(timerInterval);
  };
  tick(); timerInterval = setInterval(tick, 100);
  showScreen("gameScreen");
});
socket.on("answer:ack", result => {
  $("answerStatus").textContent = result.correct ? "✓ Correct! Points added." : "Answer locked in. See the reveal shortly.";
});
socket.on("player:answered", data => {
  if (data.playerId !== myId) toast(`${data.playerName} has answered.`);
});
socket.on("question:result", result => {
  clearInterval(timerInterval);
  $("timerBar").style.width = "0%";
  const buttons = [...$("answerGrid").children];
  buttons.forEach((btn, index) => {
    btn.disabled = true;
    if (index === result.correctIndex) btn.classList.add("correct");
  });
  const myButton = buttons.find((btn, index) => index !== result.correctIndex && answered && btn.disabled);
  if (answered && myButton) {
    // The submitted choice is tracked below when clicked; the server reveal always marks the correct answer.
  }
  $("answerStatus").textContent = `Correct answer: ${result.correctAnswer}`;
  $("resultBanner").textContent = "SCORES UPDATED";
  $("resultBanner").classList.remove("hidden");
});
socket.on("game:finished", result => {
  clearInterval(timerInterval);
  const players = result.players;
  const winner = players[0];
  $("winnerTitle").textContent = winner ? `${winner.name} wins!` : "Match complete!";
  $("finalScores").replaceChildren(...players.map((p, i) => {
    const row = document.createElement("div"); row.className = "final-row";
    const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = ["🥇","🥈","🥉"][i] || `#${i+1}`;
    const name = document.createElement("span"); name.className = "player-name"; name.textContent = p.name + (p.id === myId ? " (you)" : "");
    const score = document.createElement("strong"); score.className = "score"; score.textContent = `${p.score.toLocaleString()} pts`;
    row.append(rank, name, score); return row;
  }));
  showScreen("finishScreen");
});
socket.on("disconnect", () => toast("Connection lost. Trying to reconnect…"));
