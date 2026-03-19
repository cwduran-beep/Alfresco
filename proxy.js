const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { SocksProxyAgent } = require('socks-proxy-agent');
const app = express();

const TARGET      = process.env.LOCAL_TARGET || 'http://100.90.166.10:8080';
const INTERNAL_IP = '100.90.166.10:8080';
const tailscaleAgent = new SocksProxyAgent('socks5://127.0.0.1:1055');

app.get('/health', (req, res) => {
  res.json({ status: "ok", target: TARGET, time: new Date().toISOString() });
});

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: true,
  agent: tailscaleAgent,
  selfHandleResponse: true,
  on: {
    proxyRes: (proxyRes, req, res) => {
      // Copiar headers excepto los que reescribimos
      Object.keys(proxyRes.headers).forEach(key => {
        if (key === 'location') {
          // Reescribir redirects internos
          const loc = proxyRes.headers[key];
          if (loc && loc.includes(INTERNAL_IP)) {
            res.setHeader(key, loc.replace(`http://${INTERNAL_IP}`, '').replace(`https://${INTERNAL_IP}`, ''));
          } else {
            res.setHeader(key, loc);
          }
        } else {
          res.setHeader(key, proxyRes.headers[key]);
        }
      });

      res.statusCode = proxyRes.statusCode;

      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const isText = contentType.includes('text/html') ||
                     contentType.includes('text/css') ||
                     contentType.includes('javascript') ||
                     contentType.includes('application/json') ||
                     contentType.includes('text/plain');

      if (!isText) {
        // Binarios: pasar directo sin tocar
        proxyRes.pipe(res);
        return;
      }

      // Texto: reescribir URLs internas
      let body = '';
      proxyRes.on('data', chunk => body += chunk.toString());
      proxyRes.on('end', () => {
        // Reemplazar referencias a la IP interna
        body = body
          .replace(new RegExp(`http://${INTERNAL_IP}`, 'g'), '')
          .replace(new RegExp(`https://${INTERNAL_IP}`, 'g'), '');
        res.end(body);
      });
    },
    error: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(502).send('Error conectando al servicio: ' + err.message);
    }
  }
}));

app.listen(10000, () => {
  console.log(`🔁 Proxy activo → ${TARGET}`);
});
