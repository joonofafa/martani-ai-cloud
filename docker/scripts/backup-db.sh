#!/bin/bash
# Backup dev and test PostgreSQL databases from host containers
# and prepare dump files for import on the VM.
#
# Usage: ./backup-db.sh [output_dir]
# Output: dev_dump.sql, test_dump.sql in output_dir (default: ./db-backups/)

set -euo pipefail

OUTPUT_DIR="${1:-./db-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$OUTPUT_DIR"

echo "=== Martani DB Backup ==="
echo "Output directory: $OUTPUT_DIR"
echo ""

# --- Dev DB ---
echo "[1/2] Backing up DEV database (martani-dev-postgres)..."
if docker ps --format '{{.Names}}' | grep -q "martani-dev-postgres"; then
    docker exec martani-dev-postgres pg_dump \
        -U cloudai -d martani_dev \
        --no-owner --no-privileges --clean --if-exists \
        > "$OUTPUT_DIR/dev_dump_${TIMESTAMP}.sql"
    echo "  -> $OUTPUT_DIR/dev_dump_${TIMESTAMP}.sql"
else
    echo "  [SKIP] martani-dev-postgres is not running."
fi

# --- Test DB ---
echo "[2/2] Backing up TEST database (martani-test-postgres)..."
if docker ps --format '{{.Names}}' | grep -q "martani-test-postgres"; then
    docker exec martani-test-postgres pg_dump \
        -U cloudai -d martani_test \
        --no-owner --no-privileges --clean --if-exists \
        > "$OUTPUT_DIR/test_dump_${TIMESTAMP}.sql"
    echo "  -> $OUTPUT_DIR/test_dump_${TIMESTAMP}.sql"
else
    echo "  [SKIP] martani-test-postgres is not running."
fi

echo ""
echo "=== Backup complete ==="
echo ""
echo "To import on the VM (after devtest postgres is running):"
echo "  # Copy dumps to VM:"
echo "  scp $OUTPUT_DIR/*_dump_*.sql user@192.168.122.200:~/"
echo ""
echo "  # Import dev dump into devtest DB:"
echo "  docker exec -i martani-devtest-postgres psql -U cloudai -d martani_devtest < ~/dev_dump_${TIMESTAMP}.sql"
echo ""
echo "  # Or import test dump instead:"
echo "  docker exec -i martani-devtest-postgres psql -U cloudai -d martani_devtest < ~/test_dump_${TIMESTAMP}.sql"
