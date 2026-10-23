const fs = require("fs")
const path = require("path")
const os = require("os")

const version = "v0.6.0"
const releaseBase = `https://github.com/ekzhang/bore/releases/download/${version}`

const binary = (kernel) => (kernel.platform === "win32" ? "bore.exe" : "bore")

function releaseAsset(kernel) {
  const targets = {
    darwin: {
      x64: "x86_64-apple-darwin.tar.gz",
      arm64: "aarch64-apple-darwin.tar.gz",
    },
    linux: {
      x64: "x86_64-unknown-linux-musl.tar.gz",
      arm64: "aarch64-unknown-linux-musl.tar.gz",
    },
    win32: {
      x64: "x86_64-pc-windows-msvc.zip",
    },
  }
  const suffix = targets[kernel.platform]?.[kernel.arch]
  if (!suffix) {
    throw new Error(`Bore ${version} has no supported binary for ${kernel.platform}/${kernel.arch}.`)
  }
  return `bore-${version}-${suffix}`
}

function installSteps(kernel, ctx) {
  const archive = releaseAsset(kernel)
  const archivePath = `${ctx.dirname}/${archive}`
  const unpack =
    kernel.platform === "win32"
      ? `tar -xf "${archivePath}" -C "${ctx.dirname}"`
      : `tar -xzf "${archivePath}" -C "${ctx.dirname}"`

  return [
    { method: "fs.download", params: { url: `${releaseBase}/${archive}`, path: archivePath } },
    { method: "shell.run", params: { message: unpack, path: ctx.dirname } },
    { method: "fs.rm", params: { path: archivePath } },
  ]
}

// ---------------------------------------------------------------------------
// Dashboard state
//
// bore.pub assigns a random public port on every launch, so the URL cannot be
// hard-coded anywhere. Instead every tunnel writes a small JSON file into
// $PINOKIO_HOME/tunnels/ and this menu reads them on each page load.
// ---------------------------------------------------------------------------
function tunnelDir() {
  const home = process.env.PINOKIO_HOME || path.join(os.homedir(), ".pinokio")
  return path.join(home, "tunnels")
}

function readTunnels() {
  const dir = tunnelDir()
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch (_) {
    return []
  }

  const out = []
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
      if (!data || !data.url) continue
      if (data.state && data.state !== "live") continue
      out.push(data)
    } catch (_) {
      // half-written file, skip
    }
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

function tunnelMenu() {
  const tunnels = readTunnels()
  if (tunnels.length === 0) {
    return [
      {
        icon: "fa-solid fa-plug-circle-xmark",
        text: "No active tunnels",
        href: "/plugin/run",
      },
    ]
  }

  return tunnels.map((t) => {
    const label = t.kind === "pinokiod" ? "Pinokio (this machine)" : `port ${t.local_port}`
    const lock = t.auth ? " \u{1F512}" : ""
    return {
      icon: "fa-solid fa-arrow-up-right-from-square",
      text: `${label}${lock} \u2192 ${t.url}`,
      href: t.url,
      target: "_blank",
    }
  })
}

module.exports = {
  version: "8.0",
  title: "Bore Auto-Tunnel",
  description: "Tunnels every running Pinokio app to bore.pub and lists the current URLs here.",
  link: "https://github.com/ekzhang/bore",
  icon: "fa-solid fa-satellite-dish",

  // Re-evaluated by pinokiod on every dashboard load, so random ports still show.
  menu: async () => [
    {
      icon: "fa-solid fa-rocket",
      text: "Start auto-tunnel",
      href: "/plugin/run",
    },
    {
      icon: "fa-solid fa-list",
      text: `Live URLs (${readTunnels().length})`,
      menu: tunnelMenu(),
    },
    {
      icon: "fa-solid fa-stop",
      text: "Stop auto-tunnel",
      href: "/plugin/stop",
    },
  ],

  installed: async (kernel, info, ctx) => {
    return await kernel.exists(__dirname, binary(kernel))
  },

  install: async (kernel, info, ctx) => installSteps(kernel, ctx),
  update: async (kernel, info, ctx) => installSteps(kernel, ctx),

  uninstall: async (kernel) => [
    { method: "fs.rm", params: { path: `${__dirname}/${binary(kernel)}` } },
  ],

  stop: async () => [
    {
      method: "shell.run",
      params: {
        message:
          "pkill -f bore-pinokio-auto 2>/dev/null; " +
          "pkill -f 'bore local' 2>/dev/null; " +
          "rm -f \"$HOME/.pinokio/tunnels/app-\"*.json 2>/dev/null; echo stopped",
        path: __dirname,
      },
    },
  ],

  run: async (kernel, info, ctx) => [
    {
      method: "input",
      params: {
        title: "Bore Auto-Tunnel",
        description: "Tunnel every running app port to bore.pub and list the URLs in the dashboard",
        form: [
          { key: "server", title: "Bore server", default: "bore.pub" },
          { key: "secret", title: "Shared secret (optional)" },
        ],
      },
    },
    {
      method: "shell.run",
      params: {
        message: 'BORE_BIN="$(pwd)/' + binary(kernel) + '" bash "$(pwd)/auto-tunnel.sh"',
        path: ctx.dirname,
        env: {
          BORE_SERVER: "{{input.server}}",
          BORE_SECRET: "{{input.secret}}",
        },
        input: true,
      },
    },
  ],
}
