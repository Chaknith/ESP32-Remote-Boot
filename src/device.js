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
    if (path === "/poll" && request.method === "GET") {
      return commandStub(env).fetch("https://internal/poll");
    }
    if (path === "/ack" && request.method === "POST") {
      const id = (await request.text()).trim();
      if (!/^[a-f0-9-]{36}$/.test(id))
        return json({ error: "Invalid command ID" }, 400);
      return commandStub(env).fetch(
        new Request("https://internal/ack", { method: "POST", body: id }),
      );
    }
    return new Response("Not found", { status: 404 });
  },
};

export class CommandState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const now = Date.now();
    const storage = this.state.storage;

    if (path === "/enqueue" && request.method === "POST") {
      const kind = (await request.text()).trim();
      if (kind !== "pulse" && kind !== "hold")
        return json({ error: "Invalid action" }, 400);
      const pending = await storage.get("pending");
      if (pending && pending.expiresAt > now)
        return json({ error: "A boot request is already pending" }, 409);
      const lastRequest = (await storage.get("lastRequest")) || 0;
      if (now - lastRequest < COMMAND_COOLDOWN_MS)
        return json(
          { error: "Please wait two minutes before sending another command" },
          429,
        );
      const command = {
        id: crypto.randomUUID(),
        kind,
        createdAt: now,
        expiresAt: now + COMMAND_TTL_MS,
      };
      await storage.put("pending", command);
      await storage.put("lastRequest", now);
      return json({ command }, 202);
    }

    if (path === "/poll" && request.method === "GET") {
      const lastSeen = (await storage.get("lastSeen")) || 0;
      if (now - lastSeen >= 30_000) await storage.put("lastSeen", now);
      const pending = await storage.get("pending");
      if (!pending || pending.expiresAt <= now)
        return new Response("NONE", {
          headers: { "cache-control": "no-store" },
        });
      const action = pending.kind === "hold" ? "HOLD" : "BOOT";
      return new Response(`${action} ${pending.id}`, {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    if (path === "/ack" && request.method === "POST") {
      const id = (await request.text()).trim();
      const pending = await storage.get("pending");
      if (!pending || pending.id !== id)
        return json({ error: "Unknown command" }, 404);
      await storage.delete("pending");
      await storage.put("lastBoot", now);
      return json({ acknowledged: true });
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
        lastSeen: lastSeen || null,
        lastBoot: lastBoot || null,
        readyAt: lastRequest ? lastRequest + COMMAND_COOLDOWN_MS : null,
      });
    }

    return new Response("Not found", { status: 404 });
  }
}
