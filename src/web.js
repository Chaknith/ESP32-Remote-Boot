export const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="17.446575" fill="#a7f16b"/>
  <path d="M 32,8.103792 V 28 M 20.754317,15.024212 a 20.761262,20.761262 0 1 0 22.491366,0" fill="none" stroke="#10231a" stroke-width="4.32526" stroke-linecap="round"/>
</svg>`;

export const landingHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a1715">
  <title>Remote Boot | Sign in</title>
  <meta name="description" content="Private remote power control for your PC.">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
  <script src="/landing.js" defer></script>
</head>
<body>
  <main class="shell">
    <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 7v24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M19 14.5a25 25 0 1 0 26 0" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></span><span>ESP32 REMOTE BOOT</span></div><a class="header-auth-button" href="/sign-in">Sign in</a></header>
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
  <title>Remote Boot | Control</title>
  <meta name="description" content="Private remote power control for your PC.">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
  <script src="/app/app.js" defer></script>
</head>
<body>
  <main class="shell">
    <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 7v24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M19 14.5a25 25 0 1 0 26 0" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></span><span>ESP32 REMOTE BOOT</span></div><a class="header-auth-button" href="/sign-out">Sign out</a></header>
    <section class="control" aria-label="PC power control">
      <div class="control-head"><div><span class="section-label">DEVICE 01 / PC POWER</span><h2>Power control</h2></div><span id="status-pill" class="pill checking"><span class="dot"></span><span id="status-text">Checking</span></span></div>
      <div class="control-body">
        <div class="action-grid">
          <div class="action-card">
            <button id="boot" class="boot-button" type="button" aria-describedby="boot-description" disabled><span>Press button</span><span aria-hidden="true">↗</span></button>
            <p id="boot-description" class="action-description">Sends a short press to the PC power button. Depending on its current state, this may turn the PC on or start a shutdown.</p>
          </div>
          <div class="action-card">
            <button id="hold" class="boot-button hold-button" type="button" aria-describedby="hold-description" disabled><span>Force shutdown (hold 5 seconds)</span></button>
            <p id="hold-description" class="action-description danger-note">Use only if the PC is unresponsive. Unsaved work may be lost.</p>
          </div>
        </div>
        <p id="feedback" class="feedback" role="status" aria-live="polite">Connecting to your ESP32…</p>
      </div>
      <div class="control-foot"><span>ESP32 last seen</span><time id="last-seen">—</time></div>
    </section>
    <footer><span>REMOTE BOOT / SECURE ACCESS</span><span>Powered by Cloudflare</span></footer>
  </main>
  <dialog id="confirm-dialog" class="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message">
    <span class="section-label">CONFIRM ACTION</span>
    <h2 id="confirm-title"></h2>
    <p id="confirm-message"></p>
    <form method="dialog" class="confirm-actions">
      <button class="confirm-cancel" type="submit" value="cancel">Cancel</button>
      <button id="confirm-accept" class="confirm-accept" type="submit" value="confirm"></button>
    </form>
  </dialog>
</body>
</html>`;

export const css = `
:root {
  color-scheme: dark;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  background: #0a1715;
  color: #eff8f1;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 70% 8%, #173d32 0, transparent 34%), #0a1715;
}
button {
  font: inherit;
}
.shell {
  max-width: 1120px;
  margin: auto;
  padding: 0 40px;
}
.topbar {
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #ffffff24;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  letter-spacing: 0.19em;
  font-weight: 800;
}
.brand-mark {
  width: 33px;
  height: 33px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #a7f16b;
  color: #10231a;
  font-size: 22px;
  line-height: 1;
}
.eyebrow,
.section-label,
footer {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #94a79b;
}
.hero {
  padding: 90px 0 62px;
  max-width: 770px;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 13px;
  color: #a7f16b;
}
.eyebrow-line {
  width: 28px;
  height: 1px;
  background: #a7f16b;
}
h1 {
  font-size: clamp(54px, 8.2vw, 112px);
  line-height: 0.98;
  letter-spacing: -0.07em;
  margin: 24px 0 25px;
  font-weight: 700;
}
h1 em {
  font-style: normal;
  color: #a7f16b;
}
.intro {
  font-size: 18px;
  line-height: 1.65;
  max-width: 570px;
  color: #aabbb0;
  margin: 0;
}
.control {
  border: 1px solid #ffffff25;
  border-radius: 22px;
  background: linear-gradient(145deg, #182b24, #101f1b);
  box-shadow: 0 32px 80px #0005;
  overflow: hidden;
}
.control-head,
.control-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
}
.control-head {
  border-bottom: 1px solid #ffffff17;
}
.section-label {
  color: #a7f16b;
}
h2 {
  font-size: 23px;
  letter-spacing: -0.03em;
  margin: 8px 0 0;
}
.pill {
  border: 1px solid #ffffff2b;
  border-radius: 100px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b1beb5;
  font-size: 12px;
  font-weight: 700;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.pill.online {
  color: #a7f16b;
  border-color: #a7f16b55;
  background: #a7f16b0d;
}
.pill.offline {
  color: #ffad93;
  border-color: #ffad9355;
  background: #ffad930d;
}
.control-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 50px 24px 42px;
}
.boot-button {
  width: min(100%, 330px);
  min-height: 58px;
  border: 0;
  border-radius: 11px;
  background: #a7f16b;
  color: #0d1b14;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 21px;
  cursor: pointer;
  transition:
    transform 0.15s,
    background 0.15s;
}
.boot-button:not(:disabled):hover {
  background: #bdff89;
  transform: translateY(-2px);
}
.boot-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.boot-button span:last-child {
  font-size: 24px;
}
.feedback {
  font-size: 13px;
  color: #aabbb0;
  min-height: 20px;
  margin: 17px 0 0;
}
.feedback.error {
  color: #ffad93;
}
.control-foot {
  border-top: 1px solid #ffffff17;
  color: #9aaca0;
  font-size: 12px;
}
.control-foot time {
  color: #eaf5ec;
  font-variant-numeric: tabular-nums;
}
footer {
  display: flex;
  justify-content: space-between;
  padding: 29px 0 45px;
  font-size: 10px;
}
@media (max-width: 640px) {
  .shell {
    padding: 0 20px;
  }
  .topbar {
    height: 72px;
  }
  .hero {
    padding: 65px 0 48px;
  }
  .intro {
    font-size: 16px;
  }
  .control-head,
  .control-foot {
    padding: 21px;
  }
  .control-body {
    padding: 42px 20px 35px;
  }
  .section-label {
    font-size: 9px;
  }
  h2 {
    font-size: 20px;
  }
  footer {
    gap: 12px;
    flex-wrap: wrap;
  }
}
`;

export const forceCss = `
.control {
  margin-top: 64px;
}
.brand-mark svg {
  width: 20px;
  height: 20px;
}
.control-body {
  padding: 40px 32px 36px;
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  width: 100%;
  max-width: 760px;
  text-align: left;
}
.action-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border: 1px solid #ffffff20;
  border-radius: 16px;
  background: #ffffff06;
}
.action-card .boot-button {
  width: 100%;
  min-height: 64px;
}
.hold-button {
  margin-top: 0;
  background: #442620;
  color: #ffe4da;
  border: 1px solid #e18b72;
}
.hold-button:not(:disabled):hover {
  background: #613329;
}
.action-description {
  font-size: 13px;
  line-height: 1.6;
  color: #aabbb0;
  margin: 0;
}
.action-card .danger-note {
  font-size: 13px;
  color: #d8a89a;
  margin: 0;
  max-width: none;
}
.hold-button span:last-child {
  font-size: 14px;
}
.feedback {
  margin-top: 24px;
}
.confirm-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(92vw, 460px);
  max-height: calc(100vh - 32px);
  padding: 30px;
  border: 1px solid #a7f16b55;
  border-radius: 20px;
  background: linear-gradient(145deg, #1b3027, #101f1b);
  color: #eff8f1;
  box-shadow: 0 24px 80px #000b;
  overflow: auto;
}
.confirm-dialog::backdrop {
  background: #04100dcc;
  backdrop-filter: blur(4px);
}
.confirm-dialog h2 {
  font-size: 27px;
  margin: 14px 0 10px;
}
.confirm-dialog p {
  margin: 0;
  color: #aabbb0;
  font-size: 15px;
  line-height: 1.6;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
}
.confirm-actions button {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}
.confirm-cancel {
  border: 1px solid #ffffff40;
  background: transparent;
  color: #eff8f1;
}
.confirm-cancel:hover {
  background: #ffffff12;
}
.confirm-accept {
  border: 0;
  background: #a7f16b;
  color: #0d1b14;
}
.confirm-accept:hover {
  background: #bdff89;
}
.confirm-accept.danger {
  background: #e18b72;
  color: #26140f;
}
.confirm-accept.danger:hover {
  background: #f5a38b;
}
@media (max-width: 700px) {
  .action-grid {
    grid-template-columns: 1fr;
  }
  .action-card {
    padding: 18px;
  }
}
@media (max-width: 640px) {
  .control {
    margin-top: 32px;
  }
  .control-body {
    padding: 32px 20px;
  }
  .confirm-dialog {
    padding: 24px;
  }
  .confirm-actions {
    flex-direction: column-reverse;
  }
  .confirm-actions button {
    width: 100%;
  }
}
`;

export const landingCss = `
.landing-hero {
  min-height: calc(100vh - 176px);
}
.header-auth-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid #a7f16b;
  border-radius: 9px;
  color: #a7f16b;
  text-decoration: none;
  font-size: 12px;
  font-weight: 700;
}
.header-auth-button:hover {
  background: #a7f16b;
  color: #0d1b14;
}
.sign-in-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(100%, 330px);
  min-height: 58px;
  margin-top: 34px;
  padding: 0 21px;
  border-radius: 11px;
  background: #a7f16b;
  color: #0d1b14;
  text-decoration: none;
  font-weight: 800;
}
.sign-in-button:hover {
  background: #bdff89;
}
.sign-in-button span {
  font-size: 24px;
}
@media (max-width: 640px) {
  .landing-hero {
    min-height: calc(100vh - 145px);
  }
}
`;

export const clientJs = `
const boot = document.getElementById("boot");
const hold = document.getElementById("hold");
const feedback = document.getElementById("feedback");
const pill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const lastSeen = document.getElementById("last-seen");
const confirmDialog = document.getElementById("confirm-dialog");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmAccept = document.getElementById("confirm-accept");
let busy = false;
let latestState = null;
let refreshGeneration = 0;
function message(text, error = false) {
  feedback.textContent = text;
  feedback.classList.toggle("error", error);
}
function setDisabled(disabled) {
  boot.disabled = disabled;
  hold.disabled = disabled;
}
function renderState(state) {
  const remaining = Math.max(0, Math.ceil((state.cooldownDeadline - performance.now()) / 1000));
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
  if (busy) return;
  const generation = ++refreshGeneration;
  try {
    const response = await fetch("/app/api/state", { cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (!response.ok) throw new Error("Status unavailable");
    const state = await response.json();
    if (generation !== refreshGeneration || busy) return;
    state.cooldownDeadline = performance.now() + Math.max(0, state.cooldownRemainingMs || 0);
    latestState = state;
    renderState(latestState);
  } catch {
    if (generation !== refreshGeneration || busy) return;
    latestState = null;
    pill.className = "pill offline";
    statusText.textContent = "Status unavailable";
    setDisabled(true);
    message("Cannot reach the control service.", true);
  }
}
function askConfirmation(kind) {
  const holding = kind === "hold";
  confirmTitle.textContent = holding ? "Force shutdown?" : "Press the power button?";
  confirmMessage.textContent = holding
    ? "Hold the PC power button for 5 seconds? This forces shutdown and can lose unsaved work."
    : "Press the PC power button for 0.5 seconds? This may turn the PC on or initiate shutdown.";
  confirmAccept.textContent = holding ? "Force shutdown" : "Press button";
  confirmAccept.classList.toggle("danger", holding);
  confirmDialog.returnValue = "cancel";
  return new Promise((resolve) => {
    const onClose = () => {
      confirmDialog.removeEventListener("close", onClose);
      resolve(confirmDialog.returnValue === "confirm");
    };
    confirmDialog.addEventListener("close", onClose);
    confirmDialog.showModal();
  });
}
async function sendAction(kind) {
  if (busy || boot.disabled || hold.disabled) return;
  if (!(await askConfirmation(kind))) return;
  ++refreshGeneration;
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
