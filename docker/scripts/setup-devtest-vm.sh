#!/bin/bash
# Setup script for DevTest environment on Guest VM (UbuntuDevTest).
# Auto-detects the host server IP (virbr0 gateway) and updates .env.devtest.
#
# Usage (run on the VM):
#   cd /path/to/cloud-ai-saas/docker
#   ./scripts/setup-devtest-vm.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DOCKER_DIR/.env.devtest"

echo "=== Martani DevTest VM Setup ==="
echo ""

# --- Step 1: Auto-detect host server IP ---
echo "[1/4] Detecting host server IP..."

# The host is the default gateway on the virbr0/libvirt network
HOST_IP=$(ip route | grep default | awk '{print $3}' | head -1)

if [ -z "$HOST_IP" ]; then
    echo "  [WARN] Could not auto-detect gateway IP."
    echo "  Enter the host server IP manually:"
    read -r HOST_IP
fi

echo "  Host server IP: $HOST_IP"

# --- Step 2: Test connectivity to MinIO and Ollama ---
echo ""
echo "[2/4] Testing connectivity to host services..."

MINIO_PORT=$(grep "^MINIO_PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "9000")
OLLAMA_PORT=$(grep "^OLLAMA_PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "11434")

if timeout 3 bash -c "echo >/dev/tcp/$HOST_IP/$MINIO_PORT" 2>/dev/null; then
    echo "  MinIO ($HOST_IP:$MINIO_PORT) .... OK"
else
    echo "  MinIO ($HOST_IP:$MINIO_PORT) .... UNREACHABLE"
    echo "  [WARN] Make sure MinIO is running on the host and port $MINIO_PORT is accessible."
fi

if timeout 3 bash -c "echo >/dev/tcp/$HOST_IP/$OLLAMA_PORT" 2>/dev/null; then
    echo "  Ollama ($HOST_IP:$OLLAMA_PORT) .. OK"
else
    echo "  Ollama ($HOST_IP:$OLLAMA_PORT) .. UNREACHABLE"
    echo "  [WARN] Make sure Ollama is running on the host and port $OLLAMA_PORT is accessible."
fi

WHISPER_PORT=$(grep "^WHISPER_PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "8178")
if timeout 3 bash -c "echo >/dev/tcp/$HOST_IP/$WHISPER_PORT" 2>/dev/null; then
    echo "  Whisper ($HOST_IP:$WHISPER_PORT) . OK"
else
    echo "  Whisper ($HOST_IP:$WHISPER_PORT) . UNREACHABLE"
    echo "  [WARN] Make sure whisper-server.service is running on the host."
fi

# --- Step 3: Update .env.devtest with detected host IP ---
echo ""
echo "[3/4] Updating $ENV_FILE..."

if [ -f "$ENV_FILE" ]; then
    sed -i "s|^HOST_SERVER_IP=.*|HOST_SERVER_IP=$HOST_IP|" "$ENV_FILE"
    echo "  HOST_SERVER_IP=$HOST_IP"
else
    echo "  [ERROR] $ENV_FILE not found! Run this script from the docker/ directory."
    exit 1
fi

# --- Step 4: Summary ---
echo ""
echo "[4/4] Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the devtest stack:"
echo "     cd $DOCKER_DIR"
echo "     docker compose -f docker-compose.devtest.yml --env-file .env.devtest up -d"
echo ""
echo "  2. Import database (if you have a backup from the host):"
echo "     docker exec -i martani-devtest-postgres psql -U cloudai -d martani_devtest < ~/dev_dump.sql"
echo ""
echo "  3. Access the app:"
echo "     Frontend: http://localhost:3000"
echo "     Backend:  http://localhost:8000"
