// Thin client over the relay server. Reconnects are not attempted: a lost
// socket ends the session cleanly rather than desynchronising a co-op game.
// Production builds read the relay address from VITE_RELAY_URL (set it in
// the Vercel project); local development talks to `npm run relay`.
export const DEFAULT_RELAY =
  import.meta.env.VITE_RELAY_URL ||
  (["localhost", "127.0.0.1"].includes(location.hostname) ||
  /^192\.168\.|^10\./.test(location.hostname)
    ? `ws://${location.hostname}:8787`
    : null);

export class Net {
  constructor(url = DEFAULT_RELAY) {
    this.url = url;
    this.socket = null;
    this.id = null;
    this.room = null;
    this.handlers = new Map();
  }
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type).delete(handler);
  }
  emit(type, payload) {
    for (const handler of this.handlers.get(type) || []) handler(payload);
  }
  connect() {
    if (this.socket) return Promise.resolve();
    if (!this.url) return Promise.reject(new Error("relay-not-configured"));
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const fail = () => {
        this.socket = null;
        reject(new Error("relay-unreachable"));
      };
      socket.addEventListener("error", fail, { once: true });
      socket.addEventListener("close", () => {
        this.socket = null;
        this.emit("close");
      });
      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.t === "hello") {
          this.id = message.id;
          this.socket = socket;
          resolve();
          return;
        }
        if (message.t === "room") this.room = message.code ? message : null;
        this.emit(message.t, message);
      });
      setTimeout(() => {
        if (!this.socket) {
          socket.close();
          fail();
        }
      }, 6000);
    });
  }
  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  create(name) {
    this.send({ t: "create", name });
  }
  join(code, name) {
    this.send({ t: "join", code, name });
  }
  leave() {
    this.send({ t: "leave" });
    this.room = null;
  }
  settings(map, difficulty) {
    this.send({ t: "settings", map, difficulty });
  }
  start() {
    this.send({ t: "start" });
  }
  lobby() {
    this.send({ t: "lobby" });
  }
  // Game traffic. `to` is "host", "all" or a player id.
  relay(to, m) {
    this.send({ t: "relay", to, m });
  }
  close() {
    this.socket?.close();
    this.socket = null;
    this.room = null;
  }
}
