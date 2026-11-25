#!/usr/bin/env bash
# Deployment check without Docker: repeats the Dockerfile's steps in a scratch directory (same
# files copied, same production install), starts the server from there and asks it the questions
# a deploy health check would. Run from the repository root:
#   bash apps/server/tools/check-image.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d)"
PORT="${PORT:-18090}"
trap 'kill "${PID:-0}" 2>/dev/null || true; rm -rf "$WORK"' EXIT

cd "$ROOT"
cp package.json package-lock.json "$WORK/"
mkdir -p "$WORK/apps/web" "$WORK/apps/server"
cp apps/web/package.json "$WORK/apps/web/"
cp apps/server/package.json "$WORK/apps/server/"
cp -R packages "$WORK/packages"
find "$WORK/packages" -name node_modules -prune -exec rm -rf {} +

cd "$WORK"
NODE_ENV=production npm ci --workspace apps/server --include-workspace-root --omit=dev --no-audit --no-fund >/dev/null
cp -R "$ROOT/apps/server/." "$WORK/apps/server/"
rm -rf "$WORK/apps/server/node_modules"

cd "$WORK/apps/server"
# Something already answering on the port would be checked instead of this build: refuse.
if curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/"; then echo "FAIL port $PORT is already in use; set PORT to a free one"; exit 1; fi
# Started with node directly (not through npx), so that the process we kill at the end is the server itself.
NODE_ENV=production HOST=127.0.0.1 PORT="$PORT" PUBLIC_URL="http://127.0.0.1:$PORT" MONITOR_INTERVAL_MINUTES=0 node --import tsx src/server.ts >"$WORK/server.log" 2>&1 &
PID=$!
for _ in $(seq 1 60); do
  curl -fs -m 2 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 && break
  kill -0 "$PID" 2>/dev/null || { echo "server exited:"; tail -20 "$WORK/server.log"; exit 1; }
  sleep 0.5
done

fail() { echo "FAIL $1"; tail -20 "$WORK/server.log"; exit 1; }
curl -fs -m 5 "http://127.0.0.1:$PORT/v1/health" | grep -q '"status":"operational"' || fail "/v1/health"
echo "ok   /v1/health is operational"
PROVIDERS=$(curl -fs -m 10 "http://127.0.0.1:$PORT/v2/registry" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).document;console.log(d.providers.length)})') || fail "/v2/registry"
[ "$PROVIDERS" -ge 4 ] || fail "/v2/registry lists $PROVIDERS providers"
echo "ok   /v2/registry lists $PROVIDERS providers"
curl -fs -m 5 "http://127.0.0.1:$PORT/v2/health" | grep -q '"runtime":"server"' || fail "/v2/health"
echo "ok   /v2/health answers"
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -G --data-urlencode 'data={"url":"https://example.com/a.mp4"}' "http://127.0.0.1:$PORT/v2/relay")
[ "$CODE" = "403" ] || fail "unsigned relay request answered $CODE (expected 403)"
echo "ok   the relay refuses a link it didn't sign"
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/v2/admin/providers")
[ "$CODE" = "404" ] || fail "admin endpoints exist without ADMIN_TOKEN ($CODE)"
echo "ok   the control plane is absent without ADMIN_TOKEN"
# The website asks for the event stream by its own type; the real server (framework and all) must
# answer it. A request for nothing (kind missing) is refused with 400, not with 406.
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H 'Accept: application/x-ndjson' "http://127.0.0.1:$PORT/v2/sources")
[ "$CODE" = "400" ] && echo "ok   /v2/sources accepts a client that asks for application/x-ndjson" || fail "/v2/sources answered $CODE to Accept: application/x-ndjson (expected 400 for a request with no title)"

echo "Image recipe check passed"
