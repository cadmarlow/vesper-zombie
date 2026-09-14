import { pathToFileURL } from "node:url";
import {
  PROTOCOL_VERSION,
  MAX_PLAYERS,
  MAX_MESSAGE_BYTES,
  canRelay,
  contentId,
} from "./protocol.js";
// Vesper relay server. Rooms of up to four players identified by a short
// code. The server never simulates the game: the host runs it and every
// message is forwarded, so a single small Node process serves many rooms.
import http from "node:http";
import { WebSocketServer } from "ws";

export function createRelay({
  port = 8787,
  host = "0.0.0.0",
  heartbeatMs = 15000,
} = {}) {
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
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > 2 * 1024 * 1024) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message));
  };
  const roomInfo = (room) => ({
    t: "room",
    code: room.code,
    host: room.host,
    started: room.started,
    run: room.run,
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
    room.ready.delete(player.id);
    player.room = null;
    if (!room.players.length) {
      rooms.delete(room.code);
      return;
    }
    if (room.host === player.id) {
      room.host = room.players[0].id;
      room.started = false;
      room.active = false;
      broadcast(room, { t: "host", id: room.host });
    }
    broadcast(room, { t: "left", id: player.id, name: player.name });
    broadcast(room, roomInfo(room));
    launchWhenReady(room);
  };

  const launchWhenReady = (room) => {
    if (
      room.started &&
      !room.active &&
      room.players.every((p) => room.ready.has(p.id))
    ) {
      room.active = true;
      broadcast(room, { t: "go", run: room.run });
    }
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
  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  wss.on("connection", (socket) => {
    const player = {
      id: nextId++,
      name: "Survivant",
      socket,
      room: null,
      alive: true,
      tokens: 240,
      lastMessage: Date.now(),
    };
    socket.player = player;
    // Invalid framing and oversized payloads emit on this socket. Close that
    // connection without letting an unhandled error terminate every room.
    socket.on("error", () => socket.terminate());
    send(socket, { t: "hello", id: player.id, version: PROTOCOL_VERSION });
    socket.on("pong", () => (player.alive = true));
    socket.on("message", (raw) => {
      const now = Date.now();
      player.tokens = Math.min(
        240,
        player.tokens + (now - player.lastMessage) * 0.12,
      );
      player.lastMessage = now;
      if (player.tokens < 1) {
        socket.close(1008, "rate-limit");
        return;
      }
      player.tokens--;
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
          if (m.version !== PROTOCOL_VERSION)
            return send(socket, { t: "error", code: "version-mismatch" });
          leave(player);
          player.name = String(m.name || "Survivant").slice(0, 16);
          const created = {
            code: makeCode(),
            host: player.id,
            players: [player],
            started: false,
            active: false,
            run: 0,
            ready: new Set(),
            map: "abbey",
            difficulty: "normal",
          };
          rooms.set(created.code, created);
          player.room = created;
          send(socket, roomInfo(created));
          break;
        }
        case "join": {
          if (m.version !== PROTOCOL_VERSION)
            return send(socket, { t: "error", code: "version-mismatch" });
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
            if (contentId(m.map)) room.map = m.map;
            if (["story", "normal", "nightmare"].includes(m.difficulty))
              room.difficulty = m.difficulty;
            broadcast(room, roomInfo(room));
          }
          break;
        case "lobby":
          // The host is back in the menu: reopen the room for the next run.
          if (room && room.host === player.id) {
            room.started = false;
            room.active = false;
            room.ready.clear();
            broadcast(room, { t: "stop", run: room.run });
            broadcast(room, roomInfo(room));
          }
          break;
        case "start":
          if (room && room.host === player.id && !room.started) {
            room.started = true;
            room.active = false;
            room.run++;
            room.ready.clear();
            broadcast(room, {
              t: "start",
              run: room.run,
              map: room.map,
              difficulty: room.difficulty,
              host: room.host,
              players: room.players.map((p) => ({ id: p.id, name: p.name })),
            });
          }
          break;
        case "ready":
          if (room?.started && m.run === room.run) {
            room.ready.add(player.id);
            launchWhenReady(room);
          }
          break;
        case "relay": {
          // to: "host" | "all" | numeric id. The sender id is stamped so peers
          // can trust who spoke without the host having to sign anything.
          if (
            !room?.active ||
            m.run !== room.run ||
            !canRelay(m.m, room.host === player.id)
          )
            return;
          if (room.host !== player.id && m.to !== "host") return;
          const message = { ...m.m, from: player.id, run: room.run };
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
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const player = client.player;
      if (!player.alive) {
        client.terminate();
        continue;
      }
      player.alive = false;
      client.ping();
    }
  }, heartbeatMs);
  const ready = new Promise((resolve, reject) => {
    server.once("error", reject);
    wss.once("error", reject);
    server.listen(port, host, () => resolve(server.address()));
  });
  ready.catch(() => clearInterval(heartbeat));
  return {
    server,
    wss,
    rooms,
    ready,
    async close() {
      clearInterval(heartbeat);
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const relay = createRelay({ port: Number(process.env.PORT || 8787) });
  relay.ready.then((address) =>
    console.log("Vesper relay listening on " + address.port),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      void relay.close();
    });
}
