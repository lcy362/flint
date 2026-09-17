#!/usr/bin/env bash
# Flint 一键启动脚本
#
# 用法：
#   ./start.sh         后台启动 Flint；若进程已存在，仅提示并打开浏览器
#   ./start.sh -y      已有 Flint 进程时强制重启（杀掉后重新后台启动）
#   ./start.sh -h      查看帮助
#
# 可选环境变量：
#   CLIENT_PORT        前端端口（默认 5173）
#   SERVER_PORT        后端端口（默认 8787）
#   FLINT_LOGS         运行日志目录（默认 ~/.flint/logs）
#
# 流程：环境检查 → 已有进程检测 → 依赖检查 → 后台启动 → 等待就绪 → 打开浏览器 → 脚本退出
# 说明：运行日志写入 FLINT_LOGS（dev.log 及 server 的 app.log），不在控制台刷屏；
#       控制台仅保留必需的启动信息（FLINT 图案、就绪地址、进程 PID、停止 / 重启提示）。
#       脚本完成启动后即退出，进程驻留后台。
# 脚本输出（即启动日志）统一为英文。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PROJECT_NAME="$(basename "$ROOT_DIR")"
CLIENT_PORT="${CLIENT_PORT:-5173}"
SERVER_PORT="${SERVER_PORT:-8787}"
CLIENT_URL="http://localhost:${CLIENT_PORT}/"
SERVER_URL="http://localhost:${SERVER_PORT}/"

LOG_DIR="${FLINT_LOGS:-$HOME/.flint/logs}"
DEV_LOG="$LOG_DIR/dev.log"
PID_FILE="$LOG_DIR/dev.pid"
mkdir -p "$LOG_DIR"

AUTO_YES=0

info()  { printf '[info]  %s\n' "$*"; }
warn()  { printf '[warn]  %s\n' "$*"; }
error() { printf '[error] %s\n' "$*" >&2; }

banner() {
  cat <<'EOF'
 █████  █      █████  █   █  █████
 █      █        █    ██  █    █
 █████  █        █    █ █ █    █
 █      █        █    █  ██    █
 █      █        █    █   █    █
 █████  ██████  █████  █   █    █
 local-first personal AI skills asset manager
EOF
}

restart_hints() {
  info "Restart (direct): ./start.sh -y         # kill the running instance and start in background again"
  info "Restart (npm):    npm start             # run the built server (server/dist)"
}

usage() {
  cat <<'EOF'
Flint launcher

Usage:
  ./start.sh          Start (opens the browser once ready, then exits; processes stay in background)
  ./start.sh -y       If already running, kill the old instance and restart
  ./start.sh -h       Show this help

Environment variables:
  CLIENT_PORT         Frontend port (default 5173)
  SERVER_PORT         Backend port (default 8787)
  FLINT_LOGS          Log directory (default ~/.flint/logs)

Logs are written to FLINT_LOGS; only essential startup info is printed on the console.
When the frontend is ready, your browser is opened and the script exits.
EOF
}

# 查询监听指定端口的进程 PID（无则输出为空）
port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

# 判断进程是否属于本项目（用于区分“本项目已在运行”与“端口被其他程序占用”）
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
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1
    return 0
  fi
  return 1
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

# 停止指定端口上的项目进程（-y 强制重启用）
kill_project() {
  local pid
  for port in "$CLIENT_PORT" "$SERVER_PORT"; do
    for pid in $(port_pids "$port"); do
      if is_project_proc "$pid"; then
        kill "$pid" 2>/dev/null || true
      fi
    done
  done
  for _ in $(seq 1 10); do
    local remain=""
    for port in "$CLIENT_PORT" "$SERVER_PORT"; do
      remain="${remain}$(port_pids "$port")"
    done
    [ -z "$remain" ] && break
    sleep 0.5
  done
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

# ---------- 2. 已有进程检测 ----------
banner
PROJECT_PIDS=""
CONFLICT_PIDS=""
for port in "$CLIENT_PORT" "$SERVER_PORT"; do
  for pid in $(port_pids "$port"); do
    if is_project_proc "$pid"; then
      PROJECT_PIDS="${PROJECT_PIDS} ${pid}"
    else
      CONFLICT_PIDS="${CONFLICT_PIDS} ${pid}"
      cmd_line="$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-90 || true)"
      warn "Port ${port} is in use by another process: PID ${pid}  ${cmd_line}"
    fi
  done
done

if [ -n "$CONFLICT_PIDS" ]; then
  error "Port(s) are occupied by other, non-Flint processes — Flint will NOT kill them."
  error "Please free port ${CLIENT_PORT} / ${SERVER_PORT} yourself, then re-run ./start.sh."
  exit 1
fi

if [ -n "$PROJECT_PIDS" ]; then
  if [ "$AUTO_YES" -eq 1 ]; then
    warn "Flint appears to be running; restarting because -y was given."
    kill_project
  else
    if probe_ready "$CLIENT_URL"; then
      info "Flint is already running (PID:${PROJECT_PIDS}); the frontend is reachable."
      open_url "$CLIENT_URL" || warn "Failed to open the browser. Please visit $CLIENT_URL manually."
      info "No need to restart; the running instance keeps working."
      exit 0
    fi
    if probe_ready "$SERVER_URL"; then
      warn "A Flint backend is running on port ${SERVER_PORT}, but the frontend (port ${CLIENT_PORT}) is not reachable."
      open_url "$SERVER_URL" || warn "Failed to open the browser. Please visit $SERVER_URL manually."
    else
      warn "A Flint process holds these ports, but neither the frontend nor the backend is reachable (stale process)."
    fi
    restart_hints
    exit 0
  fi
fi

# ---------- 3. 依赖检查 ----------
if [ ! -x node_modules/.bin/concurrently ]; then
  info "Dependencies missing or incomplete; running npm install ..."
  npm install
fi

# ---------- 4. 后台启动 ----------
info "Starting Flint (frontend ${CLIENT_PORT} / backend ${SERVER_PORT}) in background ..."
info "Dev logs: $DEV_LOG"
PORT="$SERVER_PORT" CLIENT_PORT="$CLIENT_PORT" nohup npm run dev </dev/null >"$DEV_LOG" 2>&1 &
DEV_PID=$!
disown "$DEV_PID" 2>/dev/null || true
echo "$DEV_PID" >"$PID_FILE" 2>/dev/null || true

# ---------- 5. 等待服务就绪 ----------
info "Waiting for services to be ready ..."
READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    error "The dev process exited; startup failed. See the log: $DEV_LOG"
    exit 1
  fi
  if probe_ready "$CLIENT_URL"; then
    READY=1
    break
  fi
  sleep 1
done

# ---------- 6. 打印启动信息并退出 ----------
if [ "$READY" -eq 1 ]; then
  info "Frontend is ready: $CLIENT_URL"
  open_url "$CLIENT_URL" >/dev/null 2>&1 || warn "Failed to open the browser. Please visit $CLIENT_URL manually."
else
  warn "Timed out while waiting for the frontend. See the log: $DEV_LOG"
fi
info "Backend API: $SERVER_URL"
info "Process PID: $DEV_PID"
info "Logs: dev=$DEV_LOG  app=$LOG_DIR/app.log"
info "Stop:  kill $DEV_PID"
restart_hints
info "Started. The script exits now; Flint keeps running in the background."