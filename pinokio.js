const version = "v0.6.0"
const releaseBase = `https://github.com/ekzhang/bore/releases/download/${version}`

function releaseAsset(kernel) {
  const targets = {
    darwin: {
      x64: "x86_64-apple-darwin.tar.gz",
      arm64: "aarch64-apple-darwin.tar.gz"
    },
    linux: {
      x64: "x86_64-unknown-linux-musl.tar.gz",
      arm64: "aarch64-unknown-linux-musl.tar.gz"
    },
    win32: {
      x64: "x86_64-pc-windows-msvc.zip"
    }
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
  const unpack = kernel.platform === "win32"
    ? `tar -xf "${archivePath}" -C "${ctx.dirname}"`
    : `tar -xzf "${archivePath}" -C "${ctx.dirname}"`

  return [{
    method: "fs.download",
    params: {
      url: `${releaseBase}/${archive}`,
      path: archivePath
    }
  }, {
    method: "shell.run",
    params: {
      message: unpack,
      path: ctx.dirname
    }
  }, {
    method: "fs.rm",
    params: {
      path: archivePath
    }
  }]
}

const binary = (kernel) => kernel.platform === "win32" ? "bore.exe" : "bore"

module.exports = {
  version: "8.0",
  title: "Bore Auto-Tunnel",
  description: "Tunnels every running Pinokio app automatically to bore.pub with no manual port input.",
  link: "https://github.com/ekzhang/bore",
  icon: "fa-solid fa-satellite-dish",
  menu: [{
    icon: "fa-solid fa-rocket",
    text: "Start auto-tunnel",
    href: "/plugin/run"
  }, {
    icon: "fa-solid fa-stop",
    text: "Stop auto-tunnel",
    href: "/plugin/stop"
  }],

  installed: async (kernel, info, ctx) => {
    const b = binary(kernel)
    return await kernel.exists(__dirname, b)
  },

  install: async (kernel, info, ctx) => installSteps(kernel, ctx),
  update: async (kernel, info, ctx) => installSteps(kernel, ctx),
  uninstall: async (kernel, info, ctx) => [{
    method: "fs.rm",
    params: {
      path: `${ctx.dirname}/${binary(kernel)}`
    }
  }],

  stop: async (kernel) => {
    return [{
      method: "shell.run",
      params: {
        message: "pkill -f 'bore.*local.*:[0-9]' 2>/dev/null; pkill -f bore-pinokio-auto 2>/dev/null; echo stopped",
        path: __dirname
      }
    }]
  },

  run: async (kernel, info, ctx) => {
    const b = `"${ctx.dirname}/${binary(kernel)}"`
    // Auto-tunnel script: watch Pinokio's running processes/ports and start bore for each HTTP service
    const script = `cat > "${ctx.dirname}/bore-pinokio-auto.sh" << 'SCRIPT'
#!/bin/bash
SERVER="\${BORE_SERVER:-bore.pub}"
SECRET="\${BORE_SECRET:-}"
BORE_BIN="$b"
LOG="/tmp/bore-auto.log"
declare -A TUNNELED
echo "[$(date)] bore-auto started server=$SERVER" >> $LOG
while true; do
  # Find listening TCP ports that look like web apps (skip bore, ssh, nginx)
  for port in $(ss -Htnlp 2>/dev/null | awk '{print $4}' | grep -oE ':[0-9]+$' | tr -d ':' | grep -vE '^(22|53|3000|3001|3002|10032)$' | sort -u); do
    # Check if already tunneling
    if [ -n "\${TUNNELED[$port]:-}" ]; then
      # still running?
      if kill -0 \${TUNNELED[$port]} 2>/dev/null; then
        continue
      else
        unset TUNNELED[$port]
      fi
    fi
    # Skip if nothing actually listening
    ss -Htnlp 2>/dev/null | grep -q ":$port " || continue
    echo "[$(date)] tunneling port $port" >> $LOG
    if [ -n "$SECRET" ]; then
      BORE_SERVER=$SERVER BORE_SECRET=$SECRET $BORE_BIN local $port --local-host 127.0.0.1 >> $LOG 2>&1 &
    else
      BORE_SERVER=$SERVER $BORE_BIN local $port --local-host 127.0.0.1 >> $LOG 2>&1 &
    fi
    TUNNELED[$port]=$!
    sleep 2
  done
  sleep 5
done
SCRIPT
chmod +x "${ctx.dirname}/bore-pinokio-auto.sh"
"${ctx.dirname}/bore-pinokio-auto.sh"
`

    return [{
      method: "input",
      params: {
        title: "Bore Auto-Tunnel",
        description: "Start auto-tunneling all running app ports to bore.pub",
        form: [{
          key: "server",
          title: "Bore server",
          default: "bore.pub"
        }, {
          key: "secret",
          title: "Shared secret (optional)"
        }]
      }
    }, {
      method: "shell.run",
      params: {
        message: script,
        path: ctx.dirname,
        env: {
          BORE_SERVER: "{{input.server}}",
          BORE_SECRET: "{{input.secret}}"
        },
        input: true
      }
    }]
  }
}
