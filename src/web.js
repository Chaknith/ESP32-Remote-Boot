export const landingHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a1715">
  <title>Remote Boot — Sign in</title>
  <meta name="description" content="Private remote power control for your PC.">
  <link rel="stylesheet" href="/style.css">
  <script src="/landing.js" defer></script>
</head>
<body>
  <main class="shell">
    <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">↗</span><span>REMOTE BOOT</span></div><span class="private">PRIVATE CONTROL PANEL</span></header>
    <section class="hero landing-hero" aria-labelledby="title">
      <div class="eyebrow"><span class="eyebrow-line"></span> YOUR MACHINE, ONE TAP AWAY</div>
      <h1 id="title">Power on.<br><em>From anywhere.</em></h1>
      <p class="intro">Control your PC's power button through an ESP32. Sign in to access your private controls.</p>
      <a class="sign-in-button" href="/sign-in">Sign in to begin <span aria-hidden="true">↗</span></a>
    </section>
    <footer><span>REMOTE BOOT / SECURE ACCESS</span><span>Powered by Cloudflare</span></footer>
  </main>
</body>
</html>`;

export const landingJs = `
fetch("/app/session", {
  cache: "no-store",
  headers: { "X-Requested-With": "XMLHttpRequest" },
})
  .then((response) => {
    if (response.ok && response.headers.get("content-type")?.includes("application/json"))
      window.location.replace("/app/control");
  })
  .catch(() => {});
`;

export const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a1715">
  <title>Remote Boot</title>
  <meta name="description" content="Private remote power control for your PC.">
  <link rel="stylesheet" href="/style.css">
  <script src="/app/app.js" defer></script>
</head>
<body>
  <main class="shell">
    <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">↗</span><span>REMOTE BOOT</span></div><a class="private sign-out" href="/sign-out">Sign out</a></header>
    <section class="control" aria-label="PC power control">
      <div class="control-head"><div><span class="section-label">DEVICE 01 / PC POWER</span><h2>Power control</h2></div><span id="status-pill" class="pill checking"><span class="dot"></span><span id="status-text">Checking</span></span></div>
      <div class="control-body"><div class="power-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 7v24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M19 14.5a25 25 0 1 0 26 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div><p class="action-title">Ready when you are.</p><p class="action-copy">This sends one short power-button pulse. It does not confirm whether the PC is on or off.</p><button id="boot" class="boot-button" type="button" disabled><span>Send power pulse</span><span aria-hidden="true">↗</span></button><button id="hold" class="boot-button hold-button" type="button" disabled><span>Force shutdown (hold 5 seconds)</span></button><p class="danger-note">Use only if the PC is unresponsive. Unsaved work may be lost.</p><p id="feedback" class="feedback" role="status" aria-live="polite">Connecting to your ESP32…</p></div>
      <div class="control-foot"><span>ESP32 last seen</span><time id="last-seen">—</time></div>
    </section>
    <footer><span>REMOTE BOOT / SECURE ACCESS</span><span>Powered by Cloudflare</span></footer>
  </main>
</body>
</html>`;

export const css = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a1715;color:#eff8f1}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 70% 8%,#173d32 0,transparent 34%),#0a1715}button{font:inherit}.shell{max-width:1120px;margin:auto;padding:0 40px}.topbar{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff24}.brand{display:flex;align-items:center;gap:12px;font-size:13px;letter-spacing:.19em;font-weight:800}.brand-mark{width:33px;height:33px;display:grid;place-items:center;border-radius:8px;background:#a7f16b;color:#10231a;font-size:22px;line-height:1}.private,.eyebrow,.section-label,footer{font-size:11px;font-weight:700;letter-spacing:.18em;color:#94a79b}.hero{padding:90px 0 62px;max-width:770px}.eyebrow{display:flex;align-items:center;gap:13px;color:#a7f16b}.eyebrow-line{width:28px;height:1px;background:#a7f16b}h1{font-size:clamp(54px,8.2vw,112px);line-height:.98;letter-spacing:-.07em;margin:24px 0 25px;font-weight:700}h1 em{font-style:normal;color:#a7f16b}.intro{font-size:18px;line-height:1.65;max-width:570px;color:#aabbb0;margin:0}.control{border:1px solid #ffffff25;border-radius:22px;background:linear-gradient(145deg,#182b24,#101f1b);box-shadow:0 32px 80px #0005;overflow:hidden}.control-head,.control-foot{display:flex;align-items:center;justify-content:space-between;padding:24px 32px}.control-head{border-bottom:1px solid #ffffff17}.section-label{color:#a7f16b}h2{font-size:23px;letter-spacing:-.03em;margin:8px 0 0}.pill{border:1px solid #ffffff2b;border-radius:100px;padding:9px 12px;display:flex;align-items:center;gap:8px;color:#b1beb5;font-size:12px;font-weight:700}.dot{width:7px;height:7px;border-radius:50%;background:currentColor}.pill.online{color:#a7f16b;border-color:#a7f16b55;background:#a7f16b0d}.pill.offline{color:#ffad93;border-color:#ffad9355;background:#ffad930d}.control-body{display:flex;flex-direction:column;align-items:center;text-align:center;padding:50px 24px 42px}.power-icon{width:100px;height:100px;border:1px solid #a7f16b4d;border-radius:26px;background:#a7f16b0c;color:#a7f16b;display:grid;place-items:center}.power-icon svg{width:52px;height:52px}.action-title{font-size:28px;font-weight:700;letter-spacing:-.04em;margin:26px 0 6px}.action-copy{font-size:14px;line-height:1.6;color:#aabbb0;max-width:420px;margin:0 0 28px}.boot-button{width:min(100%,330px);min-height:58px;border:0;border-radius:11px;background:#a7f16b;color:#0d1b14;font-weight:800;display:flex;align-items:center;justify-content:space-between;padding:0 21px;cursor:pointer;transition:transform .15s,background .15s}.boot-button:not(:disabled):hover{background:#bdff89;transform:translateY(-2px)}.boot-button:disabled{opacity:.45;cursor:not-allowed}.boot-button span:last-child{font-size:24px}.feedback{font-size:13px;color:#aabbb0;min-height:20px;margin:17px 0 0}.feedback.error{color:#ffad93}.control-foot{border-top:1px solid #ffffff17;color:#9aaca0;font-size:12px}.control-foot time{color:#eaf5ec;font-variant-numeric:tabular-nums}footer{display:flex;justify-content:space-between;padding:29px 0 45px;font-size:10px}@media(max-width:640px){.shell{padding:0 20px}.topbar{height:72px}.private{display:none}.hero{padding:65px 0 48px}.intro{font-size:16px}.control-head,.control-foot{padding:21px}.control-body{padding:42px 20px 35px}.section-label{font-size:9px}h2{font-size:20px}footer{gap:12px;flex-wrap:wrap}}`;

export const forceCss = `.control{margin-top:64px}.hold-button{margin-top:12px;background:#442620;color:#ffe4da;border:1px solid #e18b72}.hold-button:not(:disabled):hover{background:#613329}.danger-note{font-size:12px;color:#d8a89a;margin:12px 0 0;max-width:380px}.hold-button span:last-child{font-size:14px}@media(max-width:640px){.control{margin-top:32px}}`;

export const landingCss = `.landing-hero{min-height:calc(100vh - 176px)}.sign-in-button{display:flex;align-items:center;justify-content:space-between;width:min(100%,330px);min-height:58px;margin-top:34px;padding:0 21px;border-radius:11px;background:#a7f16b;color:#0d1b14;text-decoration:none;font-weight:800}.sign-in-button:hover{background:#bdff89}.sign-in-button span{font-size:24px}.sign-out{text-decoration:none}.sign-out:hover{color:#eff8f1}@media(max-width:640px){.landing-hero{min-height:calc(100vh - 145px)}.sign-out{display:block}}`;

export const clientJs = `
const boot = document.getElementById("boot");
const hold = document.getElementById("hold");
const feedback = document.getElementById("feedback");
const pill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const lastSeen = document.getElementById("last-seen");
let busy = false;
let latestState = null;
function message(text, error = false) {
  feedback.textContent = text;
  feedback.classList.toggle("error", error);
}
function setDisabled(disabled) {
  boot.disabled = disabled;
  hold.disabled = disabled;
}
function renderState(state) {
  const remaining = Math.max(0, Math.ceil(((state.readyAt || 0) - Date.now()) / 1000));
  const cooling = remaining > 0;
  pill.className = "pill " + (state.online ? "online" : "offline");
  statusText.textContent = state.online ? "ESP32 online" : "ESP32 offline";
  lastSeen.textContent = state.lastSeen
    ? new Date(state.lastSeen).toLocaleString()
    : "Never";
  setDisabled(busy || !state.online || state.pending || cooling);
  if (!busy) {
    if (state.pending)
      message(
        (state.pendingKind === "hold"
          ? "A force shutdown is queued for the ESP32."
          : "A power pulse is queued for the ESP32.") +
          (cooling ? " Next command available in " + remaining + "s." : ""),
      );
    else if (!state.online)
      message("ESP32 is offline. Check its power and Wi-Fi.");
    else if (cooling) message("Next command available in " + remaining + "s.");
    else message("ESP32 is online and ready.");
  }
}
async function refresh() {
  try {
    const response = await fetch("/app/api/state", { cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!response.ok) throw new Error("Status unavailable");
    latestState = await response.json();
    renderState(latestState);
  } catch {
    latestState = null;
    pill.className = "pill offline";
    statusText.textContent = "Status unavailable";
    setDisabled(true);
    message("Cannot reach the control service.", true);
  }
}
async function sendAction(kind) {
  if (busy || boot.disabled || hold.disabled) return;
  const confirmation =
    kind === "hold"
      ? "Hold the PC power button for 5 seconds? This forces shutdown and can lose unsaved work. Continue?"
      : "Press the PC power button for 0.5 seconds? This may turn the PC on or initiate shutdown. Continue?";
  if (!window.confirm(confirmation)) return;
  busy = true;
  latestState = null;
  setDisabled(true);
  message("Sending request...");
  try {
    const response = await fetch(kind === "hold" ? "/app/api/hold" : "/app/api/boot", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: "{}",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    message(
      kind === "hold"
        ? "Force shutdown queued. Waiting for the ESP32 to hold the button."
        : "Power pulse queued. Waiting for the ESP32.",
    );
  } catch (error) {
    message(error.message, true);
  } finally {
    busy = false;
    setTimeout(refresh, 1200);
  }
}
boot.addEventListener("click", () => sendAction("pulse"));
hold.addEventListener("click", () => sendAction("hold"));
refresh();
setInterval(() => { if (latestState && !busy) renderState(latestState); }, 1000);
setInterval(refresh, 3000);
`;
