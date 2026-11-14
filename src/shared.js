export const COMMAND_TTL_MS = 90_000;
export const ONLINE_WINDOW_MS = 90_000;
export const COMMAND_COOLDOWN_MS = 120_000;

export function commandStub(env) {
  return env.COMMANDS.get(env.COMMANDS.idFromName('pc-power'));
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function noCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
