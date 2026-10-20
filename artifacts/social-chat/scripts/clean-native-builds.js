const fs = require('node:fs/promises');
const path = require('node:path');

async function directories(directory) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(directory, entry.name));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// Only remove regenerable native compiler output, never package source or JS
// runtime directories. Do not follow dependency symlinks outside the workspace.
async function cleanNativeBuilds(workspaceRoot, dryRun = false) {
  const packages = [];
  for (const storeEntry of await directories(path.join(workspaceRoot, 'node_modules', '.pnpm'))) {
    for (const dependency of await directories(path.join(storeEntry, 'node_modules'))) {
      if (path.basename(dependency).startsWith('@')) packages.push(...await directories(dependency));
      else packages.push(dependency);
    }
  }
  const candidates = packages.flatMap(directory => [
    path.join(directory, 'android', 'build'),
    path.join(directory, 'android', '.cxx'),
    path.join(directory, 'android', '.gradle'),
    path.join(directory, 'ios', 'build'),
  ]);
  const nativeProject = path.join(workspaceRoot, 'artifacts', 'social-chat', 'android');
  candidates.push(
    path.join(nativeProject, 'app', 'build'),
    path.join(nativeProject, 'app', '.cxx'),
    path.join(nativeProject, 'build'),
    path.join(nativeProject, '.gradle'),
  );
  const cleaned = [];
  for (const directory of candidates) {
    let info;
    try { info = await fs.lstat(directory); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink()) continue;
    cleaned.push(path.relative(workspaceRoot, directory));
    if (!dryRun) await fs.rm(directory, { recursive: true });
  }
  return cleaned;
}

module.exports = { cleanNativeBuilds };

if (require.main === module) {
  cleanNativeBuilds(path.resolve(__dirname, '../../..'), process.argv.includes('--dry-run'))
    .then(paths => console.log(`Native build cleanup: ${paths.length} generated directories ${process.argv.includes('--dry-run') ? 'identified' : 'removed'}.`))
    .catch(error => { console.error('Native build cleanup failed:', error.message); process.exitCode = 1; });
}
