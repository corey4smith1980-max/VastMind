const http = require('node:http');
const test = require('node:test');
const strict = require('node:assert/strict');
const { resolveMetroOrigin } = require('./metro-origin');

function listen(host) {
  const server = http.createServer((req, res) => {
    res.end(req.url === '/status' ? 'packager-status:running' : 'no');
  });
  return new Promise((resolve) => {
    server.listen(0, host, () => resolve(server));
  });
}

test('Metro on IPv6 localhost is found when 127.0.0.1 refuses the connection', async () => {
  const server = await listen('localhost');
  try {
    const address = server.address();
    strict.equal(address.family, 'IPv6');
    await strict.rejects(fetch(`http://127.0.0.1:${address.port}/status`));
    strict.equal(await resolveMetroOrigin(address.port), `http://[::1]:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test('Metro on IPv4 loopback is still found', async () => {
  const server = await listen('127.0.0.1');
  try {
    const { port } = server.address();
    strict.equal(await resolveMetroOrigin(port), `http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
