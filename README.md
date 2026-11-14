# ESP32 Remote Boot

Private, internet-accessible power-button control for one PC. A Cloudflare Access email code protects the website. An ESP32 polls a separate device endpoint over HTTPS and closes a relay for 500 ms when you request a power-button pulse.

## How it works

```text
Browser → Cloudflare Access → remote-boot-site Worker → Durable Object
                                                       ↑
ESP32 → HTTPS + device token → remote-boot-device Worker ┘
                                              │
                                              └→ relay across PC power-button pins
```

The two Workers share one strongly consistent Durable Object. Commands expire after 90 seconds, and the service enforces two minutes between requests. The ESP32 stores the last command ID in flash *before* pulsing, so a lost acknowledgement does not cause the same command to pulse twice. The dashboard reports whether the ESP32 is online and whether a command was acknowledged; it cannot detect the PC's actual power state. A pulse sent while the PC is on may initiate shutdown depending on its operating-system settings.

## Cloudflare setup

You need a Cloudflare account, Node.js, and npm. Cloudflare's free Workers and Durable Objects tiers are sufficient for the default 10-second device poll interval. A purchased domain is optional; each Worker gets a `workers.dev` URL. This project does **not** require GitHub Pages or Google OAuth.

1. Run `npm install` and `npx wrangler login` in the repository root.
2. Run `npm run deploy:device` first. Copy the resulting `https://remote-boot-device.<your-subdomain>.workers.dev` URL for the firmware.
3. Generate a random device token of at least 32 bytes. In PowerShell, run `$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''`. Save the result privately.
4. Run `npx wrangler secret put DEVICE_TOKEN -c wrangler.device.jsonc` and paste the token at the hidden prompt.
5. Run `npm run deploy:site`, then `npx wrangler secret put ALLOWED_EMAIL -c wrangler.site.jsonc` and enter the one email address that may use the website. The site returns HTTP 403 until Access is configured.
6. In Cloudflare Zero Trust, enable **One-time PIN** as a login method. For the `remote-boot-site` Worker, open **Access → Protect this Worker behind Access**, choose **All traffic**, and allow only that same email address. Set the session duration you prefer. Do **not** put `remote-boot-device` behind Access; its device token protects its two endpoints.
7. Open the `remote-boot-site` URL. Cloudflare should ask for your email code. After signing in, the dashboard should show **ESP32 offline** until you flash the firmware.

The site Worker also checks Cloudflare's authenticated Access identity and the configured email on every request. If Access is missing, it returns 403. The device Worker has no browser login and accepts only the matching device token. Keep the device token and Wi-Fi credentials out of Git.

This repository can be public: the real token, Wi-Fi settings, and owner email belong only in local ignored files or Cloudflare secrets. Before pushing changes, check `git status` and `git diff --cached` for accidental credentials. Do not force-add local secret files. If a real secret is ever pushed, rotate it; deleting the file in a later commit does not remove it from Git history.

## ESP32 firmware

The firmware uses ESP-IDF 5.x and targets a standard ESP32 development board. Copy `firmware/main/secrets.h.example` to `firmware/main/secrets.h` and set Wi-Fi credentials, the device Worker URL, the same device token, and the relay GPIO and active level for your hardware. The example uses GPIO 26 and an active-low relay. The firmware verifies HTTPS certificates using ESP-IDF's root certificate bundle; it never disables TLS verification.

From an ESP-IDF terminal, change to the `firmware` directory and run:

```text
idf.py set-target esp32
idf.py build
idf.py -p COM_PORT flash monitor
```

Replace `COM_PORT` with your ESP32's serial port. The firmware waits for Wi-Fi and clock sync before connecting, polls every 10 seconds, and reconnects after Wi-Fi loss.

### Wiring

- Connect the relay module's **normally-open dry contacts** across the motherboard's two **power switch** header pins, in parallel with the case power button. Do not switch the PC's AC mains supply.
- Connect the relay input to the configured ESP32 GPIO and the module's power and ground according to its voltage requirements. Check that the relay input is safe for a 3.3 V ESP32 GPIO. Some modules need a transistor or level shifter.
- An active-low relay can briefly trigger during ESP32 reset if its input floats. Use a suitable external pull-up or a relay board with a safe default state, then test the relay without the PC connected before attaching the motherboard pins.

## Development and checks

Run `npm test` for Worker logic tests. Run `npm run dev` for local Worker development; the site configuration simulates an authenticated owner at `http://localhost:8787`. Local simulation does **not** test the production Access policy or real hardware. The site will still need `ALLOWED_EMAIL` in a local `.dev.vars` file to pass its explicit email check; use `ALLOWED_EMAIL=owner@example.com` there. Never commit `.dev.vars`.

## Operational limits

This is a single-PC power-button controller. It does not include actual PC power-state sensing, remote shutdown logic, or firmware update over the air. If the ESP32 is offline, the website refuses new commands. If an acknowledgement is lost, the ESP32 may have pulsed the relay even though the site does not show it as acknowledged; avoid repeatedly pressing the button until you verify the PC state.
