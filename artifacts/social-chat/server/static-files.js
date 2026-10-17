const fs = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

function httpError(status) {
  return Object.assign(new Error('Request rejected'), { status });
}

// Check path components, not a string prefix ("/build-other" is not in "/build").
function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function assertSafePath(urlPath) {
  if (urlPath.includes('\0') || urlPath.includes('\\')) throw httpError(400);
  if (urlPath.split('/').some(part => part === '..' || part.startsWith('.'))) {
    throw httpError(403);
  }
}

async function openStaticFile(root, urlPath) {
  assertSafePath(urlPath);
  const candidate = path.resolve(root, `.${urlPath}`);
  if (!isWithin(root, candidate)) throw httpError(403);
  // Resolve symlinks before opening so an asset cannot expose a sibling/private tree.
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(candidate)]);
  if (!isWithin(realRoot, realFile)) throw httpError(403);
  const handle = await fs.open(realFile, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw httpError(404);
    return { handle, size: stat.size };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function serveStaticFile(root, urlPath, req, res, contentType, headers = {}) {
  const { handle, size } = await openStaticFile(root, urlPath);
  try {
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': size,
      'x-content-type-options': 'nosniff',
      ...headers,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    // Stream large bundles rather than synchronously reading them into memory.
    await pipeline(handle.createReadStream({ autoClose: false }), res);
  } finally {
    await handle.close();
  }
}

module.exports = { assertSafePath, httpError, serveStaticFile };
