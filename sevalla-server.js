const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();

  res.statusCode = 200;
  res.setHeader(
    'Content-Type',
    MIME_TYPES[ext] || 'application/octet-stream'
  );

  fs.createReadStream(filePath).pipe(res);
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function runApiHandler(req, res, filePath) {
  try {
    delete require.cache[require.resolve(filePath)];

    const handler = require(filePath);

    if (typeof handler !== 'function') {
      res.statusCode = 500;
      return res.end('API handler is not a function');
    }

    // Add query parameters in the same general shape
    // expected by Vercel Node functions.
    const parsedUrl = url.parse(req.url, true);

    req.query = parsedUrl.query;
    req.path = parsedUrl.pathname;

    // Collect body for POST/PUT/PATCH requests.
    if (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {
      const body = await getRequestBody(req);

      req.body = body;

      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/json') && body) {
        try {
          req.body = JSON.parse(body);
        } catch (_) {
          // Keep original body if it isn't valid JSON.
        }
      }
    }

    // Vercel-style response helpers.
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };

    res.json = function (data) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(data));
    };

    res.send = function (data) {
      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify(data));
      }

      return res.end(data);
    };

    await handler(req, res);
  } catch (error) {
    console.error('API error:', error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: 'Internal Server Error'
        })
      );
    }
  }
}

function resolveRoute(pathname) {
  // Exact Vercel-style rewrites.

  if (pathname === '/auth/login') {
    return path.join(ROOT, 'auth', 'login.html');
  }

  if (pathname === '/auth/signup') {
    return path.join(ROOT, 'auth', 'signup.html');
  }

  if (pathname === '/dashboard') {
    return path.join(ROOT, 'dashboard.html');
  }

  if (pathname.startsWith('/live/')) {
    return path.join(ROOT, 'live.html');
  }

  if (pathname.startsWith('/live-24-7/')) {
    return path.join(ROOT, 'live-24-7.html');
  }

  if (pathname === '/vip') {
    return path.join(ROOT, 'vip.html');
  }

  if (pathname === '/24-7') {
    return path.join(ROOT, '24-7.html');
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // --------------------------------------------------
    // API
    // --------------------------------------------------

    if (pathname.startsWith('/api/')) {
      let apiPath = pathname.substring('/api/'.length);

      // /api/stream -> /api/stream.json
      if (apiPath === 'stream') {
        apiPath = 'stream.json';
      }

      // /api/stream-24-7 -> /api/stream-24-7.js
      if (apiPath === 'stream-24-7') {
        apiPath = 'stream-24-7.js';
      }

      // /api/epg -> /api/epg.js
      if (apiPath === 'epg') {
        apiPath = 'epg.js';
      }

      // /api/token -> /api/token.js
      if (apiPath === 'token') {
        apiPath = 'token.js';
      }

      const apiFile = path.join(ROOT, 'api', apiPath);

      // Prevent path traversal.
      const apiRoot = path.resolve(ROOT, 'api');
      const resolvedApi = path.resolve(apiFile);

      if (
        resolvedApi !== apiRoot &&
        !resolvedApi.startsWith(apiRoot + path.sep)
      ) {
        res.statusCode = 403;
        return res.end('Forbidden');
      }

      // JSON API files are static.
      if (apiPath.endsWith('.json')) {
        return sendFile(res, resolvedApi);
      }

      // JavaScript API functions.
      if (apiPath.endsWith('.js')) {
        return runApiHandler(req, res, resolvedApi);
      }

      res.statusCode = 404;
      return res.end('API Not Found');
    }

    // --------------------------------------------------
    // Static directories
    // --------------------------------------------------

    if (pathname.startsWith('/assets/')) {
      const filePath = path.resolve(ROOT, pathname.substring(1));

      if (
        !filePath.startsWith(path.resolve(ROOT, 'assets') + path.sep)
      ) {
        res.statusCode = 403;
        return res.end('Forbidden');
      }

      return sendFile(res, filePath);
    }

    if (pathname.startsWith('/chat/')) {
      const filePath = path.resolve(ROOT, pathname.substring(1));

      if (
        !filePath.startsWith(path.resolve(ROOT, 'chat') + path.sep)
      ) {
        res.statusCode = 403;
        return res.end('Forbidden');
      }

      return sendFile(res, filePath);
    }

    // --------------------------------------------------
    // Service worker / manifest
    // --------------------------------------------------

    if (pathname === '/sw.js') {
      return sendFile(res, path.join(ROOT, 'sw.js'));
    }

    if (pathname === '/manifest.json') {
      return sendFile(res, path.join(ROOT, 'manifest.json'));
    }

    // --------------------------------------------------
    // Rewritten pages
    // --------------------------------------------------

    const rewrittenPage = resolveRoute(pathname);

    if (rewrittenPage) {
      return sendFile(res, rewrittenPage);
    }

    // --------------------------------------------------
    // Direct files
    // --------------------------------------------------

    let requestedFile = path.resolve(
      ROOT,
      pathname === '/' ? 'index.html' : pathname.substring(1)
    );

    // Prevent traversal.
    if (
      requestedFile !== ROOT &&
      !requestedFile.startsWith(ROOT + path.sep)
    ) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }

    if (fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()) {
      return sendFile(res, requestedFile);
    }

    // --------------------------------------------------
    // Vercel final fallback:
    // /(.*) -> /index.html
    // --------------------------------------------------

    return sendFile(res, path.join(ROOT, 'index.html'));

  } catch (error) {
    console.error('Server error:', error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FutbolX Sevalla server running on port ${PORT}`);
});
