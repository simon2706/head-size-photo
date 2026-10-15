#!/usr/bin/env bash
# Serve the app over HTTPS on the local network so a phone on the same Wi-Fi can use the camera
# (getUserMedia needs a secure context). The backend stays on 127.0.0.1; the phone only talks to
# Vite, which proxies /api. Ctrl+C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/frontend/.certs"
CERT="$CERT_DIR/dev.pem"
KEY="$CERT_DIR/dev-key.pem"

if ! command -v mkcert >/dev/null; then
  echo "mkcert is required: brew install mkcert && mkcert -install" >&2
  exit 1
fi

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$IP" ]; then
  echo "Could not detect the LAN IP (en0/en1). Are you on Wi-Fi?" >&2
  exit 1
fi

# (Re)issue the certificate when it is missing or does not cover the current IP.
if [ ! -f "$CERT" ] || ! openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -qE "IP Address:${IP//./\\.}(,|$)"; then
  mkdir -p "$CERT_DIR"
  mkcert -cert-file "$CERT" -key-file "$KEY" "$IP" localhost 127.0.0.1
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  (cd "$ROOT/frontend" && npm install)
fi
(cd "$ROOT/backend" && uv sync --quiet)

cleanup() {
  trap - INT TERM EXIT
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(cd "$ROOT/backend" && uv run uvicorn facial_measurement.main:app --reload --host 127.0.0.1 --port 8000) &
(cd "$ROOT/frontend" && HTTPS_CERT="$CERT" HTTPS_KEY="$KEY" npm run dev -- --host 0.0.0.0) &

URL="https://$IP:5173"
echo
echo "Open on your phone (same Wi-Fi): $URL"
if command -v qrencode >/dev/null; then
  qrencode -t ansiutf8 "$URL"
fi
echo
echo "To avoid the certificate warning, install this CA on the phone once:"
echo "  $(mkcert -CAROOT)/rootCA.pem"
echo "  Samsung: Settings > Security and privacy > More security settings >"
echo "           Install from device storage > CA certificate"
echo "Or tap Advanced > Proceed on the warning page; the camera still works."
wait
