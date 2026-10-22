# Bore Auto-Tunnel for Pinokio

Automatically tunnels **every running Pinokio app** to [bore.pub](https://bore.pub) with zero manual port entry.

## How it works

1. Install the plugin in Pinokio
2. Click **Start auto-tunnel** from the plugin menu
3. As soon as you install and run any Pinokio app, its local web port gets a public `bore.pub:<port>` tunnel automatically
4. Stop with **Stop auto-tunnel**

The plugin watches listening TCP sockets every 5 seconds and launches `bore local <port>` for each new app port. It skips the main Pinokio ports (3000/3001/3002) and SSH.

## Config

- **Bore server** – defaults to `bore.pub`
- **Shared secret** – only needed if using a private bore server

Logs go to `/tmp/bore-auto.log`

## Supported platforms

Windows x64, macOS x64/ARM64, Linux x64/ARM64 (bore v0.6.0)
