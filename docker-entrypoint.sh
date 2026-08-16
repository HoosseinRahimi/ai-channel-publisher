#!/bin/sh
set -eu

# Apply pending database migrations before the app accepts traffic. Uses the
# migrator bundled with drizzle-orm (a production dependency) — no drizzle-kit
# or build tooling in the runtime image. Idempotent: the migrator only applies
# journal entries that have not run yet.
echo "[entrypoint] applying database migrations…"
node scripts/migrate.mjs

echo "[entrypoint] starting publisher…"
exec "$@"