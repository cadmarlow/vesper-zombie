// Vesper relay server. Rooms of up to four players identified by a short
// code. The server never simulates the game: the host runs it and every
// message is forwarded, so a single small Node process serves many rooms.
import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const MAX_PLAYERS = 4;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const rooms = new Map();
let nextId = 1;

const makeCode = () => {
  let code;
  do {
    code = Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
};
const send = (socket, message) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};
const roomInfo = (room) => ({
  t: "room",
  code: room.code,
  host: room.host,
  started: room.started,
  map: room.map,
  difficulty: room.difficulty,
  players: room.players.map((p) => ({ id: p.id, name: p.name })),
});
const broadcast = (room, message, except = null) => {
  for (const p of room.players) if (p !== except) send(p.socket, message);
};
const leave = (player) => {
  const room = player.room;
  if (!room) return;
  room.players = room.players.filter((p) => p !== player);
  player.room = null;
  if (!room.players.length) {
    rooms.delete(room.code);
    return;
  }
  if (room.host === player.id) {
    room.host = room.players[0].id;
    broadcast(room, { t: "host", id: room.host });
  }
  broadcast(room, { t: "left", id: player.id, name: player.name });
  broadcast(room, roomInfo(room));
};

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(
    JSON.stringify({
      service: "vesper-relay",
      rooms: rooms.size,
      players: [...rooms.values()].reduce((n, r) => n + r.players.length, 0),
    }),
  );
});
const wss = new WebSocketServer({ server });
wss.on("connection", (socket) => {
  const player = {
    id: nextId++,
    name: "Survivant",
    socket,
    room: null,
    alive: true,
  };
  send(socket, { t: "hello", id: player.id });
  socket.on("pong", () => (player.alive = true));
  socket.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m.t !== "string") return;
    const room = player.room;
    switch (m.t) {
      case "create": {
        leave(player);
        player.name = String(m.name || "Survivant").slice(0, 16);
        const created = {
          code: makeCode(),
          host: player.id,
          players: [player],
          started: false,
          map: "abbey",
          difficulty: "normal",
        };
        rooms.set(created.code, created);
        player.room = created;
        send(socket, roomInfo(created));
        break;
      }
      case "join": {
        const target = rooms.get(String(m.code || "").toUpperCase());
        if (!target) return send(socket, { t: "error", code: "no-room" });
        if (target.started)
          return send(socket, { t: "error", code: "started" });
        if (target.players.length >= MAX_PLAYERS)
          return send(socket, { t: "error", code: "full" });
        leave(player);
        player.name = String(m.name || "Survivant").slice(0, 16);
        target.players.push(player);
        player.room = target;
        broadcast(target, roomInfo(target));
        break;
      }
      case "leave":
        leave(player);
        send(socket, { t: "room", code: null, players: [] });
        break;
      case "settings":
        if (room && room.host === player.id) {
          if (m.map) room.map = String(m.map);
          if (m.difficulty) room.difficulty = String(m.difficulty);
          broadcast(room, roomInfo(room));
        }
        break;
      case "lobby":
        // The host is back in the menu: reopen the room for the next run.
        if (room && room.host === player.id) {
          room.started = false;
          broadcast(room, roomInfo(room));
        }
        break;
      case "start":
        if (room && room.host === player.id && !room.started) {
          room.started = true;
          broadcast(room, {
            t: "start",
            map: room.map,
            difficulty: room.difficulty,
            host: room.host,
            players: room.players.map((p) => ({ id: p.id, name: p.name })),
          });
        }
        break;
      case "relay": {
        // to: "host" | "all" | numeric id. The sender id is stamped so peers
        // can trust who spoke without the host having to sign anything.
        if (!room) return;
        const message = { ...m.m, from: player.id };
        if (m.to === "host") {
          const host = room.players.find((p) => p.id === room.host);
          if (host && host !== player) send(host.socket, message);
        } else if (m.to === "all") broadcast(room, message, player);
        else {
          const target = room.players.find((p) => p.id === m.to);
          if (target) send(target.socket, message);
        }
        break;
      }
    }
  });
  socket.on("close", () => leave(player));
});
// Drop silent connections: a closed laptop must free its seat in the room.
setInterval(() => {
  for (const client of wss.clients) {
    const player = [...rooms.values()]
      .flatMap((r) => r.players)
      .find((p) => p.socket === client);
    if (player) {
      if (!player.alive) return client.terminate();
      player.alive = false;
    }
    client.ping();
  }
}, 15000);
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Vesper relay listening on ${PORT}`),
);
