/**
 * `expo start --localhost` binds the hostname "localhost". Node resolves that
 * to ::1 first, so a status poll of 127.0.0.1 never connects inside Docker.
 * Probe both loopback addresses and use whichever one answers.
 */
function metroLoopbackOrigins(port) {
  return [`http://127.0.0.1:${port}`, `http://[::1]:${port}`];
}

async function probeMetro(origin) {
  try {
    const response = await fetch(`${origin}/status`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok && (await response.text()).trim() === 'packager-status:running';
  } catch {
    return false;
  }
}

async function resolveMetroOrigin(port) {
  for (const origin of metroLoopbackOrigins(port)) {
    if (await probeMetro(origin)) return origin;
  }
  return null;
}

module.exports = { metroLoopbackOrigins, probeMetro, resolveMetroOrigin };
