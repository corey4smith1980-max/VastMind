const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createAppServer } = require('./serve');

describe('production Expo request handling', () => {
  let temp, root, server, port;
  before(async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'iam-static-test-'));
    root = path.join(temp, 'build');
    await fs.mkdir(path.join(root, 'ios'), { recursive: true });
    await fs.mkdir(path.join(root, 'android'));
    await fs.mkdir(path.join(temp, 'build-private'));
    await fs.writeFile(path.join(temp, 'build-private', 'secret.txt'), 'private-data');
    await fs.writeFile(path.join(root, 'ios', 'manifest.json'), '{"platform":"ios"}');
    await fs.writeFile(path.join(root, 'android', 'manifest.json'), '{"platform":"android"}');
    await fs.writeFile(path.join(root, 'entry.js'), 'globalThis.ready = true;');
    await fs.writeFile(path.join(root, '.env'), 'not-public');
    await fs.writeFile(path.join(root, 'large.bin'), Buffer.alloc(2 * 1024 * 1024));
    await fs.symlink(path.join(temp, 'build-private', 'secret.txt'), path.join(root, 'escape.txt'));
    const templatePath = path.join(temp, 'landing.html');
    await fs.writeFile(templatePath, '<!doctype html><html><title>APP_NAME_PLACEHOLDER</title><a href="EXPS_URL_ATTRIBUTE_PLACEHOLDER">Open</a><script>const url=EXPS_URL_JSON_PLACEHOLDER;</script></html>');
    server = createAppServer({ staticRoot: root, templatePath, mount: '/mobile' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });
  after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  });

  function request(urlPath = '/mobile/', headers = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method, headers, agent: false }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  }
  async function assertAlive() {
    assert.equal((await request()).status, 200, 'a rejected request must not terminate the server');
  }

  it('serves the landing page without caching or content sniffing', async () => {
    const res = await request();
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.text, /<title>VastMind<\/title>/);
  });
  it('rejects the malformed Host that previously crashed the process', async () => {
    assert.equal((await request('/mobile/', { Host: '[' })).status, 400);
    await assertAlive();
  });
  it('rejects Host credentials, invalid ports, and markup injection', async () => {
    for (const Host of ['user@example.test', 'example.test:99999', 'example.test"><script>']) {
      assert.equal((await request('/mobile/', { Host })).status, 400);
    }
    await assertAlive();
  });
  it('validates forwarded host/protocol before using them in links', async () => {
    assert.equal((await request('/mobile/', { 'x-forwarded-host': 'evil.test"><script>' })).status, 400);
    assert.equal((await request('/mobile/', { 'x-forwarded-proto': 'javascript' })).status, 400);
    const valid = await request('/mobile/', {
      'x-forwarded-host': 'public.example:443, proxy.internal',
      'x-forwarded-proto': 'https, http',
    });
    assert.equal(valid.status, 200);
    assert.match(valid.text, /exps:\/\/public\.example\/mobile/);
    await assertAlive();
  });
  it('returns controlled errors for malformed encodings and absolute URLs', async () => {
    for (const urlPath of ['/mobile/%ZZ', '/mobile/%00file', '/mobile/%5cfile', '//other.test/mobile/', 'http://other.test/']) {
      assert.equal((await request(urlPath)).status, 400, urlPath);
    }
    await assertAlive();
  });
  it('rejects raw, encoded, and encoded-separator traversal', async () => {
    for (const urlPath of ['/mobile/../build-private/secret.txt', '/mobile/%2e%2e/build-private/secret.txt', '/mobile/%2e%2e%2fbuild-private/secret.txt']) {
      const res = await request(urlPath);
      assert.equal(res.status, 403);
      assert.doesNotMatch(res.text, /private-data/);
    }
  });
  it('rejects a symlink escaping the static tree', async () => {
    const res = await request('/mobile/escape.txt');
    assert.equal(res.status, 403);
    assert.doesNotMatch(res.text, /private-data/);
  });
  it('does not expose hidden files', async () => {
    assert.equal((await request('/mobile/.env')).status, 403);
  });
  it('does not confuse a sibling URL prefix with the artifact mount', async () => {
    assert.equal((await request('/mobile-other/entry.js')).status, 404);
    assert.equal((await request('/entry.js')).status, 404);
  });
  it('serves regular assets with a known MIME type', async () => {
    const res = await request('/mobile/entry.js?v=1');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/javascript/);
    assert.equal(res.text, 'globalThis.ready = true;');
  });
  it('supports HEAD without returning asset bytes', async () => {
    const res = await request('/mobile/entry.js', {}, 'HEAD');
    assert.equal(res.status, 200);
    assert.equal(res.text, '');
    assert.equal(Number(res.headers['content-length']), Buffer.byteLength('globalThis.ready = true;'));
  });
  it('serves both whitelisted Expo manifests and rejects other platforms', async () => {
    for (const platform of ['ios', 'android']) {
      const res = await request('/mobile/manifest', { 'expo-platform': platform });
      assert.equal(res.status, 200);
      assert.equal(JSON.parse(res.text).platform, platform);
      assert.equal(res.headers['expo-protocol-version'], '1');
    }
    assert.equal((await request('/mobile/manifest', { 'expo-platform': '../build-private' })).status, 400);
    await assertAlive();
  });
  it('returns 404 for absent files and directories without filesystem details', async () => {
    for (const urlPath of ['/mobile/not-here.js', '/mobile/ios']) {
      const res = await request(urlPath);
      assert.equal(res.status, 404);
      assert.equal(res.text, 'Not Found');
      assert.doesNotMatch(res.text, /ENOENT|tmp|build/);
    }
    await assertAlive();
  });
  it('handles a file removed after an earlier successful request', async () => {
    await fs.writeFile(path.join(root, 'removed.txt'), 'temporary');
    assert.equal((await request('/mobile/removed.txt')).status, 200);
    await fs.unlink(path.join(root, 'removed.txt'));
    assert.equal((await request('/mobile/removed.txt')).status, 404);
    await assertAlive();
  });
  it('rejects unsupported methods without changing files', async () => {
    const res = await request('/mobile/entry.js', {}, 'POST');
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
    assert.equal((await request('/mobile/entry.js')).status, 200);
  });
  it('survives a client disconnect during a streamed asset', async () => {
    await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/mobile/large.bin', agent: false }, res => {
        res.once('data', () => { res.destroy(); resolve(); });
      });
      req.on('error', reject);
    });
    await assertAlive();
  });
});
