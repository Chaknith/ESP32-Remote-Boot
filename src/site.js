import { commandStub, json, noCache, ONLINE_WINDOW_MS } from "./shared.js";
import { html, landingHtml, landingJs, css, forceCss, landingCss, clientJs, faviconSvg } from "./web.js";

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
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/")
      return staticResponse(landingHtml, "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/favicon.svg")
      return staticResponse(faviconSvg, "image/svg+xml; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/style.css")
      return staticResponse(css + forceCss + landingCss, "text/css; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/landing.js")
      return staticResponse(landingJs, "text/javascript; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/sign-in")
      return new Response(null, { status: 302, headers: { location: "/app/control", "cache-control": "no-store" } });
    if (request.method === "GET" && url.pathname === "/sign-out")
      return new Response(null, {
        status: 302,
        headers: {
          location: `/cdn-cgi/access/logout?returnTo=${encodeURIComponent(url.origin + "/")}`,
          "cache-control": "no-store",
        },
      });
    if (request.method === "GET" && (url.pathname === "/app" || url.pathname === "/app/"))
      return new Response(null, { status: 302, headers: { location: "/app/control", "cache-control": "no-store" } });
    if (!url.pathname.startsWith("/app/"))
      return new Response("Not found", { status: 404, headers: securityHeaders });

    if (!ctx?.access || !env.ALLOWED_EMAIL)
      return new Response("Access required", { status: 403 });
    const identity = await ctx.access.getIdentity();
    if (identity?.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
      return new Response("Access denied", { status: 403 });
    }

    if (request.method === "GET" && url.pathname === "/app/session")
      return json({ signedIn: true });
    if (request.method === "GET" && url.pathname === "/app/control")
      return staticResponse(html, "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/app/app.js")
      return staticResponse(clientJs, "text/javascript; charset=utf-8");

    if (request.method === "GET" && url.pathname === "/app/api/state") {
      const response = await commandStub(env).fetch("https://internal/state");
      if (!response.ok) return json({ error: "State unavailable" }, 502);
      const state = await response.json();
      return json({
        online:
          !!state.connected && !!state.lastSeen && Date.now() - state.lastSeen < ONLINE_WINDOW_MS,
        pending: !!state.pending,
        pendingKind: state.pending?.kind || null,
        readyAt: state.readyAt,
        cooldownRemainingMs: state.cooldownRemainingMs ?? Math.max(0, (state.readyAt || 0) - Date.now()),
        lastSeen: state.lastSeen,
        lastBoot: state.lastBoot,
      });
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/app/api/boot" || url.pathname === "/app/api/hold")
    ) {
      if (request.headers.get("origin") !== url.origin)
        return json({ error: "Origin not allowed" }, 403);
      const kind = url.pathname === "/app/api/hold" ? "hold" : "pulse";
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
