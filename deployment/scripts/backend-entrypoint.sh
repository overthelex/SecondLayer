#!/bin/sh
# Entrypoint: fix volume-mounted directory ownership, then drop to nodejs user.
# Docker named volumes are created as root; the app runs as nodejs (uid 1001).

DIRS="/app/data /app/data/uploads /app/data/uploads/multer-tmp /app/mcp_backend/logs"

for dir in $DIRS; do
  mkdir -p "$dir"
  chown nodejs:nodejs "$dir"
done

exec su-exec nodejs "$@"
