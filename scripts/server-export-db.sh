#!/bin/bash
# Run this script ON THE PRODUCTION SERVER
# This creates a MongoDB backup that can be downloaded

set -e

echo "========================================"
echo "MongoDB Export Script"
echo "========================================"
echo ""

DB_NAME="sac_helpdesk"
# Credentials come from the environment. Export MONGO_URI before running, e.g.
#   export MONGO_URI="mongodb://<user>:<password>@localhost:27017/sac_helpdesk?authSource=admin"
if [ -z "${MONGO_URI:-}" ]; then
  echo "ERROR: MONGO_URI is not set. Export it before running this script." >&2
  exit 1
fi
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/mongodb-backup-${TIMESTAMP}"
BACKUP_FILE="/tmp/sac_helpdesk-backup-${TIMESTAMP}.tar.gz"

echo "Creating backup..."
mongodump --uri="${MONGO_URI}" --out="${BACKUP_DIR}"

if [ $? -eq 0 ]; then
    echo "✓ Export completed!"
    echo ""
    echo "Compressing backup..."
    cd /tmp
    tar -czf "${BACKUP_FILE}" "mongodb-backup-${TIMESTAMP}"
    
    # Cleanup uncompressed backup
    rm -rf "${BACKUP_DIR}"
    
    echo "✓ Backup created successfully!"
    echo ""
    echo "=========================================="
    echo "Backup file ready for download:"
    echo "${BACKUP_FILE}"
    echo "=========================================="
    echo ""
    echo "Download this file using:"
    echo "scp ubuntu@34.14.157.13:${BACKUP_FILE} ."
    echo ""
    echo "Or share via any file transfer method"
    echo ""
    
    # Show file size
    ls -lh "${BACKUP_FILE}"
else
    echo "❌ Export failed!"
    exit 1
fi
