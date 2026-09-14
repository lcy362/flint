#!/usr/bin/env bash
# Skills Hub 一键启动脚本
# 用法：./start.sh
set -e

# 切换到脚本所在目录（项目根目录）
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 1. 检查 Node.js 是否存在
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js >= 20：https://nodejs.org/"
  exit 1
fi

# 2. 检查 Node.js 版本（要求 >= 20）
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[错误] Node.js 版本过低（当前 $(node -v)），请升级到 >= 20"
  exit 1
fi

# 3. 首次运行或依赖缺失时自动安装
if [ ! -d node_modules ]; then
  echo "[提示] 未找到 node_modules，正在安装依赖..."
  npm install
fi

# 4. 启动前后端开发服务
echo "正在启动 Skills Hub ..."
echo "  前端 Web UI：http://localhost:5173/"
echo "  后端 API   ：http://localhost:8787/"
echo "按 Ctrl+C 停止服务。"
echo
npm run dev
