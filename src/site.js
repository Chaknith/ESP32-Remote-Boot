import { commandStub, json, noCache, ONLINE_WINDOW_MS } from "./shared.js";
import { html, css, forceCss, clientJs } from "./web.js";

const securityHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function staticResponse(body, contentType) {
  return new Response(body, {
    headers: { ...securityHeaders, "content-type": contentType },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (!ctx?.access || !env.ALLOWED_EMAIL)
      return new Response("Access required", { status: 403 });
    const identity = await ctx.access.getIdentity();
    if (identity?.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
      return new Response("Access denied", { status: 403 });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/")
      return staticResponse(html, "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/style.css")
      return staticResponse(css + forceCss, "text/css; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/app.js")
      return staticResponse(clientJs, "text/javascript; charset=utf-8");

    if (request.method === "GET" && url.pathname === "/api/state") {
      const response = await commandStub(env).fetch("https://internal/state");
      if (!response.ok) return json({ error: "State unavailable" }, 502);
      const state = await response.json();
      return json({
        online:
          !!state.connected && !!state.lastSeen && Date.now() - state.lastSeen < ONLINE_WINDOW_MS,
        pending: !!state.pending,
        pendingKind: state.pending?.kind || null,
        readyAt: state.readyAt,
        lastSeen: state.lastSeen,
        lastBoot: state.lastBoot,
      });
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/api/boot" || url.pathname === "/api/hold")
    ) {
      if (request.headers.get("origin") !== url.origin)
        return json({ error: "Origin not allowed" }, 403);
      const kind = url.pathname === "/api/hold" ? "hold" : "pulse";
      const stateResponse = await commandStub(env).fetch(
        "https://internal/state",
      );
      if (!stateResponse.ok) return json({ error: "State unavailable" }, 502);
      const state = await stateResponse.json();
      if (!state.connected || !state.lastSeen || Date.now() - state.lastSeen >= ONLINE_WINDOW_MS) {
        return json(
          { error: "ESP32 is offline. Command was not queued." },
          503,
        );
      }
      const response = await commandStub(env).fetch(
        new Request("https://internal/enqueue", { method: "POST", body: kind }),
      );
      return noCache(response);
    }

    return new Response("Not found", { status: 404, headers: securityHeaders });
  },
};
