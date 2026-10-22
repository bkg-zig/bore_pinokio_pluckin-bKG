# Bore Tunnel for Pinokio

This global Pinokio plugin exposes a TCP port from the selected app or workspace through [Bore](https://github.com/ekzhang/bore).

## Use

1. Install the plugin from Pinokio's Plugins page.
2. Choose **Open in** for the app or workspace whose service is already running.
3. Enter that service's local port. Keep the tunnel terminal running while the service is in use.
4. The default server is the local Bore server at `127.0.0.1`; enter a different server hostname/IP to use another Bore deployment. Enter the matching shared secret if the server requires one.
5. Give the tunnel a name. When Bore reports its assigned port, Pinokio registers it in **Home Server → This machine routes** using that name and port.
6. For a web app, the Home Server entry can be opened in a browser. The Home Server web routes are for HTTP services; raw TCP tunnels will still appear as routes but are not browser pages.

The app must be listening on the same machine as Pinokio. Bore forwards raw TCP traffic and does not add TLS encryption. Use a private self-hosted server and Bore's shared secret when the tunnel should not be publicly reachable.

## Supported binaries

The plugin installs the upstream Bore v0.6.0 binary for Windows x64, macOS x64/ARM64, and Linux x64/ARM64. Update downloads the same pinned release; change the `version` constant in `pinokio.js` when adopting a newer upstream release.
