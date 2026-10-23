#!/usr/bin/env bash
#
# auto-tunnel.sh - tunnel every running Pinokio app through bore.
#
# Only ports owned by Pinokio apps are tunnelled: processes that are
# descendants of pinokiod, or whose cwd / command line lives under
# $PINOKIO_HOME/api. Everything else on the box (ssh, Colab's file shim,
# the datalab web UI, the opencode server, ...) is left alone.
#
# Writes one $PINOKIO_HOME/tunnels/app-<port>.json per tunnel so the plugin
# dashboard can list the current (random) bore.pub URLs.
#
# Env:
#   PINOKIOD_PID  pid of the pinokiod process        (default: none)
#   PINOKIO_HOME  Pinokio state dir                  (default ~/.pinokio)
#   BORE_SERVER   tunnel server                      (default bore.pub)
#   BORE_SECRET   shared secret                      (optional)
#   BORE_BIN      bore binary                        (default bore on PATH)
#   ALLOW_PORTS   extra ports to tunnel regardless   (optional)
#   SKIP_PORTS    ports to never tunnel
#   INTERVAL      poll interval, seconds             (default 5)
#   STATE_DIR     where the JSON state files go
#   LOG           log file
#
set -uo pipefail

SERVER="${BORE_SERVER:-bore.pub}"
SECRET="${BORE_SECRET:-}"
BORE_BIN="${BORE_BIN:-bore}"
INTERVAL="${INTERVAL:-5}"
PINOKIOD_PID="${PINOKIOD_PID:-}"
PINOKIO_HOME="${PINOKIO_HOME:-$HOME/.pinokio}"
APP_ROOT="${APP_ROOT:-$PINOKIO_HOME/api}"
STATE_DIR="${STATE_DIR:-$PINOKIO_HOME/tunnels}"
SKIP_PORTS="${SKIP_PORTS:-22 53 7835 3000 3001 3002 42000 42001}"
ALLOW_PORTS="${ALLOW_PORTS:-}"
LOG="${LOG:-/tmp/bore-auto.log}"

mkdir -p "$STATE_DIR"
PIDFILE="$STATE_DIR/auto-tunnel.pid"
printf '%s\n' "$$" >"$PIDFILE"
declare -A TUNNELED=()
declare -A COOLDOWN=()

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG"; }

skip() {
  local p="$1" s
  for s in $SKIP_PORTS; do [[ "$p" == "$s" ]] && return 0; done
  return 1
}
allowed() {
  local p="$1" s
  for s in $ALLOW_PORTS; do [[ "$p" == "$s" ]] && return 0; done
  return 1
}

# Parent pid map from /proc (bash, no external parsing of comm fields).
declare -A PPIDOF=()
load_ppids() {
  PPIDOF=()
  local f pid key val
  for f in /proc/[0-9]*/status; do
    pid="${f#/proc/}"; pid="${pid%/status}"
    while read -r key val _; do
      if [[ "$key" == "PPid:" ]]; then PPIDOF[$pid]="$val"; break; fi
    done <"$f" 2>/dev/null
  done
}

# Is pid a descendant of $PINOKIOD_PID?
declare -A CACHE_DESC=()
is_descendant() {
  local pid="$1" cur="$1" hops=0
  [[ -n "$PINOKIOD_PID" ]] || return 1
  [[ -n "${CACHE_DESC[$pid]:-}" ]] && return "${CACHE_DESC[$pid]}"
  while [[ -n "${PPIDOF[$cur]:-}" && "$cur" != "1" && $hops -lt 40 ]]; do
    if [[ "$cur" == "$PINOKIOD_PID" ]]; then CACHE_DESC[$pid]=0; return 0; fi
    cur="${PPIDOF[$cur]}"
    hops=$((hops + 1))
  done
  CACHE_DESC[$pid]=1
  return 1
}

# Is pid running out of the Pinokio app root?
in_app_root() {
  local pid="$1" cwd cmd
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || cwd=""
  [[ -n "$cwd" && "$cwd" == "$APP_ROOT"* ]] && return 0
  cmd="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null)" || cmd=""
  [[ -n "$cmd" && "$cmd" == *"$APP_ROOT"* ]] && return 0
  return 1
}

# "port pid" for every listening TCP socket.
listen_pairs() {
  ss -Htnlp 2>/dev/null | awk '
    {
      port = $4; sub(/.*:/, "", port)
      pid = ""
      if (match($0, /pid=[0-9]+/)) pid = substr($0, RSTART + 4, RLENGTH - 4)
      print port, pid
    }' | sort -u
}

drop() {
  local port="$1"
  [[ -n "${TUNNELED[$port]:-}" ]] && kill "${TUNNELED[$port]}" 2>/dev/null
  unset "TUNNELED[$port]"
  rm -f "$STATE_DIR/app-$port.json"
}

cleanup() {
  for port in "${!TUNNELED[@]}"; do drop "$port"; done
  rm -f "$PIDFILE"
  exit 0
}
trap cleanup INT TERM EXIT

log "auto-tunnel started server=$SERVER pinokiod=${PINOKIOD_PID:-none} apps=$APP_ROOT"

while true; do
  load_ppids

  while read -r port pid; do
    [[ -n "$port" ]] || continue
    skip "$port" && continue

    if [[ -n "${TUNNELED[$port]:-}" ]]; then
      kill -0 "${TUNNELED[$port]}" 2>/dev/null && continue
      drop "$port"
    fi

    # cooldown after a failed handshake, so we do not hammer bore.pub
    now="$(date +%s)"
    if [[ -n "${COOLDOWN[$port]:-}" && "$now" -lt "${COOLDOWN[$port]}" ]]; then
      continue
    fi

    # only Pinokio apps (or explicitly allowed ports)
    if ! allowed "$port"; then
      owned=0
      [[ -n "$pid" ]] && { is_descendant "$pid" || in_app_root "$pid"; } && owned=1
      [[ "$owned" == 1 ]] || continue
    fi

    # only tunnel something that actually speaks HTTP
    code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$port/" 2>/dev/null)"
    [[ "$code" == "000" ]] && continue

    out="/tmp/bore-$port.log"
    : >"$out"
    args=(local "$port" --local-host 127.0.0.1 --to "$SERVER")
    [[ -n "$SECRET" ]] && args+=(--secret "$SECRET")
    "$BORE_BIN" "${args[@]}" >>"$out" 2>&1 &
    TUNNELED[$port]=$!

    url=""
    for _ in $(seq 1 15); do
      url="$(sed -e 's/\x1b\[[0-9;]*m//g' "$out" 2>/dev/null \
            | grep -oE 'listening at [A-Za-z0-9._-]+:[0-9]+' | tail -n 1 | awk '{print $3}' || true)"
      [[ -n "$url" ]] && break
      sleep 1
    done

    if [[ -n "$url" ]]; then
      cat >"$STATE_DIR/app-$port.json" <<JSON
{
  "name": "app-$port",
  "kind": "app",
  "local_port": $port,
  "public_port": ${url##*:},
  "url": "http://$url",
  "auth": false,
  "state": "live",
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
      log "port $port -> http://$url"
    else
      kill "${TUNNELED[$port]}" 2>/dev/null
      unset "TUNNELED[$port]"
      COOLDOWN[$port]=$((now + 30))
      log "port $port -> tunnel failed, retrying in 30s"
    fi
  done < <(listen_pairs)

  # forget ports that stopped listening
  for port in "${!TUNNELED[@]}"; do
    ss -Htnl 2>/dev/null | grep -q ":$port\b" || drop "$port"
  done

  sleep "$INTERVAL"
done
