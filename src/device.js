import {
  COMMAND_COOLDOWN_MS,
  COMMAND_TTL_MS,
  commandStub,
  json,
} from "./shared.js";

function sameToken(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < given.length; i++)
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export default {
  async fetch(request, env) {
    if (!sameToken(request.headers.get("x-device-token"), env.DEVICE_TOKEN)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "cache-control": "no-store" },
      });
    }
    const path = new URL(request.url).pathname;
    if (path === "/connect" && request.method === "GET") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return new Response("WebSocket upgrade required", { status: 426 });
      return commandStub(env).fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

export class CommandState {
  constructor(state) {
    this.state = state;
  }

  async sendPending(ws) {
    const command = await this.state.storage.get("pending");
    if (!command || command.expiresAt <= Date.now()) return;
    const action = command.kind === "hold" ? "HOLD" : "BOOT";
    ws.send(`${action} ${command.id} ${command.expiresAt}`);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const now = Date.now();
    const storage = this.state.storage;

    if (path === "/connect" && request.method === "GET") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return new Response("WebSocket upgrade required", { status: 426 });
      for (const old of this.state.getWebSockets()) old.close(1000, "Replaced");
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server);
      await storage.put("lastSeen", now);
      await this.sendPending(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === "/enqueue" && request.method === "POST") {
      const kind = (await request.text()).trim();
      if (kind !== "pulse" && kind !== "hold")
        return json({ error: "Invalid action" }, 400);
      const pending = await storage.get("pending");
      if (pending && pending.expiresAt > now)
        return json({ error: "A boot request is already pending" }, 409);
      const lastRequest = (await storage.get("lastRequest")) || 0;
      const retryAfterMs = COMMAND_COOLDOWN_MS - (now - lastRequest);
      if (retryAfterMs > 0) {
        const seconds = Math.ceil(retryAfterMs / 1000);
        return json(
          {
            error: `Please wait ${seconds} second${seconds === 1 ? "" : "s"} before sending another command`,
            retryAfterMs,
          },
          429,
        );
      }
      const command = {
        id: crypto.randomUUID(),
        kind,
        expiresAt: now + COMMAND_TTL_MS,
      };
      await storage.put("pending", command);
      await storage.put("lastRequest", now);
      for (const ws of this.state.getWebSockets()) {
        try {
          await this.sendPending(ws);
        } catch {
          ws.close(1011, "Delivery failed");
        }
      }
      return json({ command }, 202);
    }

    if (path === "/state" && request.method === "GET") {
      const [pending, lastSeen, lastBoot, lastRequest] = await Promise.all([
        storage.get("pending"),
        storage.get("lastSeen"),
        storage.get("lastBoot"),
        storage.get("lastRequest"),
      ]);
      return json({
        pending: pending?.expiresAt > now ? pending : null,
        connected: this.state.getWebSockets().length > 0,
        lastSeen: lastSeen || null,
        lastBoot: lastBoot || null,
        readyAt: lastRequest ? lastRequest + COMMAND_COOLDOWN_MS : null,
        cooldownRemainingMs: lastRequest
          ? Math.max(0, lastRequest + COMMAND_COOLDOWN_MS - now)
          : 0,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || !this.state.getWebSockets().includes(ws))
      return;
    const now = Date.now();
    if (message === "PING") {
      await this.state.storage.put("lastSeen", now);
      return;
    }
    if (!/^ACK [a-f0-9-]{36}$/.test(message)) return;
    const pending = await this.state.storage.get("pending");
    if (!pending || pending.id !== message.slice(4)) return;
    await this.state.storage.delete("pending");
    await this.state.storage.put("lastBoot", now);
    ws.send(`ACKED ${pending.id}`);
  }
}
