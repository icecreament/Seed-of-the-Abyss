/**
 * One-command LAN share for phone play without APK.
 * Serves dist/ on the LAN. Auto-picks a free port if busy.
 */
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

console.log('先构建最新网页资源...');
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const dist = realpathSync(join(root, 'dist'));

function isInsideDist(filePath) {
  // relative 按当前平台处理大小写和分隔符，避免同名前缀目录绕过校验。
  const pathFromDist = relative(dist, filePath);
  return pathFromDist !== '..' && !pathFromDist.startsWith(`..${sep}`) && !isAbsolute(pathFromDist);
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
      let urlPath;
      try {
        urlPath = decodeURIComponent((req.url || '/').split('?')[0]).replace(/\\/g, '/');
      } catch {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }
      // 拒绝空字符及 Windows 盘符/备用数据流，不把无效请求交给文件系统。
      if (!urlPath.startsWith('/') || urlPath.includes('\0') || (process.platform === 'win32' && urlPath.includes(':'))) {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = join(dist, '.' + urlPath);
      if (!isInsideDist(filePath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      // 再校验真实路径，禁止符号链接或目录联接指向 dist 以外。
      const realFilePath = realpathSync(filePath);
      if (!isInsideDist(realFilePath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!statSync(realFilePath).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const body = readFileSync(realFilePath);
      const type = mime[extname(realFilePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch (e) {
      const status = e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 404
        : e.code === 'EACCES' || e.code === 'EPERM' ? 403 : 500;
      res.writeHead(status);
      res.end(status === 404 ? 'Not found' : status === 403 ? 'Forbidden' : 'Internal server error');
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
