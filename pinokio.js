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

module.exports = {
  version: "7.0",
  title: "Bore Tunnel",
  description: "Expose a running app's local TCP port through a Bore tunnel.",
  link: "https://github.com/ekzhang/bore",
  path: "plugin",
  launch_type: "terminal",

  installed: async (kernel, info, ctx) => {
    const binary = kernel.platform === "win32" ? "bore.exe" : "bore"
    return await kernel.exists(ctx.dirname, binary)
  },

  install: async (kernel, info, ctx) => installSteps(kernel, ctx),
  update: async (kernel, info, ctx) => installSteps(kernel, ctx),
  uninstall: async (kernel, info, ctx) => [{
    method: "fs.rm",
    params: {
      path: `${ctx.dirname}/${kernel.platform === "win32" ? "bore.exe" : "bore"}`
    }
  }],

  run: async (kernel) => {
    const binary = kernel.platform === "win32"
      ? `"{{dirname}}\\bore.exe"`
      : `"{{dirname}}/bore"`
    const message = `${binary} local {{local.port}}`

    return [{
      method: "input",
      params: {
        title: "Bore Tunnel",
        form: [{
          key: "port",
          title: "Local app port"
        }, {
          key: "server",
          title: "Bore server",
          default: "127.0.0.1"
        }, {
          key: "name",
          title: "Name shown in Home Server",
          default: "Bore Tunnel"
        }, {
          key: "secret",
          title: "Shared secret (optional)"
        }]
      }
    }, {
      method: async (req) => {
        const port = String(req.input.port || "").trim()
        const server = String(req.input.server || "").trim()
        const name = String(req.input.name || "Bore Tunnel").trim()
        const secret = String(req.input.secret || "")
        if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
          throw new Error("Enter a local TCP port from 1 to 65535.")
        }
        if (!/^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])$/.test(server)) {
          throw new Error("Enter the Bore server hostname or IP address without a port.")
        }
        return { port, server, name: name || "Bore Tunnel", secret }
      }
    }, {
      method: "local.set",
      params: {
        port: "{{input.port}}",
        server: "{{input.server}}",
        name: "{{input.name}}",
        secret: "{{input.secret}}"
      }
    }, {
      when: "{{!local.secret}}",
      method: "shell.run",
      params: {
        message,
        path: "{{args.cwd}}",
        env: {
          BORE_SERVER: "{{local.server}}"
        },
        on: [{ event: "/listening at .+:(\\d+)/", done: true }],
        input: true
      }
    }, {
      when: "{{local.secret}}",
      method: "shell.run",
      params: {
        message,
        path: "{{args.cwd}}",
        env: {
          BORE_SERVER: "{{local.server}}",
          BORE_SECRET: "{{local.secret}}"
        },
        on: [{ event: "/listening at .+:(\\d+)/", done: true }],
        input: true
      }
    }, {
      method: "proxy.start",
      params: {
        uri: "http://{{local.server}}:{{input.event[1]}}",
        name: "{{local.name}} · {{input.event[1]}}"
      }
    }]
  }
}
