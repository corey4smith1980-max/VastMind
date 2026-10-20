const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanNativeBuilds } = require('../scripts/clean-native-builds');

test('deployment cleanup removes native intermediates but preserves runtime files and APKs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vastmind-native-cleanup-'));
  try {
    const dependency = 'node_modules/.pnpm/example/node_modules/example';
    const removed = [`${dependency}/android/build/library.so`, `${dependency}/android/.cxx/cache`, 'artifacts/social-chat/android/app/build/output.apk'];
    const retained = [`${dependency}/android/src/source.kt`, `${dependency}/build/index.js`, 'generated-artifacts/vastmind.apk'];
    for (const file of [...removed, ...retained]) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), 'fixture');
    }
    const dryRun = await cleanNativeBuilds(root, true);
    assert.equal(dryRun.length, 3);
    await fs.access(path.join(root, removed[0]));
    await cleanNativeBuilds(root);
    for (const file of removed) await assert.rejects(fs.access(path.join(root, file)), { code: 'ENOENT' });
    for (const file of retained) await fs.access(path.join(root, file));
    assert.deepEqual(await cleanNativeBuilds(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
