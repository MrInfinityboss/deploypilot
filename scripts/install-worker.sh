#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${DEPLOYPILOT_REPO_URL:-https://github.com/MrInfinityboss/deploypilot.git}"
VERSION="${DEPLOYPILOT_VERSION:-v1.0.6}"
INSTALL_DIR="${DEPLOYPILOT_WORKER_DIR:-$HOME/.deploypilot-worker}"
SERVICE_NAME="deploypilot-worker"

command -v git >/dev/null || { echo "git is required"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ is required"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required; install it with corepack enable && corepack prepare pnpm@9 --activate"; exit 1; }
command -v docker >/dev/null || { echo "Docker is required and must be running"; exit 1; }

read -r -p "DeployPilot API URL: " API_URL
read -r -p "Worker ID: " WORKER_ID
read -r -s -p "Worker token: " WORKER_TOKEN
echo
read -r -p "Shared Redis URL: " REDIS_URL
read -r -p "Supabase DATABASE_URL: " DATABASE_URL
DATABASE_URL="${DATABASE_URL#DATABASE_URL=}"
DATABASE_URL="${DATABASE_URL#\"}"; DATABASE_URL="${DATABASE_URL%\"}"

[ -n "$API_URL" ] && [ -n "$WORKER_ID" ] && [ -n "$WORKER_TOKEN" ] && [ -n "$REDIS_URL" ] && [ -n "$DATABASE_URL" ] || { echo "All values are required"; exit 1; }
case "$DATABASE_URL" in postgresql://*|postgres://*) ;; *) echo "DATABASE_URL must start with postgresql:// or postgres://. Copy the full Supabase connection string."; exit 1 ;; esac

if [ ! -d "$INSTALL_DIR/.git" ]; then
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$VERSION" "$REPO_URL" "$INSTALL_DIR"
else
  git -C "$INSTALL_DIR" fetch --tags --depth 1 origin "$VERSION"
  git -C "$INSTALL_DIR" checkout -q "$VERSION"
fi

cat > "$INSTALL_DIR/.env" <<EOF
WORKER_API_URL=$API_URL
WORKER_ID=$WORKER_ID
WORKER_TOKEN=$WORKER_TOKEN
REDIS_URL=$REDIS_URL
DATABASE_URL=$DATABASE_URL
WORKER_VERSION=1.0.6
EOF
chmod 600 "$INSTALL_DIR/.env"
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile

SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=DeployPilot Docker Worker
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v pnpm) --filter @deploypilot/worker exec tsx src/main.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
echo "DeployPilot worker installed and started."
echo "Check status: sudo systemctl status $SERVICE_NAME"
echo "Follow logs: journalctl -u $SERVICE_NAME -f"
