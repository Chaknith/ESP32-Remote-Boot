import siteWorker from "./site.js";
import deviceWorker from "./device.js";

export { CommandState } from "./device.js";

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/device/")) {
      url.pathname = url.pathname.slice("/device".length);
      return deviceWorker.fetch(new Request(url, request), env, ctx);
    }
    if (request.method === "GET" && url.pathname === "/sign-in")
      return new Response(null, {
        status: 302,
        headers: {
          location: "/app/control",
          "set-cookie": "remote_boot_local_session=1; Path=/; HttpOnly; SameSite=Lax",
          "cache-control": "no-store",
        },
      });
    if (request.method === "GET" && url.pathname === "/sign-out")
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": "remote_boot_local_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
          "cache-control": "no-store",
        },
      });
    const signedIn = request.headers.get("cookie")?.split(";").some((part) => part.trim() === "remote_boot_local_session=1");
    return siteWorker.fetch(request, env, { access: signedIn ? ctx.access : undefined });
  },
};
