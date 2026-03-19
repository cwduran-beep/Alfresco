const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { SocksProxyAgent } = require('socks-proxy-agent');
const app = express();

const TARGET   = process.env.LOCAL_TARGET || 'http://100.90.166.10:8080';
const INTERNAL = process.env.INTERNAL_HOST || '100.90.166.10:8080';

// socks5h hace que el DNS se resuelva en el proxy, no localmente
const tailscaleAgent = new SocksProxyAgent('socks5h://127.0.0.1:1055');

app.get('/health', (req, res) => {
  res.json({ status: "ok", target: TARGET, time: new Date().toISOString() });
});

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: true,
  agent: tailscaleAgent,
  on: {
    proxyRes: (proxyRes) => {
      if (proxyRes.headers['location']) {
        proxyRes.headers['location'] = proxyRes.headers['location']
          .replace(`http://${INTERNAL}`, '')
          .replace(`https://${INTERNAL}`, '');
      }
    },
    error: (err, req, res) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) res.status(502).send('Error: ' + err.message);
    }
  }
}));

app.listen(10000, () => console.log(`🔁 Proxy activo → ${TARGET}`));
