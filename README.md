# ESP32 Remote Boot

Private, internet-accessible power-button control for one PC. A Cloudflare Access email code protects the website. An ESP32 opens an outbound, authenticated WebSocket to a separate device Worker and closes a relay for a short power-button pulse or a fixed five-second force-shutdown hold.

## How it works

```text
Browser → Cloudflare Access → remote-boot-site Worker → Durable Object
                                                       ↑
ESP32 ↔ WSS + device token ↔ remote-boot-device Worker ┘
                                              │
                                              └→ relay across PC power-button pins
```

The two Workers share one strongly consistent Durable Object. The ESP32 starts the WebSocket connection from behind the home router. The device Worker pushes a command over that connection and receives an acknowledgement over the same connection. Commands expire after 90 seconds, and the service enforces ten seconds between requests. If the connection drops before an acknowledgement, the pending command is sent again on reconnect until it expires. The ESP32 stores the last command ID in flash *before* actuating the relay, so a repeated command does not repeat the relay action. The dashboard reports whether the ESP32 is connected and whether a command was acknowledged; it cannot detect the PC's actual power state. A short pulse may turn on the PC or initiate shutdown depending on its current state and operating-system settings. A five-second hold can force an unresponsive PC off and may lose unsaved work. The website asks for confirmation before either command.

## Cloudflare setup

You need a Cloudflare account, Node.js, and npm. A purchased domain is optional; each Worker gets a `workers.dev` URL. This project does **not** require GitHub Pages or Google OAuth. Check Cloudflare's current Workers and Durable Objects limits for your expected use.

1. Run `npm install` and `npx wrangler login` in the repository root.
2. Run `npm run deploy:device` first. Copy the resulting `https://remote-boot-device.<your-subdomain>.workers.dev` URL for the firmware.
3. Generate a random device token of at least 32 bytes. In PowerShell, run `$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''`. Save the result privately.
4. Run `npx wrangler secret put DEVICE_TOKEN -c wrangler.device.jsonc` and paste the token at the hidden prompt.
5. Run `npm run deploy:site`, then `npx wrangler secret put ALLOWED_EMAIL -c wrangler.site.jsonc` and enter the one email address that may use the website. The site returns HTTP 403 until Access is configured.
6. In Cloudflare Zero Trust, enable **One-time PIN** as a login method. For the `remote-boot-site` Worker, open **Access → Protect this Worker behind Access**, choose **All traffic**, and allow only that same email address. Set the session duration you prefer. Do **not** put `remote-boot-device` behind Access; its device token protects its WebSocket endpoint.
7. Open the `remote-boot-site` URL. Cloudflare should ask for your email code. After signing in, the dashboard should show **ESP32 offline** until you flash the firmware.

The site Worker also checks Cloudflare's authenticated Access identity and the configured email on every request. If Access is missing, it returns 403. The device Worker has no browser login and accepts only the matching device token. Keep the device token and Wi-Fi credentials out of Git.

This repository can be public: the real token, Wi-Fi settings, and owner email belong only in local ignored files or Cloudflare secrets. Before pushing changes, check `git status` and `git diff --cached` for accidental credentials. Do not force-add local secret files. If a real secret is ever pushed, rotate it; deleting the file in a later commit does not remove it from Git history.

## ESP32 firmware

The firmware uses ESP-IDF 6.1 and targets the 4 MB flash ESP32 board identified in the boot log. `sdkconfig.defaults` and `partitions.csv` give the application a 2 MB partition for the WebSocket component. Copy `firmware/main/secrets.h.example` to `firmware/main/secrets.h` and set Wi-Fi credentials, the device Worker URL, the same device token, and the relay GPIO and active level for your hardware. The example uses GPIO 26 and an active-low relay. Keep `DEVICE_URL` as the HTTPS Worker base URL; the firmware converts it to `wss://.../connect`. The firmware verifies the WebSocket server certificate using ESP-IDF's root certificate bundle; it never disables TLS verification. The ESP-IDF component manager downloads `espressif/esp_websocket_client` during the build.

From an ESP-IDF terminal, change to the `firmware` directory and run:

```text
idf.py set-target esp32
idf.py build
idf.py -p COM_PORT flash monitor
```

Replace `COM_PORT` with your ESP32's serial port. The firmware waits for Wi-Fi and clock sync, then opens the WebSocket. It sends an application heartbeat every 30 seconds and reconnects after Wi-Fi loss.

This is a protocol change: the old firmware's `/poll` and `/ack` endpoints are removed. The existing ignored `firmware/sdkconfig` must use 4 MB flash and the custom `partitions.csv` table; reconfigure it if you have an older 2 MB setting. Flash the new firmware and deploy the device Worker in the same maintenance window, then deploy the site Worker. The dashboard will show the device offline until both firmware and device Worker have been updated. Keep the relay contacts disconnected from the PC while testing the update.

### Wiring

- Connect the relay module's **normally-open dry contacts** across the motherboard's two **power switch** header pins, in parallel with the case power button. Do not switch the PC's AC mains supply.
- Connect the relay input to the configured ESP32 GPIO and the module's power and ground according to its voltage requirements. Check that the relay input is safe for a 3.3 V ESP32 GPIO. Some modules need a transistor or level shifter.
- An active-low relay can briefly trigger during ESP32 reset if its input floats. Use a suitable external pull-up or a relay board with a safe default state, then test the relay without the PC connected before attaching the motherboard pins.

### Website controls

- **Send power pulse** closes the relay for `RELAY_PULSE_MS` (500 ms in the example).
- **Force shutdown (hold 5 seconds)** closes the same relay for a fixed 5,000 ms. Use it only when the PC is unresponsive; it can lose unsaved work. The relay module must be rated to remain energized for at least five seconds.
- Both controls require confirmation in the browser and share the same ten-second cooldown, shown as a countdown on the dashboard. The server also requires the signed-in owner, the same origin, and a recently online ESP32. The PC's actual power state is not measured, so check it before using either control.

## Development and checks

Run `npm test` for Worker logic tests. Run `npm run dev` for local Worker development. The single local Worker serves the dashboard at `http://localhost:8787` and the device WebSocket at `/device/connect`, sharing one local Durable Object. Put `ALLOWED_EMAIL=owner@example.com` and a separate test `DEVICE_TOKEN` in the ignored `.dev.vars` file. The local configuration simulates the owner identity; it does **not** test the production Access policy. Never commit `.dev.vars`.

For a real ESP32 on the same Wi-Fi as the development PC, run `npm run dev -- --ip YOUR_PC_LAN_IP` (for example, `192.168.0.41`). In the ignored `firmware/main/secrets.h`, set `DEVICE_URL` to `http://YOUR_PC_LAN_IP:8787/device` without a trailing slash and set `ALLOW_INSECURE_LOCAL_WS` to `1`. Put the same separate test `DEVICE_TOKEN` in `secrets.h` and `.dev.vars`, then rebuild and flash the ESP32. Open the dashboard at `http://YOUR_PC_LAN_IP:8787/`. The PC firewall must allow TCP port 8787 from the ESP32. This LAN test mode sends the token and commands without encryption; use it only on a trusted network, then restore HTTPS and set the flag to `0` before deployment. Disconnect the relay contacts from the PC while testing.

For a remote test, expose only the `/device/*` route through a path-restricted HTTPS tunnel, set `DEVICE_URL` to that tunnel's HTTPS base URL plus `/device`, and flash with the matching local test token. Do not expose the rest of the local Worker through the tunnel: the development dashboard has simulated authentication. A plain quick tunnel exposes the entire local server and is unsuitable for this hardware test.

## Operational limits

This is a single-PC power-button controller. It does not include actual PC power-state sensing, operating-system shutdown, or firmware update over the air. If the ESP32 is offline, the website refuses new commands. If an acknowledgement is lost, the ESP32 may have actuated the relay even though the site does not show it as acknowledged; avoid repeatedly pressing a button until you verify the PC state.
