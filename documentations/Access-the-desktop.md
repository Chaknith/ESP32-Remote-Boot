# Access the desktop and Jupyter Lab

This guide picks up after the ESP32 has turned on the desktop. It lets you access the desktop's Jupyter Lab on your laptop, even when the laptop and desktop are on different networks.

```text
Laptop browser -> SSH tunnel over Tailscale -> Jupyter on desktop
```

The desktop in this guide runs Windows. Tailscale connects the two computers privately; Windows OpenSSH Server provides SSH. You do not need a router port forward or a public IP address.

## One-time setup on the desktop

1. [Install Tailscale for Windows](https://tailscale.com/docs/install/windows), sign in, and connect the desktop to your tailnet. Install Tailscale on the laptop too, and sign in to the **same tailnet**.
2. Install OpenSSH on both the laptop and desktop. You can first check if you already got OpenSSH installed:

```powershell
Get-Service sshd
```

3. Install Jupyter Notebook on the desktop in the Python environment you plan to use. If you use a virtual environment or Conda, remember how to activate it from a terminal.

> **Windows note:** Tailscale's built-in SSH server does not run on Windows. Use Windows OpenSSH Server with Tailscale as the private network, as shown here. When SSH asks for a password, enter your Windows account password, not your Windows Hello PIN.

## Each time you want to use Jupyter

To connect to the deskop you would need desktop's ip address on TailScale console (usually start with `100.`) and the Windows username with `$env:USERNAME`.

1. Turn on the desktop using the Remote Boot website. Wait for Windows and Tailscale to start. On the laptop, check reachability:

```powershell
tailscale ping 100.x.y.z
```

2. In a **laptop** terminal, start an SSH session that forwards the laptop's local port 8888 to the desktop's local port 8888. Replace `WINDOWS_USER` and `100.x.y.z` with the values from the setup step:

   ```powershell
   ssh -o ExitOnForwardFailure=yes -L 127.0.0.1:8888:127.0.0.1:8888 WINDOWS_USER@100.x.y.z
   ```

   On the first connection, check the SSH host fingerprint before accepting it. Enter the desktop's Windows account password when prompted. Keep this terminal open; the SSH connection carries the Jupyter traffic.

3. In the **desktop shell opened by SSH**, activate your Jupyter Python environment if needed, then run:

   ```powershell
   jupyter lab --no-browser --ip=127.0.0.1 --port=8888
   ```

   Leave Jupyter running. It will print a URL containing a login token, such as `http://127.0.0.1:8888/tree?token=...`. If it starts on a different port, stop it and free port 8888, or change **both** port numbers in the SSH command to match.

4. Open the printed URL in the **laptop's browser**. The browser connects to `127.0.0.1:8888` on the laptop; SSH carries that connection through Tailscale to Jupyter on the desktop. Keep the token private.

When finished, close the browser tab, press **Ctrl+C** in the terminal running Jupyter, then type `exit` to close SSH. The SSH tunnel also closes if that terminal is closed.

## References

- [Tailscale: run unattended on Windows](https://tailscale.com/docs/how-to/run-unattended)
- [Microsoft: install OpenSSH Server on Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse)
- [Tailscale: SSH over Tailscale](https://tailscale.com/docs/reference/ssh-over-tailscale)
- [Jupyter Server security](https://jupyter-server.readthedocs.io/en/stable/operators/security.html)
