/* Native generated RGBA, not a beauty/fun score. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const reference = require('./fixtures/portrait-silhouette-v1.json');
const OUT = path.resolve(process.env.SEED_SILHOUETTE_OUTPUT || 'output/portrait-silhouette-v1/checks');
const IDS = ['warden', 'reaver', 'shade', 'thorn'];
const checks = [], errors = [];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(OUT, { recursive: true });
assert.ok(!fs.existsSync(path.join(OUT, 'silhouette-browser.json')), 'Do not overwrite an existing run');

async function check(name, fn) {
  try {
    const details = await fn();
    checks.push({ name, passed: true, details }); console.log('PASS', name);
  } catch (error) {
    checks.push({ name, passed: false, error: error.message }); throw error;
  }
}
function cropRGBA(row, [x, y, width, height]) {
  const bytes = Buffer.alloc(width * height * 4);
  for (let dy = 0; dy < height; dy++) row.rgba.copy(bytes, dy * width * 4,
    ((y + dy) * row.width + x) * 4, ((y + dy) * row.width + x + width) * 4);
  return bytes;
}
function occupancy(row) {
  return Uint8Array.from({ length: row.width * row.height }, (_, i) => row.rgba[i * 4 + 3] ? 1 : 0);
}
function componentSizes(alpha, width, height) {
  const seen = new Uint8Array(alpha.length), sizes = [];
  for (let start = 0; start < alpha.length; start++) {
    if (!alpha[start] || seen[start]) continue;
    const stack = [start]; let size = 0; seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % width, y = Math.floor(i / width); size++;
      const neighbours = [];
      if (x > 0) neighbours.push(i - 1);
      if (x < width - 1) neighbours.push(i + 1);
      if (y > 0) neighbours.push(i - width);
      if (y < height - 1) neighbours.push(i + width);
      for (const next of neighbours) if (alpha[next] && !seen[next]) {
        seen[next] = 1; stack.push(next);
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath:
    process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  try {
    await page.goto(process.env.SEED_TEST_URL || 'http://127.0.0.1:5173');
    await page.waitForFunction(() => window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
    const raw = await page.evaluate(keys => keys.map(key => {
      const t = window.__seedGame.textures.get(key), c = t.getSourceImage();
      return { key, width: c.width, height: c.height, filter: t.source[0].scaleMode,
        rgba: Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data),
        png: c.toDataURL().split(',')[1] };
    }), Object.keys(reference.portraits));
    const portraits = Object.fromEntries(raw.map(row => [row.key, { ...row, rgba: Buffer.from(row.rgba) }]));
    for (const [key, old] of Object.entries(reference.portraits)) {
      await check(key + ': changed silhouette, connected equipment, exact original boots', () => {
        const row = portraits[key], oldAlpha = Buffer.from(old.alphaMaskBase64, 'base64');
        assert.deepEqual([row.width, row.height], [128, 160]);
        assert.equal(row.filter, 1, 'Native nearest-neighbour sampling required');
        assert.equal(oldAlpha.length, 2560, 'Reference covers every native pixel');
        const alpha = occupancy(row), sizes = componentSizes(alpha, row.width, row.height);
        let alphaDelta = 0, opaque = 0, sole = 0, left = 128, top = 160, right = -1, bottom = -1;
        for (let i = 0; i < alpha.length; i++) {
          const a = row.rgba[i * 4 + 3];
          assert.ok(a === 0 || a === 255, 'No antialiasing');
          if (alpha[i] !== ((oldAlpha[i >> 3] >> (7 - i % 8)) & 1)) alphaDelta++;
          if (!alpha[i]) continue;
          const x = i % row.width, y = Math.floor(i / row.width); opaque++;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
          if (y >= 148 && y < 150) sole++;
        }
        // Conservative geometry floor, NOT an aesthetic ranking or pixel-change target.
        assert.ok(alphaDelta >= 256, key + ': substantial silhouette change required: ' + alphaDelta);
        assert.ok(left >= 2 && right < 126 && top >= 2 && bottom === 149, 'Clipping/sole anchor drift');
        assert.ok(opaque > 6000 && sole > 0);
        assert.ok(sizes[0] / opaque > .995, 'Large equipment/head piece detached');
        assert.ok(sizes.slice(1).every(size => size <= 4), 'Detached silhouette larger than a pixel fleck');
        assert.equal(hash(cropRGBA(row, old.footRegion)), old.footRGBAHash, key + ': boots moved/redrawn');
        fs.writeFileSync(path.join(OUT, key + '.png'), Buffer.from(row.png, 'base64'));
        return { alphaDelta, opaque, bounds: [left, top, right + 1, bottom + 1],
          largestComponent: sizes[0], detachedFlecks: sizes.slice(1), footRegion: old.footRegion,
          rgbaSHA256: hash(row.rgba) };
      });
    }
    await check('Awakened faces preserve all four base-form focal regions exactly', () => {
      for (const id of IDS) {
        const region = reference.faceRegions[id];
        assert.deepEqual(cropRGBA(portraits['portrait_' + id + '_awakened'], region),
          cropRGBA(portraits['portrait_' + id], region), id + ': awakening covers face');
      }
      return reference.faceRegions;
    });
    await check('Awakening changes physical silhouettes, not merely palette/glow', () => IDS.map(id => {
      const base = occupancy(portraits['portrait_' + id]), awake = occupancy(portraits['portrait_' + id + '_awakened']);
      let changed = 0;
      for (let i = 0; i < base.length; i++) if (base[i] !== awake[i]) changed++;
      assert.ok(changed >= 256, id + ': awake/base geometry insufficiently distinct: ' + changed);
      return { id, changedAlphaPixels: changed };
    }));
    await check('All 44 static non-portrait textures preserve size and exact RGBA', async () => {
      const rows = await page.evaluate(() => window.__seedGame.textures.getTextureKeys()
        .filter(key => /^[a-z][a-z0-9_]+$/.test(key) && !key.startsWith('portrait_')).sort().flatMap(key => {
          const c = window.__seedGame.textures.get(key).getSourceImage();
          return typeof c.getContext === 'function' ? [{ key, width: c.width, height: c.height,
            rgba: Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) }] : [];
        }));
      const actual = Object.fromEntries(rows.map(row => [row.key,
        { width: row.width, height: row.height, sha256: hash(Buffer.from(row.rgba)) }]));
      assert.equal(Object.keys(reference.nonPortraitTextures).length, 44);
      assert.deepEqual(actual, reference.nonPortraitTextures);
      fs.writeFileSync(path.join(OUT, 'non-portrait-rgba.json'), JSON.stringify(actual, null, 2));
      return { matched: rows.length,
        scope: 'Named generated canvas textures at Menu; excludes dynamic text UUIDs and Phaser builtins.' };
    });
    const sheet = await page.evaluate(ids => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 700;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#12101c'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = '12px monospace'; ctx.textBaseline = 'top';
      for (const [i, id] of ids.entries()) for (const [j, suffix] of ['', '_awakened'].entries()) {
        const key = 'portrait_' + id + suffix;
        ctx.drawImage(window.__seedGame.textures.get(key).getSourceImage(), i * 256, j * 350 + 20, 256, 320);
        ctx.fillStyle = '#dddce6'; ctx.fillText(id + suffix, i * 256 + 12, j * 350 + 8);
      }
      return c.toDataURL().split(',')[1];
    }, IDS);
    fs.writeFileSync(path.join(OUT, 'sheet.png'), Buffer.from(sheet, 'base64'));
    await check('No unhandled browser exceptions during generation/rendering', () => {
      assert.deepEqual(errors, []); return errors;
    });
  } finally {
    fs.writeFileSync(path.join(OUT, 'silhouette-browser.json'), JSON.stringify({ checks, errors,
      scope: 'Native RGBA, conservative silhouette/component checks, old boot regions, base/awake faces, static non-portrait textures. Not subjective beauty, human fun, natural balance or physical-device acceptance.' }, null, 2));
    await browser.close();
  }
  console.log('Portrait silhouette browser: ' + checks.length + '/' + checks.length);
})().catch(error => { console.error(error); process.exitCode = 1; });
