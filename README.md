# Bore Auto-Tunnel for Pinokio

Tunnels every running Pinokio app to [bore.pub](https://bore.pub) and **lists the current URLs in the plugin dashboard**, because bore.pub assigns a random port on every launch.

## Why the dashboard

`bore.pub` is a free public server: each connection gets a new random port, and no flag can pin it. Remembering `http://bore.pub:57835` is pointless — it dies with the process. So this plugin writes every tunnel to `$PINOKIO_HOME/tunnels/*.json` and its menu re-reads those files on each dashboard load:

```
Live URLs (2)
  ├─ Pinokio (this machine) 🔒 → http://bore.pub:57835
  └─ port 7860 → http://bore.pub:61204
```

Click an entry to open it. A 🔒 means the target is behind Basic Auth (see below).

For a URL that never changes, run your own server and point `BORE_SERVER` at it with a fixed `--port`; bore.pub cannot do that.

## Install

1. Install the plugin in Pinokio
2. Click **Start auto-tunnel** from the plugin menu
3. As soon as you install and run any app, its local port gets a public tunnel
4. Stop with **Stop auto-tunnel**

The watcher checks listening sockets every 5 seconds, verifies each port actually answers HTTP, and starts `bore local <port> --local-host 127.0.0.1 --to <server>`. Ports 22/53/7835/3000-3002/42000/42001 are skipped (ssh, dns, bore control, Pinokio's own UI and its auth proxy).

## Config

- **Bore server** – defaults to `bore.pub`
- **Shared secret** – only needed for a private bore server

Logs: `/tmp/bore-auto.log` and `/tmp/bore-<port>.log`

## Security

Apps tunnelled this way are **not** authenticated — the tunnel exposes whatever the app exposes. Pinokio's own UI is protected separately by the Basic Auth proxy in [bkg-zig/bore.pub](https://github.com/bkg-zig/bore.pub), which is why its dashboard entry shows a lock.

## Supported platforms

Windows x64, macOS x64/ARM64, Linux x64/ARM64 (bore v0.6.0).
