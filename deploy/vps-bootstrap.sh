#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu/Debian VPS: Docker, a basic firewall and automatic security updates.
# Run as root (or with sudo):   bash deploy/vps-bootstrap.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo)."; exit 1; fi

echo "==> Installing Docker (official convenience script)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall: allow SSH, HTTP, HTTPS only"
apt-get update -y
apt-get install -y ufw unattended-upgrades
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done. Next: clone the repository, create .env.docker (see docs/DEPLOYMENT.md), then run:"
echo "  docker compose -f docker-compose.yml -f docker-compose.vps.yml --env-file .env.docker up -d --build"
