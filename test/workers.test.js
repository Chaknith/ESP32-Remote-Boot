import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import deviceWorker, { CommandState } from "../src/device.js";
import siteWorker from "../src/site.js";
import { clientJs } from "../src/web.js";

globalThis.crypto ||= webcrypto;

function harness() {
  const values = new Map();
  const state = new CommandState({
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
    state,
    siteEnv: { COMMANDS: binding, ALLOWED_EMAIL: "owner@example.com" },
    deviceEnv: { COMMANDS: binding, DEVICE_TOKEN: "test-device-secret" },
  };
}

const identity = {
  access: { getIdentity: async () => ({ email: "owner@example.com" }) },
};
const page = "https://remote-boot-site.example.workers.dev";

describe("command lifecycle", () => {
  it("queues one command, delivers it to the device, then acknowledges it", async () => {
    const { state, values } = harness();
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
    assert.equal(
      await (await state.fetch(new Request("https://internal/poll"))).text(),
      `BOOT ${id}`,
    );
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
    assert.equal(
      (
        await state.fetch(
          new Request("https://internal/ack", {
            method: "POST",
            body: "wrong-id",
          }),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await state.fetch(
          new Request("https://internal/ack", { method: "POST", body: id }),
        )
      ).status,
      200,
    );
    assert.equal(
      await (await state.fetch(new Request("https://internal/poll"))).text(),
      "NONE",
    );
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

  it("does not deliver expired commands", async () => {
    const { state, values } = harness();
    values.set("pending", { id: "old", expiresAt: Date.now() - 1 });
    assert.equal(
      await (await state.fetch(new Request("https://internal/poll"))).text(),
      "NONE",
    );
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

  it("delivers existing pending commands as short pulses", async () => {
    const { state, values } = harness();
    values.set("pending", { id: "legacy-id", expiresAt: Date.now() + 60000 });
    assert.equal(
      await (await state.fetch(new Request("https://internal/poll"))).text(),
      "BOOT legacy-id",
    );
  });
});

describe("access and device authentication", () => {
  it("fails closed without Cloudflare Access or the configured email", async () => {
    const { siteEnv } = harness();
    assert.equal(
      (await siteWorker.fetch(new Request(page), siteEnv, {})).status,
      403,
    );
    assert.equal(
      (
        await siteWorker.fetch(
          new Request(page),
          { ...siteEnv, ALLOWED_EMAIL: "" },
          identity,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await siteWorker.fetch(new Request(page), siteEnv, {
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
      new Request(page),
      siteEnv,
      identity,
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Send power pulse/);
    assert.match(
      response.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
  });

  it("rejects cross-origin boot requests and offline commands", async () => {
    const { siteEnv } = harness();
    const crossOrigin = new Request(`${page}/api/boot`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(
      (await siteWorker.fetch(crossOrigin, siteEnv, identity)).status,
      403,
    );
    const crossOriginHold = new Request(`${page}/api/hold`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(
      (await siteWorker.fetch(crossOriginHold, siteEnv, identity)).status,
      403,
    );
    const sameOrigin = new Request(`${page}/api/boot`, {
      method: "POST",
      headers: { origin: page },
    });
    assert.equal(
      (await siteWorker.fetch(sameOrigin, siteEnv, identity)).status,
      503,
    );
    const sameOriginHold = new Request(`${page}/api/hold`, {
      method: "POST",
      headers: { origin: page },
    });
    assert.equal(
      (await siteWorker.fetch(sameOriginHold, siteEnv, identity)).status,
      503,
    );
  });

  it("requires the device token and accepts a valid poll", async () => {
    const { deviceEnv } = harness();
    const url = "https://remote-boot-device.example.workers.dev/poll";
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
    assert.equal(await response.text(), "NONE");
  });

  it("accepts a boot request only while the ESP32 is online", async () => {
    const { siteEnv, values } = harness();
    values.set("lastSeen", Date.now());
    const response = await siteWorker.fetch(
      new Request(`${page}/api/boot`, {
        method: "POST",
        headers: { origin: page },
      }),
      siteEnv,
      identity,
    );
    assert.equal(response.status, 202);
    assert.ok((await response.json()).command.id);
  });

  it("queues a fixed hold command and delivers it to the ESP32", async () => {
    const { siteEnv, deviceEnv, values } = harness();
    values.set("lastSeen", Date.now());
    const response = await siteWorker.fetch(
      new Request(`${page}/api/hold`, {
        method: "POST",
        headers: { origin: page },
      }),
      siteEnv,
      identity,
    );
    assert.equal(response.status, 202);
    const { command } = await response.json();
    assert.equal(command.kind, "hold");
    const poll = await deviceWorker.fetch(
      new Request("https://device.example/poll", {
        headers: { "x-device-token": deviceEnv.DEVICE_TOKEN },
      }),
      deviceEnv,
    );
    assert.equal(await poll.text(), `HOLD ${command.id}`);
    const state = await siteWorker.fetch(
      new Request(`${page}/api/state`),
      siteEnv,
      identity,
    );
    assert.equal((await state.json()).pendingKind, "hold");
  });
});

describe("website confirmation", () => {
  it("requires confirmation before either power-button request", async () => {
    const elements = new Map(
      [
        "boot",
        "hold",
        "feedback",
        "status-pill",
        "status-text",
        "last-seen",
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
    const requests = [];
    let confirmed = false;
    const context = {
      document: { getElementById: (id) => elements.get(id) },
      window: { confirm: () => confirmed },
      fetch: async (path, options) => {
        requests.push({ path, options });
        return {
          ok: true,
          json: async () =>
            path === "/api/state"
              ? { online: true, pending: false }
              : { command: { id: "test" } },
        };
      },
      setInterval() {},
      setTimeout() {},
    };
    runInNewContext(clientJs, context);
    await new Promise((resolve) => setImmediate(resolve));
    await elements.get("boot").click();
    await elements.get("hold").click();
    assert.equal(
      requests.filter((request) => request.path === "/api/boot").length,
      0,
    );
    assert.equal(
      requests.filter((request) => request.path === "/api/hold").length,
      0,
    );
    confirmed = true;
    await elements.get("hold").click();
    assert.equal(
      requests.filter((request) => request.path === "/api/hold").length,
      1,
    );
  });
});
