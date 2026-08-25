import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);
const videoServiceUrl = process.env.VIDEO_SERVICE_URL || 'http://127.0.0.1:8600';
const storageServiceUrl = process.env.STORAGE_SERVICE_URL || 'http://127.0.0.1:8700';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function proxyTo(
  req: IncomingMessage,
  res: ServerResponse,
  prefix: string,
  serviceUrl: string,
  label: string,
  hint: string
) {
  const raw = req.url || '/';
  const stripped = raw.startsWith(prefix) ? raw.slice(prefix.length) || '/' : raw;
  const target = new URL(stripped, serviceUrl);

  const headers = { ...req.headers, host: target.host };
  delete headers['connection'];

  const proxyReq = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? '443' : '80'),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error(`[${label} proxy]`, err.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ detail: `${hint} (${serviceUrl})` }));
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const url = req.url || '/';
      if (url === '/video-api' || url.startsWith('/video-api/')) {
        proxyTo(
          req,
          res,
          '/video-api',
          videoServiceUrl,
          'video-api',
          '视频服务不可用，请执行: powershell -File scripts/start-video.ps1'
        );
        return;
      }
      if (url === '/storage-api' || url.startsWith('/storage-api/')) {
        proxyTo(
          req,
          res,
          '/storage-api',
          storageServiceUrl,
          'storage-api',
          '附件服务不可用，请执行: powershell -File scripts/start-storage.ps1'
        );
        return;
      }
      const parsedUrl = parse(url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`
    );
    console.log(`> Video proxy /video-api → ${videoServiceUrl}`);
    console.log(`> Storage proxy /storage-api → ${storageServiceUrl}`);
  });
});
