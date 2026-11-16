# Access JupyterLab on the desktop

After Remote Boot turns on your Windows desktop, you can use JupyterLab from a laptop on another network:

```text
Laptop browser -> local SSH tunnel -> Tailscale -> Windows desktop -> JupyterLab
```

Tailscale connects the computers privately. Windows OpenSSH Server accepts the SSH connection, and the tunnel carries JupyterLab traffic. JupyterLab can run directly in Windows or inside WSL. You do not need a public IP address or router port forwarding.

## One-time setup

1. **Connect both computers to Tailscale.** [Install Tailscale](https://tailscale.com/docs/install/windows) on the desktop and laptop, and sign in to the same tailnet. On the desktop, right-click the Tailscale tray icon and select **Preferences → Run unattended**. Confirm it is checked. This keeps the desktop reachable after a restart, before anyone signs in locally.

2. **Install OpenSSH Server on the desktop.** In **PowerShell as Administrator** on the desktop, check whether it is installed:

   ```powershell
   Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   ```

   If the state is `NotPresent`, install it:

   ```powershell
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   ```

3. **Start SSH now and at every boot.** In the same administrator PowerShell window, run:

   ```powershell
   Start-Service sshd
   Set-Service -Name sshd -StartupType Automatic
   Get-Service sshd | Select-Object Status, StartType
   Get-NetFirewallRule -Name OpenSSH-Server-In-TCP
   ```

   The service should show `Running` and `Automatic`, and the firewall rule should be enabled. OpenSSH Server normally adds the Windows firewall rule for TCP port 22 during installation.

4. **Check the laptop's SSH client.** In a laptop terminal, run `ssh -V`. If the command is missing on Windows, install the **OpenSSH Client** optional feature. The laptop needs the client; only the desktop needs the SSH server and `sshd` service.

5. **Install JupyterLab where you will run it.** Use your preferred Python environment on the desktop, either in Windows or WSL. Check that `jupyter lab --version` works **in that environment**. If you use a virtual environment or Conda, activate it before starting JupyterLab each time.

6. **Record the desktop's address, username, and SSH fingerprint.** On the desktop, `tailscale ip -4` gives its Tailscale IPv4 address (usually `100.x.y.z`), and `$env:USERNAME` in PowerShell gives the Windows username. You can also find the address in the Tailscale Machines page. After starting `sshd`, run `ssh-keygen -lf C:\ProgramData\ssh\ssh_host_ed25519_key.pub` on the desktop and save the fingerprint for comparison on the first laptop connection.

> Tailscale's built-in SSH server does not run on Windows. This setup uses **Windows OpenSSH Server over Tailscale**.

## Connect and open JupyterLab

1. Turn on the desktop with the Remote Boot website. Wait for Windows and Tailscale to start. From the laptop, check that Tailscale can reach it:

   ```powershell
   tailscale ping 100.x.y.z
   ```

2. On the **laptop**, open an SSH session and forward port 8888. Replace `WINDOWS_USER` and `100.x.y.z` with your desktop's values:

   ```powershell
   ssh -o ExitOnForwardFailure=yes -L 127.0.0.1:8888:127.0.0.1:8888 WINDOWS_USER@100.x.y.z
   ```

   The first `127.0.0.1:8888` is on the laptop; the second is on the desktop. Compare the SSH host fingerprint with the one recorded on the desktop before accepting it the first time. Keep this terminal open while using JupyterLab. Use the **Windows account password**, not a Windows Hello PIN, when SSH prompts for a password.

3. In the **desktop shell opened by SSH**, start JupyterLab from the environment that contains it:
   - **JupyterLab installed in Windows:** Activate the Windows Python environment if needed, then run:

     ```text
     jupyter lab --no-browser --ip=127.0.0.1 --port=8888 --ServerApp.port_retries=0
     ```

   - **JupyterLab installed in WSL:** Run `wsl` to enter your default Linux distribution. Activate the Linux Python environment if needed, then run the same `jupyter lab` command above **inside WSL**. With WSL's normal localhost forwarding, Windows can reach a JupyterLab server running on WSL's `127.0.0.1:8888`.

   JupyterLab will print a URL containing a token, such as `http://127.0.0.1:8888/lab?token=...`. Keep the token private. The port-retry setting makes startup fail clearly if port 8888 is already occupied, rather than silently switching to another port.

4. Open the printed `http://127.0.0.1:8888/...` URL in the **laptop's browser**. The SSH tunnel carries the browser connection to JupyterLab on the desktop. The browser's `127.0.0.1` refers to the laptop.

When finished, press **Ctrl+C** in the terminal running JupyterLab, then type `exit` to close SSH. If you entered WSL, type `exit` once to leave WSL and a second time to leave SSH. This ends the tunnel; it does not stop the desktop's SSH service.

## Stop SSH from starting automatically

If you no longer want to accept SSH connections, run these commands in **PowerShell as Administrator on the desktop**:

```powershell
Stop-Service sshd
Set-Service -Name sshd -StartupType Manual
```

## References

- [Tailscale: run unattended on Windows](https://tailscale.com/docs/how-to/run-unattended)
- [Tailscale: SSH feature support](https://tailscale.com/docs/features/tailscale-ssh)
- [Microsoft: install OpenSSH Server and Client](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse)
- [Microsoft: access WSL apps from Windows](https://learn.microsoft.com/en-us/windows/wsl/networking)
- [JupyterLab: starting and URL format](https://jupyterlab.readthedocs.io/en/stable/getting_started/starting.html)
- [Jupyter Server: token security](https://jupyter-server.readthedocs.io/en/stable/operators/security.html)
