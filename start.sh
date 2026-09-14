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

info()  { printf '[信息] %s\n' "$*"; }
warn()  { printf '[提示] %s\n' "$*"; }
error() { printf '[错误] %s\n' "$*" >&2; }

usage() {
  cat <<'EOF'
Skills Hub 启动脚本

用法：
  ./start.sh          启动（端口被占用时交互询问）
  ./start.sh -y       端口被占用时自动结束占用进程后启动
  ./start.sh -h       显示本帮助

环境变量：
  CLIENT_PORT   前端端口（默认 5173）
  SERVER_PORT   后端端口（默认 8787）

启动成功后会自动在浏览器打开前端页面，按 Ctrl+C 停止服务。
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
  info "正在停止 Skills Hub ..."
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
  info "已停止。"
}

# ---------- 参数解析 ----------
case "${1:-}" in
  -y|--yes) AUTO_YES=1 ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) error "未知参数：$1"; usage; exit 1 ;;
esac

# ---------- 1. 环境检查 ----------
if ! command -v node >/dev/null 2>&1; then
  error "未检测到 Node.js，请先安装 Node.js >= 20：https://nodejs.org/"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js 版本过低（当前 $(node -v)），请升级到 >= 20"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  error "未检测到 npm，请确认 Node.js 安装完整。"
  exit 1
fi
if ! command -v lsof >/dev/null 2>&1; then
  error "未检测到 lsof，无法检测端口占用情况。"
  exit 1
fi

# ---------- 2. 端口占用检测 ----------
CONFLICT_PIDS=""
PROJECT_RUNNING=0
for port in "$CLIENT_PORT" "$SERVER_PORT"; do
  for pid in $(port_pids "$port"); do
    cmd_line="$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-90 || true)"
    warn "端口 ${port} 已被占用：PID ${pid}  ${cmd_line}"
    CONFLICT_PIDS="${CONFLICT_PIDS} ${pid}"
    if is_project_proc "$pid"; then
      PROJECT_RUNNING=1
    fi
  done
done

KILL_NEEDED=0
if [ -n "$CONFLICT_PIDS" ]; then
  if [ "$AUTO_YES" -eq 1 ]; then
    warn "检测到端口占用，已按 -y 自动结束占用进程。"
    KILL_NEEDED=1
  elif [ -t 0 ]; then
    if [ "$PROJECT_RUNNING" -eq 1 ]; then
      warn "检测到 Skills Hub 似乎已在运行。"
      printf '  [y] 结束旧进程并重新启动\n  [r] 不重启，直接打开已有页面\n  [N] 取消\n'
    else
      warn "以上进程不属于本项目，结束它们可能影响其他程序。"
      printf '  [y] 结束这些进程并继续启动\n  [N] 取消\n'
    fi
    read -r -p '请选择 [y/r/N]: ' answer || answer=""
    case "$answer" in
      [Yy]*)
        KILL_NEEDED=1
        ;;
      [Rr]*)
        if [ "$PROJECT_RUNNING" -eq 1 ]; then
          if open_url "$CLIENT_URL"; then
            info "已打开已有页面：$CLIENT_URL"
          else
            warn "打开浏览器失败，请手动访问 $CLIENT_URL"
          fi
          exit 0
        fi
        error "占用端口的进程不属于本项目，无法复用。"
        exit 1
        ;;
      *)
        info "已取消。"
        exit 0
        ;;
    esac
  else
    error "端口 ${CLIENT_PORT}/${SERVER_PORT} 被占用，且当前非交互环境。"
    error "请先释放端口，或使用 ./start.sh -y 自动结束占用进程。"
    exit 1
  fi
fi

if [ "$KILL_NEEDED" -eq 1 ]; then
  info "正在结束占用端口的进程 ..."
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
  info "依赖未安装或不完整，正在执行 npm install ..."
  npm install
fi

# ---------- 4. 启动服务 ----------
info "正在启动 Skills Hub（前端 ${CLIENT_PORT} / 后端 ${SERVER_PORT}）..."
PORT="$SERVER_PORT" CLIENT_PORT="$CLIENT_PORT" npm run dev < /dev/null &
DEV_PID=$!

trap 'exit 130' INT TERM
trap cleanup EXIT

# ---------- 5. 等待服务就绪 ----------
info "等待服务就绪 ..."
READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    error "服务进程已退出，启动失败，请查看上方日志。"
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
  info "前端已就绪：$CLIENT_URL"
  if open_url "$CLIENT_URL"; then
    info "已在浏览器中打开前端页面。"
  else
    warn "自动打开浏览器失败，请手动访问 $CLIENT_URL"
  fi
else
  warn "等待超时，未能确认前端就绪，请查看上方日志。"
fi
info "后端 API：$SERVER_URL"
info "按 Ctrl+C 停止服务。"

wait "$DEV_PID" 2>/dev/null || true
