import { PROTOCOL_VERSION } from "../server/protocol.js";
const hostname = globalThis.location?.hostname || "localhost";
export const DEFAULT_RELAY =
  import.meta.env?.VITE_RELAY_URL ||
  (["localhost", "127.0.0.1"].includes(hostname) ||
  /^192\.168\.|^10\./.test(hostname)
    ? `ws://${hostname}:8787`
    : null);

/** Connection owns its socket and handshake; rooms and runs have separate lifetimes. */
export class Net {
  constructor(
    url = DEFAULT_RELAY,
    { WebSocketImpl = globalThis.WebSocket, timeout = 6000 } = {},
  ) {
    Object.assign(this, { url, WebSocketImpl, timeout });
    this.socket = null;
    this.connecting = null;
    this.id = null;
    this.room = null;
    this.handlers = new Map();
  }
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
  emit(type, payload) {
    for (const handler of this.handlers.get(type) || []) handler(payload);
  }
  connect() {
    if (this.connecting) return this.connecting;
    if (this.socket?.readyState === 1 && this.id !== null)
      return Promise.resolve();
    if (!this.url) return Promise.reject(new Error("relay-not-configured"));
    this.connecting = new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(this.url);
      this.socket = socket;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
          socket.close();
        } else resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("relay-unreachable")),
        this.timeout,
      );
      socket.addEventListener(
        "error",
        () => finish(new Error("relay-unreachable")),
        { once: true },
      );
      socket.addEventListener("close", () => {
        finish(new Error("relay-unreachable"));
        if (this.socket !== socket) return;
        this.socket = null;
        this.room = null;
        this.id = null;
        this.emit("close");
      });
      socket.addEventListener("message", (event) => {
        if (this.socket !== socket) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!message || typeof message.t !== "string") return;
        if (message.t === "hello") {
          if (message.version !== PROTOCOL_VERSION)
            return finish(new Error("version-mismatch"));
          this.id = message.id;
          finish();
          return;
        }
        if (!settled || this.id === null) return;
        if (message.t === "room") this.room = message.code ? message : null;
        if (message.t === "start" && this.room)
          Object.assign(this.room, { started: true, run: message.run });
        this.emit(message.t, message);
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
  send(message) {
    if (this.socket?.readyState === 1)
      this.socket.send(JSON.stringify(message));
  }
  create(name) {
    this.send({ t: "create", name, version: PROTOCOL_VERSION });
  }
  join(code, name) {
    this.send({ t: "join", code, name, version: PROTOCOL_VERSION });
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
  ready(run) {
    this.send({ t: "ready", run });
  }
  lobby() {
    this.send({ t: "lobby" });
  }
  relay(to, m) {
    this.send({ t: "relay", to, m, run: this.room?.run });
  }
  close() {
    this.socket?.close();
    this.room = null;
  }
}
