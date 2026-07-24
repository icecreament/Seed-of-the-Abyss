/**
 * Zip dist/ into a small web package friends can open on phone browser
 * after you host it, or after they unzip and use any static server.
 * Also useful to upload to free hosts (Cloudflare/Netlify) with low traffic.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';

const root = cwd();
const dist = join(root, 'dist');
const outDir = join(root, 'release');
const outZip = join(outDir, 'SeedOfTheAbyss-web.zip');

if (!existsSync(join(dist, 'index.html'))) {
  console.log('dist/ missing, building...');
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

mkdirSync(outDir, { recursive: true });

// Prefer PowerShell Compress-Archive on Windows (no extra deps)
if (process.platform === 'win32') {
  const ps = `
    if (Test-Path -LiteralPath '${outZip.replace(/'/g, "''")}') {
      Remove-Item -LiteralPath '${outZip.replace(/'/g, "''")}' -Force
    }
    Compress-Archive -Path '${dist.replace(/'/g, "''")}\\*' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force
  `;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
} else {
  const r = spawnSync('zip', ['-r', outZip, '.'], { cwd: dist, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('zip failed. Install zip or run on Windows.');
    process.exit(r.status ?? 1);
  }
}

const mb = (statSync(outZip).size / (1024 * 1024)).toFixed(2);
console.log(`
========================================
网页包已生成:
  ${outZip}
  大小: ${mb} MB

用法：
1) 局域网（0 流量给朋友，若手机开热点电脑连它）:
   npm run share:lan
2) 上传 zip/dist 到免费静态托管，发链接
3) 要 APK 又不想装 Android Studio:
   推到 GitHub 后 Actions 会自动打 APK
========================================
`);
