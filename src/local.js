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
    return siteWorker.fetch(request, env, ctx);
  },
};
