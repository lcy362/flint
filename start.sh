#!/usr/bin/env bash
# Skills Hub 一键启动脚本
#
# 用法：
#   ./start.sh          启动（端口被占用时会交互询问）
#   ./start.sh -y       端口被占用时直接结束占用进程并启动
#   ./start.sh -h       查看帮助
#
# 可选环境变量：
#   CLIENT_PORT   前端端口（默认 5173）
#   SERVER_PORT   后端端口（默认 8787）
#
# 流程：环境检查 → 依赖检查 → 端口检测 → 启动 → 等待就绪 → 自动打开浏览器 → Ctrl+C 停止
# 说明：脚本输出（即启动日志）统一为英文，便于检索与上报。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PROJECT_NAME="$(basename "$ROOT_DIR")"
CLIENT_PORT="${CLIENT_PORT:-5173}"
SERVER_PORT="${SERVER_PORT:-8787}"
CLIENT_URL="http://localhost:${CLIENT_PORT}/"
SERVER_URL="http://localhost:${SERVER_PORT}/"

AUTO_YES=0
DEV_PID=""
CLEANED=0

info()  { printf '[info] %s\n' "$*"; }
warn()  { printf '[warn] %s\n' "$*"; }
error() { printf '[error] %s\n' "$*" >&2; }

usage() {
  cat <<'EOF'
Skills Hub launcher

Usage:
  ./start.sh          Start (asks interactively when a port is occupied)
  ./start.sh -y       Kill the processes occupying the ports, then start
  ./start.sh -h       Show this help

Environment variables:
  CLIENT_PORT   Frontend port (default 5173)
  SERVER_PORT   Backend port (default 8787)

The frontend page is opened in your browser once it is ready. Press Ctrl+C to stop.
EOF
}

# 查询监听指定端口的进程 PID（无则输出为空）
port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

# 判断进程是否属于本项目
is_project_proc() {
  local cmd
  cmd="$(ps -o command= -p "$1" 2>/dev/null || true)"
  case "$cmd" in
    *"$ROOT_DIR"*) return 0 ;;
    *"$PROJECT_NAME"*) return 0 ;;
  esac
  return 1
}

# 用系统默认浏览器打开链接
open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1
  else
    return 1
  fi
}

# 探测某个地址是否已可用
probe_ready() {
  local code
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$1" 2>/dev/null || true)"
    case "$code" in
      2??|3??) return 0 ;;
    esac
    return 1
  fi
  node -e '
    const http = require("http");
    const req = http.get(process.argv[1], (res) => process.exit(res.statusCode < 400 ? 0 : 1));
    req.on("error", () => process.exit(1));
    req.setTimeout(2000, () => { req.destroy(); process.exit(1); });
  ' "$1" >/dev/null 2>&1
}

# 停止服务：先终止父进程，再按端口兜底清理本项目残留进程
cleanup() {
  if [ "$CLEANED" -eq 1 ]; then
    return 0
  fi
  CLEANED=1
  info "Stopping Skills Hub ..."
  if [ -n "$DEV_PID" ]; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
  for port in "$CLIENT_PORT" "$SERVER_PORT"; do
    for pid in $(port_pids "$port"); do
      if is_project_proc "$pid"; then
        kill "$pid" 2>/dev/null || true
      fi
    done
  done
  if [ -n "$DEV_PID" ]; then
    wait "$DEV_PID" 2>/dev/null || true
  fi
  info "Stopped."
}

# ---------- 参数解析 ----------
case "${1:-}" in
  -y|--yes) AUTO_YES=1 ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) error "Unknown argument: $1"; usage; exit 1 ;;
esac

# ---------- 1. 环境检查 ----------
if ! command -v node >/dev/null 2>&1; then
  error "Node.js not found. Please install Node.js >= 20: https://nodejs.org/"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js version too old (current $(node -v)). Please upgrade to >= 20"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  error "npm not found. Please make sure your Node.js installation is complete."
  exit 1
fi
if ! command -v lsof >/dev/null 2>&1; then
  error "lsof not found. Cannot check port usage."
  exit 1
fi

# ---------- 2. 端口占用检测 ----------
CONFLICT_PIDS=""
PROJECT_RUNNING=0
for port in "$CLIENT_PORT" "$SERVER_PORT"; do
  for pid in $(port_pids "$port"); do
    cmd_line="$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-90 || true)"
    warn "Port ${port} is already in use: PID ${pid}  ${cmd_line}"
    CONFLICT_PIDS="${CONFLICT_PIDS} ${pid}"
    if is_project_proc "$pid"; then
      PROJECT_RUNNING=1
    fi
  done
done

KILL_NEEDED=0
if [ -n "$CONFLICT_PIDS" ]; then
  if [ "$AUTO_YES" -eq 1 ]; then
    warn "Port conflict detected; killing the occupying processes because -y was given."
    KILL_NEEDED=1
  elif [ -t 0 ]; then
    if [ "$PROJECT_RUNNING" -eq 1 ]; then
      warn "Skills Hub seems to already be running."
      printf '  [y] Kill the old processes and start again\n  [r] Do not restart; just open the existing page\n  [N] Cancel\n'
    else
      warn "The processes above do not belong to this project; killing them may affect other programs."
      printf '  [y] Kill these processes and continue\n  [N] Cancel\n'
    fi
    read -r -p 'Choose [y/r/N]: ' answer || answer=""
    case "$answer" in
      [Yy]*)
        KILL_NEEDED=1
        ;;
      [Rr]*)
        if [ "$PROJECT_RUNNING" -eq 1 ]; then
          if open_url "$CLIENT_URL"; then
            info "Opened the existing page: $CLIENT_URL"
          else
            warn "Failed to open the browser. Please visit $CLIENT_URL manually."
          fi
          exit 0
        fi
        error "The processes occupying the ports do not belong to this project; cannot reuse them."
        exit 1
        ;;
      *)
        info "Cancelled."
        exit 0
        ;;
    esac
  else
    error "Ports ${CLIENT_PORT}/${SERVER_PORT} are in use and this is not an interactive shell."
    error "Free the ports first, or run ./start.sh -y to kill the occupying processes automatically."
    exit 1
  fi
fi

if [ "$KILL_NEEDED" -eq 1 ]; then
  info "Killing the processes occupying the ports ..."
  for pid in $CONFLICT_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 10); do
    remain=""
    for port in "$CLIENT_PORT" "$SERVER_PORT"; do
      remain="${remain}$(port_pids "$port")"
    done
    if [ -z "$remain" ]; then
      break
    fi
    sleep 0.5
  done
  for pid in $CONFLICT_PIDS; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.5
fi

# ---------- 3. 依赖检查 ----------
if [ ! -x node_modules/.bin/concurrently ]; then
  info "Dependencies missing or incomplete; running npm install ..."
  npm install
fi

# ---------- 4. 启动服务 ----------
info "Starting Skills Hub (frontend ${CLIENT_PORT} / backend ${SERVER_PORT}) ..."
PORT="$SERVER_PORT" CLIENT_PORT="$CLIENT_PORT" npm run dev < /dev/null &
DEV_PID=$!

trap 'exit 130' INT TERM
trap cleanup EXIT

# ---------- 5. 等待服务就绪 ----------
info "Waiting for services to be ready ..."
READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    error "The dev process exited; startup failed. Please check the logs above."
    exit 1
  fi
  if probe_ready "$CLIENT_URL"; then
    READY=1
    break
  fi
  sleep 1
done

# ---------- 6. 打开浏览器 ----------
if [ "$READY" -eq 1 ]; then
  info "Frontend is ready: $CLIENT_URL"
  if open_url "$CLIENT_URL"; then
    info "Opened the frontend page in your browser."
  else
    warn "Failed to open the browser automatically. Please visit $CLIENT_URL manually."
  fi
else
  warn "Timed out while waiting for the frontend; please check the logs above."
fi
info "Backend API: $SERVER_URL"
info "Press Ctrl+C to stop."

wait "$DEV_PID" 2>/dev/null || true
