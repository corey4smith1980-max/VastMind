/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { assertSafePath, httpError, serveStaticFile } = require('./static-files');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return typeof appJson.expo?.name === 'string'
      ? appJson.expo.name
      : 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

async function serveManifest(root, platform, req, res) {
  if (platform !== 'ios' && platform !== 'android') throw httpError(400);
  await serveStaticFile(root, `/${platform}/manifest.json`, req, res, 'application/json', {
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
    'cache-control': 'no-store',
  });
}

function serveLandingPage(req, res, landingPageTemplate, appName, mount, origin) {
  const { protocol, host } = origin;
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `exps://${host}${mount}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, escapeHtml(baseUrl))
    .replace(/EXPS_URL_ATTRIBUTE_PLACEHOLDER/g, escapeHtml(expsUrl))
    .replace(/EXPS_URL_JSON_PLACEHOLDER/g, toScriptString(expsUrl))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(req.method === 'HEAD' ? undefined : html);
}

function validateHost(host) {
  if (typeof host !== 'string' || !host || host.length > 253 ||
      !/^[a-zA-Z0-9.:\[\]-]+$/.test(host)) throw httpError(400);
  try {
    const parsed = new URL(`https://${host}`);
    if (!parsed.hostname) throw httpError(400);
    return parsed.host;
  } catch {
    throw httpError(400);
  }
}

function requestOrigin(req) {
  const directHost = validateHost(req.headers.host);
  const forwardedHost = req.headers['x-forwarded-host'];
  const forwardedProto = req.headers['x-forwarded-proto'];
  if ((forwardedHost !== undefined && typeof forwardedHost !== 'string') ||
      (forwardedProto !== undefined && typeof forwardedProto !== 'string')) throw httpError(400);
  const host = forwardedHost === undefined ? directHost : validateHost(forwardedHost.split(',')[0].trim());
  const protocol = forwardedProto === undefined ? 'https' : forwardedProto.split(',')[0].trim().toLowerCase();
  if (protocol !== 'https' && protocol !== 'http') throw httpError(400);
  return { host, protocol };
}

function requestPath(req) {
  const raw = req.url || '/';
  // Accept origin-form URLs only; never use an untrusted Host as the parse base.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('#')) throw httpError(400);
  let pathname;
  try {
    pathname = decodeURIComponent(raw.split('?')[0]);
  } catch {
    throw httpError(400);
  }
  assertSafePath(pathname);
  return pathname;
}

function respondError(error, res) {
  if (res.destroyed) return;
  if (res.headersSent) { res.destroy(); return; }
  const status = error.status ||
    (['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 :
      ['EACCES', 'EPERM', 'ELOOP'].includes(error.code) ? 403 : 500);
  const message = { 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed' }[status] || 'Internal Server Error';
  if (status >= 500) {
    // Do not log member input, filesystem paths, or full exception messages.
    process.stderr.write(`${JSON.stringify({ event: 'static_request_failed', code: error.code || 'UNEXPECTED' })}\n`);
  }
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(status === 405 ? { allow: 'GET, HEAD' } : {}),
  });
  res.end(message);
}

// Export a factory so input-handling tests use a separate ephemeral server/tree.
function createAppServer({ staticRoot = STATIC_ROOT, templatePath = TEMPLATE_PATH, mount = basePath } = {}) {
  const landingPageTemplate = fs.readFileSync(templatePath, 'utf-8');
  const appName = getAppName();
  mount = mount.replace(/\/+$/, '');
  return http.createServer({
    headersTimeout: 10_000,
    requestTimeout: 15_000,
    keepAliveTimeout: 5_000,
    maxHeaderSize: 16 * 1024,
  }, async (req, res) => {
    try {
      const origin = requestOrigin(req);
      let pathname = requestPath(req);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405);
      if (pathname === '/healthz') {
        const body = JSON.stringify({ status: 'ok' });
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(body),
          'cache-control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      if (mount) {
        if (pathname !== mount && !pathname.startsWith(`${mount}/`)) throw httpError(404);
        pathname = pathname.slice(mount.length) || '/';
      }
      if (pathname === '/' || pathname === '/manifest') {
        const platform = req.headers['expo-platform'];
        if (platform !== undefined) return await serveManifest(staticRoot, platform, req, res);
        if (pathname === '/') return serveLandingPage(req, res, landingPageTemplate, appName, mount, origin);
      }
      const contentType = MIME_TYPES[path.extname(pathname).toLowerCase()] || 'application/octet-stream';
      await serveStaticFile(staticRoot, pathname, req, res, contentType);
    } catch (error) {
      // Parsing, missing/racing files, and aborted streams are request failures,
      // not uncaught exceptions that terminate all members' application access.
      respondError(error, res);
    }
  });
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const server = createAppServer();
  server.listen(port, process.env.LISTEN_HOST || '::', () => {
    process.stdout.write(`Serving static Expo build on port ${port}\n`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}

module.exports = { createAppServer };
