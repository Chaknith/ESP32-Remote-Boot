import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import deviceWorker, { CommandState } from "../src/device.js";
import siteWorker from "../src/site.js";
import localWorker from "../src/local.js";
import { COMMAND_COOLDOWN_MS } from "../src/shared.js";
import { clientJs, landingJs } from "../src/web.js";

globalThis.crypto ||= webcrypto;

function harness() {
  const values = new Map();
  const sockets = [];
  const state = new CommandState({
    getWebSockets: () => sockets,
    acceptWebSocket: (socket) => sockets.push(socket),
    storage: {
      get: async (key) => values.get(key),
      put: async (key, value) => values.set(key, value),
      delete: async (key) => values.delete(key),
    },
  });
  const binding = {
    idFromName: (name) => name,
    get: () => ({
      fetch: (request) =>
        state.fetch(
          typeof request === "string" ? new Request(request) : request,
        ),
    }),
  };
  return {
    values,
    sockets,
    state,
    siteEnv: { COMMANDS: binding, ALLOWED_EMAIL: "owner@example.com" },
    deviceEnv: { COMMANDS: binding, DEVICE_TOKEN: "test-device-secret" },
  };
}

function connectDevice(h) {
  const socket = {
    messages: [],
    send(message) { this.messages.push(message); },
    close() { h.sockets.splice(h.sockets.indexOf(this), 1); },
  };
  h.sockets.push(socket);
  h.values.set("lastSeen", Date.now());
  return socket;
}

const identity = {
  access: { getIdentity: async () => ({ email: "owner@example.com" }) },
};
const page = "https://remote-boot-site.example.workers.dev";

describe("command lifecycle", () => {
  it("allows another command after the ten-second cooldown", async () => {
    const h = harness();
    connectDevice(h);
    assert.equal(COMMAND_COOLDOWN_MS, 10_000);
    h.values.set("lastRequest", Date.now() - 5_000);
    const request = () => h.state.fetch(new Request("https://internal/enqueue", {
      method: "POST",
      body: "pulse",
    }));
    assert.equal((await request()).status, 429);
    h.values.set("lastRequest", Date.now() - 11_000);
    assert.equal((await request()).status, 202);
  });

  it("pushes one command to the connected device, then acknowledges it", async () => {
    const h = harness();
    const { state, values } = h;
    const socket = connectDevice(h);
    const queued = await state.fetch(
      new Request("https://internal/enqueue", {
        method: "POST",
        body: "pulse",
      }),
    );
    assert.equal(queued.status, 202);
    const command = (await queued.json()).command;
    const id = command.id;
    assert.equal(command.kind, "pulse");
    assert.deepEqual(socket.messages, [`BOOT ${id} ${command.expiresAt}`]);
    assert.equal(
      (
        await state.fetch(
          new Request("https://internal/enqueue", {
            method: "POST",
            body: "hold",
          }),
        )
      ).status,
      409,
    );
    await state.webSocketMessage(socket, "ACK wrong-id");
    assert.ok(values.get("pending"));
    await state.webSocketMessage(socket, `ACK ${id}`);
    assert.equal(values.has("pending"), false);
    assert.deepEqual(socket.messages.at(-1), `ACKED ${id}`);
    assert.ok(values.get("lastBoot"));
    assert.equal(
      (
        await state.fetch(
          new Request("https://internal/enqueue", {
            method: "POST",
            body: "hold",
          }),
        )
      ).status,
      429,
    );
  });

  it("does not deliver expired commands on reconnect", async () => {
    const h = harness();
    const { state, values } = h;
    values.set("pending", { id: "old", expiresAt: Date.now() - 1 });
    const socket = connectDevice(h);
    await state.sendPending(socket);
    assert.deepEqual(socket.messages, []);
  });

  it("rejects unsupported actions without reserving a command", async () => {
    const { state, values } = harness();
    assert.equal(
      (
        await state.fetch(
          new Request("https://internal/enqueue", {
            method: "POST",
            body: "hold 60000",
          }),
        )
      ).status,
      400,
    );
    assert.equal(values.has("pending"), false);
  });

  it("replays pending commands when the device reconnects", async () => {
    const h = harness();
    const { state, values } = h;
    const pending = { id: "legacy-id", expiresAt: Date.now() + 60000 };
    values.set("pending", pending);
    const socket = connectDevice(h);
    await state.sendPending(socket);
    assert.deepEqual(socket.messages, [`BOOT legacy-id ${pending.expiresAt}`]);
  });

  it("ignores acknowledgement from a disconnected socket", async () => {
    const h = harness();
    const old = connectDevice(h);
    h.sockets.splice(0, 1);
    const id = "12345678-1234-1234-1234-123456789abc";
    h.values.set("pending", { id, expiresAt: Date.now() + 60000 });
    await h.state.webSocketMessage(old, `ACK ${id}`);
    assert.ok(h.values.get("pending"));
  });

  it("refreshes last seen only from the connected device", async () => {
    const h = harness();
    const socket = connectDevice(h);
    h.values.set("lastSeen", 1);
    await h.state.webSocketMessage(socket, "PING");
    assert.ok(h.values.get("lastSeen") > 1);
    h.sockets.splice(0, 1);
    h.values.set("lastSeen", 1);
    await h.state.webSocketMessage(socket, "PING");
    assert.equal(h.values.get("lastSeen"), 1);
  });
});

describe("access and device authentication", () => {
  it("serves a public landing page without exposing the controls", async () => {
    const { siteEnv } = harness();
    const response = await siteWorker.fetch(new Request(page), siteEnv, {});
    assert.equal(response.status, 200);
    const landingPage = await response.text();
    assert.match(landingPage, /Sign in to begin/);
    assert.match(landingPage, /href="\/favicon\.svg"/);
    const favicon = await siteWorker.fetch(new Request(`${page}/favicon.svg`), siteEnv, {});
    assert.equal(favicon.status, 200);
    assert.match(favicon.headers.get("content-type"), /image\/svg\+xml/);
    assert.match(await favicon.text(), /<svg/);
    assert.equal((await siteWorker.fetch(new Request(`${page}/app/session`), siteEnv, {})).status, 403);
    assert.equal((await siteWorker.fetch(new Request(`${page}/app/app.js`), siteEnv, {})).status, 403);
    assert.equal((await siteWorker.fetch(new Request(`${page}/api/state`), siteEnv, {})).status, 404);
    const signIn = await siteWorker.fetch(new Request(`${page}/sign-in`), siteEnv, {});
    assert.equal(signIn.headers.get("location"), "/app/control");
    const signOut = await siteWorker.fetch(new Request(`${page}/sign-out`), siteEnv, {});
    assert.match(signOut.headers.get("location"), /^\/cdn-cgi\/access\/logout\?returnTo=/);
  });

  it("fails closed without Cloudflare Access or the configured email", async () => {
    const { siteEnv } = harness();
    assert.equal(
      (await siteWorker.fetch(new Request(`${page}/app/control`), siteEnv, {})).status,
      403,
    );
    assert.equal(
      (
        await siteWorker.fetch(
          new Request(`${page}/app/control`),
          { ...siteEnv, ALLOWED_EMAIL: "" },
          identity,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await siteWorker.fetch(new Request(`${page}/app/control`), siteEnv, {
          access: {
            getIdentity: async () => ({ email: "someone@example.com" }),
          },
        })
      ).status,
      403,
    );
  });

  it("serves the dashboard to the allowed Access identity", async () => {
    const { siteEnv } = harness();
    const response = await siteWorker.fetch(
      new Request(`${page}/app/control`),
      siteEnv,
      identity,
    );
    assert.equal(response.status, 200);
    const pageHtml = await response.text();
    assert.match(pageHtml, /Press button/);
    assert.match(pageHtml, /href="\/favicon\.svg"/);
    assert.doesNotMatch(pageHtml, /class="hero"/);
    assert.match(
      response.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
  });

  it("simulates sign in and sign out in the local Worker", async () => {
    const h = harness();
    const base = "http://localhost:8787";
    const localEnv = { ...h.siteEnv, DEVICE_TOKEN: h.deviceEnv.DEVICE_TOKEN };
    assert.equal((await localWorker.fetch(new Request(`${base}/app/session`), localEnv, identity)).status, 403);
    const signIn = await localWorker.fetch(new Request(`${base}/sign-in`), localEnv, identity);
    assert.equal(signIn.status, 302);
    const cookie = signIn.headers.get("set-cookie").split(";")[0];
    const session = await localWorker.fetch(new Request(`${base}/app/session`, {
      headers: { cookie },
    }), localEnv, identity);
    assert.equal((await session.json()).signedIn, true);
    const signOut = await localWorker.fetch(new Request(`${base}/sign-out`, {
      headers: { cookie },
    }), localEnv, identity);
    assert.equal(signOut.headers.get("location"), "/");
    assert.match(signOut.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await localWorker.fetch(new Request(`${base}/app/session`), localEnv, identity)).status, 403);
  });

  it("rejects cross-origin boot requests and offline commands", async () => {
    const { siteEnv } = harness();
    const crossOrigin = new Request(`${page}/app/api/boot`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(
      (await siteWorker.fetch(crossOrigin, siteEnv, identity)).status,
      403,
    );
    const crossOriginHold = new Request(`${page}/app/api/hold`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(
      (await siteWorker.fetch(crossOriginHold, siteEnv, identity)).status,
      403,
    );
    const sameOrigin = new Request(`${page}/app/api/boot`, {
      method: "POST",
      headers: { origin: page },
    });
    assert.equal(
      (await siteWorker.fetch(sameOrigin, siteEnv, identity)).status,
      503,
    );
    const sameOriginHold = new Request(`${page}/app/api/hold`, {
      method: "POST",
      headers: { origin: page },
    });
    assert.equal(
      (await siteWorker.fetch(sameOriginHold, siteEnv, identity)).status,
      503,
    );
  });

  it("requires the device token and a WebSocket upgrade", async () => {
    const { deviceEnv } = harness();
    const url = "https://remote-boot-device.example.workers.dev/connect";
    assert.equal(
      (await deviceWorker.fetch(new Request(url), deviceEnv)).status,
      401,
    );
    assert.equal(
      (
        await deviceWorker.fetch(
          new Request(url, { headers: { "x-device-token": "wrong" } }),
          deviceEnv,
        )
      ).status,
      401,
    );
    const response = await deviceWorker.fetch(
      new Request(url, {
        headers: { "x-device-token": deviceEnv.DEVICE_TOKEN },
      }),
      deviceEnv,
    );
    assert.equal(response.status, 426);
    assert.equal((await deviceWorker.fetch(new Request("https://device.example/poll", {
      headers: { "x-device-token": deviceEnv.DEVICE_TOKEN },
    }), deviceEnv)).status, 404);
  });

  it("accepts a boot request only while the ESP32 is online", async () => {
    const h = harness();
    const { siteEnv } = h;
    connectDevice(h);
    const response = await siteWorker.fetch(
      new Request(`${page}/app/api/boot`, {
        method: "POST",
        headers: { origin: page },
      }),
      siteEnv,
      identity,
    );
    assert.equal(response.status, 202);
    assert.ok((await response.json()).command.id);
  });

  it("rejects commands after the WebSocket disconnects even if last seen is recent", async () => {
    const h = harness();
    connectDevice(h);
    h.sockets.length = 0;
    const state = await siteWorker.fetch(new Request(`${page}/app/api/state`), h.siteEnv, identity);
    assert.equal((await state.json()).online, false);
    const response = await siteWorker.fetch(new Request(`${page}/app/api/boot`, {
      method: "POST",
      headers: { origin: page },
    }), h.siteEnv, identity);
    assert.equal(response.status, 503);
  });

  it("queues a fixed hold command and delivers it to the ESP32", async () => {
    const h = harness();
    const { siteEnv } = h;
    const socket = connectDevice(h);
    const response = await siteWorker.fetch(
      new Request(`${page}/app/api/hold`, {
        method: "POST",
        headers: { origin: page },
      }),
      siteEnv,
      identity,
    );
    assert.equal(response.status, 202);
    const { command } = await response.json();
    assert.equal(command.kind, "hold");
    assert.deepEqual(socket.messages, [`HOLD ${command.id} ${command.expiresAt}`]);
    const state = await siteWorker.fetch(
      new Request(`${page}/app/api/state`),
      siteEnv,
      identity,
    );
    assert.equal((await state.json()).pendingKind, "hold");
  });
});

describe("website confirmation", () => {
  it("redirects returning signed-in visitors from the landing page", async () => {
    const visits = [];
    const context = {
      window: { location: { replace: (path) => visits.push(path) } },
      fetch: async (_path, options) => {
        assert.equal(options.headers["X-Requested-With"], "XMLHttpRequest");
        return { ok: true, headers: { get: () => "application/json; charset=utf-8" } };
      },
    };
    runInNewContext(landingJs, context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(visits, ["/app/control"]);
    visits.length = 0;
    context.fetch = async () => ({ ok: false, headers: { get: () => "text/html" } });
    runInNewContext(landingJs, context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(visits, []);
  });

  it("updates the cooldown number every second", async () => {
    const elements = new Map(["boot", "hold", "feedback", "status-pill", "status-text", "last-seen"].map((id) => [
      id, { disabled: false, classList: { toggle() {} }, addEventListener() {} },
    ]));
    const intervals = new Map();
    let now = 1_000_000;
    runInNewContext(clientJs, {
      document: { getElementById: (id) => elements.get(id) },
      Date: { now: () => now },
      fetch: async () => ({ ok: true, json: async () => ({ online: true, pending: false, readyAt: 1_010_000 }) }),
      setInterval: (callback, milliseconds) => intervals.set(milliseconds, callback),
      setTimeout() {},
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(elements.get("feedback").textContent, "Next command available in 10s.");
    assert.equal(elements.get("boot").disabled, true);
    now += 1_000;
    intervals.get(1000)();
    assert.equal(elements.get("feedback").textContent, "Next command available in 9s.");
    now += 9_000;
    intervals.get(1000)();
    assert.equal(elements.get("feedback").textContent, "ESP32 is online and ready.");
    assert.equal(elements.get("boot").disabled, false);
  });

  it("requires confirmation before either power-button request", async () => {
    const elements = new Map(
      [
        "boot",
        "hold",
        "feedback",
        "status-pill",
        "status-text",
        "last-seen",
        "confirm-title",
        "confirm-message",
        "confirm-accept",
      ].map((id) => [
        id,
        {
          disabled: false,
          classList: { toggle() {} },
          addEventListener(event, handler) {
            this[event] = handler;
          },
        },
      ]),
    );
    const dialog = {
      open: false,
      returnValue: "",
      addEventListener(_event, handler) {
        this.onClose = handler;
      },
      removeEventListener() {
        this.onClose = null;
      },
      showModal() {
        this.open = true;
      },
      close(value) {
        this.open = false;
        this.returnValue = value;
        this.onClose();
      },
    };
    elements.set("confirm-dialog", dialog);
    const requests = [];
    const context = {
      document: { getElementById: (id) => elements.get(id) },
      fetch: async (path, options) => {
        requests.push({ path, options });
        return {
          ok: true,
          json: async () =>
            path === "/app/api/state"
              ? { online: true, pending: false }
              : { command: { id: "test" } },
        };
      },
      setInterval() {},
      setTimeout() {},
    };
    runInNewContext(clientJs, context);
    await new Promise((resolve) => setImmediate(resolve));
    let action = elements.get("boot").click();
    assert.equal(dialog.open, true);
    assert.equal(elements.get("confirm-accept").textContent, "Press button");
    dialog.close("cancel");
    await action;
    action = elements.get("hold").click();
    assert.equal(elements.get("confirm-accept").textContent, "Force shutdown");
    dialog.close("cancel");
    await action;
    assert.equal(
      requests.filter((request) => request.path === "/app/api/boot").length,
      0,
    );
    assert.equal(
      requests.filter((request) => request.path === "/app/api/hold").length,
      0,
    );
    action = elements.get("hold").click();
    dialog.close("confirm");
    await action;
    assert.equal(
      requests.filter((request) => request.path === "/app/api/hold").length,
      1,
    );
  });
});
