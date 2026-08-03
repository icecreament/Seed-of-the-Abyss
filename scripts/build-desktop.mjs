/**
 * Build Windows portable exe with China mirrors (avoid GitHub timeouts).
 * Output: release/SeedOfTheAbyss-0.1.0-portable.exe
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
      ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('=== Seed of the Abyss · desktop exe ===');
console.log('Node', process.version);

run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build']);

// Ensure electron binary exists (postinstall may have failed offline)
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(electronExe)) {
  console.log('Electron binary missing, running electron install via mirror...');
  run('node', [join('node_modules', 'electron', 'install.js')]);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${u}`));
        const out = createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// electron-builder always unpacks winCodeSign when packaging on Windows. The
// archive contains macOS symlinks (darwin/**.dylib) that 7-Zip cannot create
// without admin rights or Developer Mode, so pre-seed the cache without them
// (Windows packaging only needs signtool.exe and rcedit from this archive).
async function ensureWinCodeSignCache() {
  if (process.platform !== 'win32') return;
  const version = '2.6.0';
  const cacheDir = join(
    process.env.LOCALAPPDATA,
    'electron-builder', 'Cache', 'winCodeSign', `winCodeSign-${version}`,
  );
  const signtool = join(cacheDir, 'windows-10', 'x64', 'signtool.exe');
  if (existsSync(signtool)) return;
  console.log('Pre-seeding winCodeSign cache (skipping macOS symlinks)...');
  const archive = join(tmpdir(), `winCodeSign-${version}.7z`);
  await download(
    `https://npmmirror.com/mirrors/electron-builder-binaries/winCodeSign-${version}/winCodeSign-${version}.7z`,
    archive,
  );
  mkdirSync(cacheDir, { recursive: true });
  const sevenZa = join(root, 'node_modules', '7zip-bin', 'win', process.arch, '7za.exe');
  const r = spawnSync(sevenZa, ['x', '-bd', '-y', archive, `-o${cacheDir}`, '-xr!*.dylib'], { stdio: 'inherit' });
  rmSync(archive, { force: true });
  if (r.status !== 0 || !existsSync(signtool)) {
    console.error('Failed to prepare winCodeSign cache; run as Administrator or enable Developer Mode.');
    process.exit(1);
  }
}

await ensureWinCodeSignCache();

run('npx', ['electron-builder', '--win', 'portable']);

const releaseDir = join(root, 'release');
const files = existsSync(releaseDir) ? readdirSync(releaseDir) : [];
const exe = files.find((f) => f.endsWith('.exe') && f.includes('SeedOfTheAbyss'));
console.log('\n========================================');
if (exe) {
  console.log('EXE 已生成:');
  console.log('  ' + join(releaseDir, exe));
} else {
  console.log('未找到 portable exe，请检查 release/ 目录:');
  console.log(files.join('\n') || '(empty)');
  process.exit(1);
}
console.log('========================================\n');
