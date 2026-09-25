const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static("public"));

const COLORS = ["pink", "cyan", "yellow", "green"];
const CAP = 4;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cloneBoard(board) {
  return board.map(t => t.slice());
}

function top(tube) {
  return tube[tube.length - 1];
}

function runLength(tube) {
  if (!tube.length) return 0;
  const c = top(tube);
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}

// Start from the solved state and make legal reverse moves.
// This guarantees the generated board can be solved by reversing those moves.
function makeBoard() {
  const board = COLORS.map(c => Array(CAP).fill(c));
  board.push([]);
  board.push([]);

  const moves = 100;

  for (let step = 0; step < moves; step++) {
    const choices = [];

    for (let from = 0; from < board.length; from++) {
      if (!board[from].length) continue;

      const c = top(board[from]);
      const run = runLength(board[from]);

      for (let to = 0; to < board.length; to++) {
        if (to === from || board[to].length >= CAP) continue;

        // Reverse-scramble onto empty or a different color.
        if (board[to].length && top(board[to]) === c) continue;

        const max = Math.min(run, CAP - board[to].length);
        for (let amount = 1; amount <= max; amount++) {
          choices.push({ from, to, amount });
        }
      }
    }

    if (!choices.length) break;

    const move = choices[Math.floor(Math.random() * choices.length)];
    for (let i = 0; i < move.amount; i++) {
      board[move.to].push(board[move.from].pop());
    }
  }

  return board;
}

function solved(board) {
  return board.every(
    tube =>
      tube.length === 0 ||
      (tube.length === CAP && tube.every(c => c === tube[0]))
  );
}

function validMove(board, from, to) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= board.length ||
    to >= board.length ||
    from === to
  ) return false;

  const a = board[from];
  const b = board[to];

  if (!a.length || b.length >= CAP) return false;
  return !b.length || top(a) === top(b);
}

function move(board, from, to) {
  const amount = Math.min(runLength(board[from]), CAP - board[to].length);
  for (let i = 0; i < amount; i++) {
    board[to].push(board[from].pop());
  }
}

function makeRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name
    })),
    started: room.started,
    winner: room.winner
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function emitGame(room) {
  room.players.forEach((p, index) => {
    const opponent = room.players[1 - index];
    io.to(p.id).emit("game:state", {
      you: {
        index,
        board: room.boards[index],
        moves: room.moves[index],
        solved: room.solved[index],
        canUndo: room.history[index] ? room.history[index].length > 0 : false
      },
      opponent: opponent
        ? {
            name: opponent.name,
            board: room.boards[1 - index],
            moves: room.moves[1 - index],
            solved: room.solved[1 - index]
          }
        : null,
      started: room.started,
      winner: room.winner,
      timeLeft: room.timeLeft
    });
  });
}

io.on("connection", socket => {
  socket.on("room:create", ({ name }) => {
    const safeName = String(name || "Player 1").trim().slice(0, 20);
    const code = makeRoomCode();

    const room = {
      code,
      players: [{ id: socket.id, name: safeName }],
      boards: [null, null],
      history: [[], []],
      moves: [0, 0],
      solved: [false, false],
      started: false,
      winner: null,
      timeLeft: 120,
      timer: null
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.data.index = 0;
    socket.emit("room:created", { code, index: 0, name: safeName });
    emitRoom(room);
    emitGame(room);
  });

  socket.on("room:join", ({ code, name }) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) return socket.emit("room:error", "Room not found.");
    if (room.players.length >= 2) return socket.emit("room:error", "That room is full.");
    if (room.started) return socket.emit("room:error", "That game has already started.");

    const safeName = String(name || "Player 2").trim().slice(0, 20);

    room.players.push({ id: socket.id, name: safeName });
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.index = 1;
    socket.emit("room:joined", { code: room.code, index: 1, name: safeName });

    room.boards = [makeBoard(), makeBoard()];
    room.boards[1] = cloneBoard(room.boards[0]);
    room.history = [[], []];
    room.moves = [0, 0];
    room.solved = [false, false];
    room.winner = null;
    room.timeLeft = 120;
    room.started = true;

    room.timer = setInterval(() => {
      if (!rooms.has(room.code) || !room.started || room.winner) return;
      room.timeLeft -= 1;
      emitGame(room);

      if (room.timeLeft <= 0) {
        room.winner = "time";
        clearInterval(room.timer);
        emitRoom(room);
        emitGame(room);
      }
    }, 1000);

    emitRoom(room);
    emitGame(room);
  });

  socket.on("game:move", ({ from, to }) => {
    const roomCode = socket.data.room;
    const playerIndex = socket.data.index;
    const room = rooms.get(roomCode);

    if (!room || !room.started || room.winner) return;
    if (playerIndex !== 0 && playerIndex !== 1) return;

    const board = room.boards[playerIndex];

    if (!validMove(board, from, to)) {
      return socket.emit("game:error", "Invalid move.");
    }

    room.history[playerIndex].push(cloneBoard(board));
    if (room.history[playerIndex].length > 200) room.history[playerIndex].shift();

    move(board, from, to);
    room.moves[playerIndex] += 1;

    if (solved(board)) {
      room.solved[playerIndex] = true;
      room.winner = playerIndex;
      clearInterval(room.timer);
      emitRoom(room);
    }

    emitGame(room);
  });

  socket.on("game:undo", () => {
    const roomCode = socket.data.room;
    const playerIndex = socket.data.index;
    const room = rooms.get(roomCode);

    if (!room || !room.started || room.winner) return;
    if (playerIndex !== 0 && playerIndex !== 1) return;
    if (!room.history[playerIndex] || !room.history[playerIndex].length) {
      return socket.emit("game:error", "Nothing to undo.");
    }

    room.boards[playerIndex] = room.history[playerIndex].pop();
    room.moves[playerIndex] = Math.max(0, room.moves[playerIndex] - 1);
    emitGame(room);
  });

  socket.on("game:restart", () => {
    const roomCode = socket.data.room;
    const room = rooms.get(roomCode);
    if (!room || room.players.length < 2) return;

    room.boards = [makeBoard(), makeBoard()];
    // Guarantee that the two players do not receive the same starting pattern.
    let attempts = 0;
    while (JSON.stringify(room.boards[0]) === JSON.stringify(room.boards[1]) && attempts < 20) {
      room.boards[1] = makeBoard();
      attempts++;
    }
    room.history = [[], []];
    room.moves = [0, 0];
    room.solved = [false, false];
    room.winner = null;
    room.started = true;
    room.timeLeft = 120;

    clearInterval(room.timer);
    room.timer = setInterval(() => {
      if (!rooms.has(room.code) || !room.started || room.winner) return;
      room.timeLeft -= 1;
      emitGame(room);
      if (room.timeLeft <= 0) {
        room.winner = "time";
        clearInterval(room.timer);
        emitRoom(room);
        emitGame(room);
      }
    }, 1000);

    emitRoom(room);
    emitGame(room);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.room;
    const room = rooms.get(roomCode);
    if (!room) return;

    clearInterval(room.timer);
    rooms.delete(roomCode);
    io.to(room.code).emit("room:closed", "A player left the room.");
  });
});

server.listen(PORT, () => {
  console.log(`Color Stack running on http://localhost:${PORT}`);
});
