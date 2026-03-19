const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();

const TARGET        = process.env.LOCAL_TARGET  || 'http://100.90.166.10:8080';
const INTERNAL_HOST = process.env.INTERNAL_HOST || '100.90.166.10:8080';
const PUBLIC_HOST   = process.env.PUBLIC_HOST   || 'alfresco-istlt.onrender.com';

const tailscaleAgent = new SocksProxyAgent('socks5h://127.0.0.1:1055');

// ── Patrones internos a reemplazar ──────────────────────────
const INTERNAL_PATTERNS = [
  `http://${INTERNAL_HOST}`,
  `https://${INTERNAL_HOST}`,
  `http:\\/\\/${INTERNAL_HOST.replace('.', '\\.')}`,
  `https:\\/\\/${INTERNAL_HOST.replace('.', '\\.')}`,
];

function replaceInternalUrls(text) {
  let result = text;
  result = result.split(`http://${INTERNAL_HOST}`).join(`https://${PUBLIC_HOST}`);
  result = result.split(`https://${INTERNAL_HOST}`).join(`https://${PUBLIC_HOST}`);
  // También reemplaza versiones escapadas en JSON/JS
  result = result.split(`http:\\/\\/${INTERNAL_HOST}`).join(`https:\\/\\/${PUBLIC_HOST}`);
  result = result.split(`https:\\/\\/${INTERNAL_HOST}`).join(`https:\\/\\/${PUBLIC_HOST}`);
  return result;
}

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: "ok", target: TARGET, public: PUBLIC_HOST, time: new Date().toISOString() });
});

// ── Proxy principal ──────────────────────────────────────────
app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: true,
  agent: tailscaleAgent,
  selfHandleResponse: true,   // necesario para modificar el body

  on: {
    proxyRes: (proxyRes, req, res) => {
      // 1. Corregir header Location en redirecciones 3xx
      if (proxyRes.headers['location']) {
        proxyRes.headers['location'] = replaceInternalUrls(proxyRes.headers['location']);
        console.log(`[redirect] → ${proxyRes.headers['location']}`);
      }

      // 2. Copiar todos los headers al response real
      Object.keys(proxyRes.headers).forEach(key => {
        // No copiar content-encoding para poder modificar el body libremente
        if (key.toLowerCase() !== 'content-encoding') {
          res.setHeader(key, proxyRes.headers[key]);
        }
      });

      res.statusCode = proxyRes.statusCode;

      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const isTextual = contentType.includes('text') ||
                        contentType.includes('javascript') ||
                        contentType.includes('json') ||
                        contentType.includes('xml');

      if (!isTextual) {
        // Binarios (imágenes, fonts, etc.) — pasar directo sin tocar
        proxyRes.pipe(res);
        return;
      }

      // 3. Reescribir URLs internas en body textual
      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        body = replaceInternalUrls(body);
        res.removeHeader('content-length'); // el tamaño puede haber cambiado
        res.end(body);
      });
      proxyRes.on('error', err => {
        console.error('proxyRes error:', err.message);
        res.end();
      });
    },

    error: (err, req, res) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) res.status(502).send('Proxy error: ' + err.message);
    }
  }
}));

app.listen(10000, () => {
  console.log(`🔁 Proxy activo`);
  console.log(`   Target interno : ${TARGET}`);
  console.log(`   Host público   : https://${PUBLIC_HOST}`);
});
