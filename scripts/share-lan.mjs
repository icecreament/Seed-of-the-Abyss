/**
 * One-command LAN share for phone play without APK.
 * Serves dist/ on the LAN. Auto-picks a free port if busy.
 */
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.log('dist/ 不存在，先构建...');
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const preferred = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

function ips() {
  const out = [];
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

function createApp() {
  return createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = normalize(join(dist, '.' + urlPath));
      if (!filePath.startsWith(dist)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const type = mime[extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(readFileSync(filePath));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
}

function listen(port, triesLeft = 8) {
  const server = createApp();
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && triesLeft > 0) {
      listen(port + 1, triesLeft - 1);
      return;
    }
    console.error(err);
    process.exit(1);
  });
  server.listen(port, '0.0.0.0', () => {
    const list = ips();
    console.log('\n=== 局域网试玩（手机浏览器打开）===');
    console.log(`本机: http://localhost:${port}`);
    if (list.length === 0) {
      console.log('未检测到局域网 IP，请确认 Wi-Fi/网线已连接。');
    } else {
      for (const ip of list) console.log(`手机打开: http://${ip}:${port}`);
    }
    console.log('手机和电脑需同一网络。Ctrl+C 结束。\n');
  });
}

listen(preferred);
