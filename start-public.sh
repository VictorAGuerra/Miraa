#!/usr/bin/env bash
# Liga o servidor Miraa e cria um túnel público (Cloudflare Quick Tunnel).
# Uso: ./start-public.sh
# Pressione Ctrl+C para desligar os dois (servidor + túnel).

set -u
cd "$(dirname "$0")"

CLOUDFLARED="$HOME/.local/bin/cloudflared"
LOG_DIR="/tmp/miraa"
mkdir -p "$LOG_DIR"

if [ ! -x "$CLOUDFLARED" ]; then
  echo "cloudflared não encontrado em $CLOUDFLARED"
  exit 1
fi

echo "Iniciando servidor Miraa..."
node server/index.js > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "Desligando..."
  kill "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null
  wait "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null
  echo "Tudo desligado."
}
trap cleanup EXIT INT TERM

sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "O servidor não iniciou. Veja $LOG_DIR/server.log"
  exit 1
fi

echo "Abrindo túnel público..."
"$CLOUDFLARED" tunnel --url http://localhost:3000 > "$LOG_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!

URL=""
for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-zA-Z0-9.-]*trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -n1)
  [ -n "$URL" ] && break
  sleep 1
done

echo ""
if [ -n "$URL" ]; then
  echo "=================================================="
  echo " Miraa está no ar em: $URL"
  echo " (link temporário — muda a cada vez que você rodar este script)"
  echo "=================================================="
else
  echo "Não consegui obter a URL pública a tempo. Veja $LOG_DIR/tunnel.log"
fi

echo "Deixe este terminal aberto. Ctrl+C para desligar."
wait
