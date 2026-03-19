#!/bin/sh
set -e

echo "🔧 Arrancando Tailscale daemon con proxy SOCKS5..."
tailscaled --state=mem: --tun=userspace-networking --socks5-server=localhost:1055 &

echo "🔗 Conectando a Tailscale..."
sleep 3

tailscale up \
  --authkey="${TAILSCALE_AUTHKEY}" \
  --hostname="render-alfresco" \
  --netfilter-mode=off \
  --accept-routes \
  --reset

echo "✅ Tailscale conectado:"
tailscale status

echo "🚀 Arrancando proxy Node.js..."
exec node proxy.js
