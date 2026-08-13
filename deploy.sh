#!/usr/bin/env bash
# AgentFlow 前端更新：拉取最新代码 → 重新构建 → 重启服务
# 全程走 git pull，不涉及文件拷贝
#
# 服务器用法：
#   ssh ospacer@snowflow.cloud
#   /home/ospacer/project/agentflow-frontend/deploy.sh
set -euo pipefail

export PATH=/home/ospacer/.local/opt/node-v24.17.0-linux-x64/bin:$PATH
cd /home/ospacer/project/agentflow-frontend

echo "==> 拉取最新代码"
git pull --ff-only

echo "==> 同步依赖"
npm ci

echo "==> 构建"
npm run build

echo "==> 重启服务"
systemctl --user restart agentflow-frontend.service
sleep 3
systemctl --user is-active agentflow-frontend.service

echo "==> 完成：$(git log -1 --oneline)"
