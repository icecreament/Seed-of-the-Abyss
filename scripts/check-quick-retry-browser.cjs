"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(process.env.SEED_RETRY_OUTPUT || 'output/quick-retry-v1/browser');
fs.mkdirSync(OUT, { recursive: true });
const checks = [], errors = [];
let page, browser;
const fixtureRun = { floor: 2, kills: 5, timeAliveSec: 35, damageDealt: 240,
  classId: 'warden', outcome: 'death', mutations: ['shared_feast'], bestChain: 4, eliteBreaks: 1 };
async function check(name, fn) {
  try { const detail = await fn(); checks.push({ name, passed: true, detail }); console.log('PASS', name); }
  catch (error) { checks.push({ name, passed: false, error: String(error.stack) });
    await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {}); throw error; }
}
async function boot(context) {
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(String(e.stack)));
  await p.addInitScript(() => localStorage.setItem('seed_of_the_abyss_save_v1', JSON.stringify({
    essence: 200, lifetimeEssence: 200, totalDeaths: 0, deepestFloor: 0,
    talentRanks: { growth_root: 2, pred_fang: 1 }, selectedClass: 'warden',
    unlockedClasses: ['warden', 'reaver', 'shade', 'thorn'], seedStage: 6, language: 'zh',
    video: { renderScale: 1, fullscreen: false, winW: 1280, winH: 720 },
    feedback: { sfxVolume: 0, impactMotion: false }
  })));
  await p.goto(process.env.SEED_RETRY_URL || 'http://127.0.0.1:5173');
  await p.waitForFunction(() => window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
  await p.evaluate(() => {
    window.retryStarts = 0;
    const s = window.__seedGame.scene.getScene('Run'), create = s.create;
    s.create = function (...args) { window.retryStarts++; return create.apply(this, args); };
  });
  return p;
}
async function fixture(classId = 'warden', outcome = 'death', noRun = false) {
  await page.keyboard.up('r');
  const result = await page.evaluate(({ metrics, classId, outcome, noRun }) => {
    const g = window.__seedGame, d = window.__seedDev;
    const old = g.scene.getScene('Run');
    if (old.player) { old.kills = 777; old.build.acquire('shared_feast'); old.player.stats.hp = 1; }
    window.priorRetryPlayer = old.player;
    for (const s of g.scene.getScenes(true)) g.scene.stop(s.sys.settings.key);
    d.saveSystem.setSelectedClass(classId === 'thorn' ? 'warden' : 'thorn');
    window.beforeRetryFixture = d.saveSystem.snapshot;
    d.runState.lastRun = noRun ? null : { ...metrics, classId, outcome: outcome === 'legacy' ? undefined : outcome };
    d.runState.deathSettled = false;
    window.fixtureRunIdentity = d.runState.lastRun;
    window.startsBeforeRetry = window.retryStarts;
    g.scene.start('Death');
    return window.beforeRetryFixture;
  }, { metrics: fixtureRun, classId, outcome, noRun });
  await active('Death');
  const after = await page.evaluate(() => window.__seedDev.saveSystem.snapshot);
  const gained = noRun ? 0 : 32 + (outcome === 'victory' ? 100 : 0);
  assert.equal(after.essence, result.essence + gained);
  assert.equal(after.lifetimeEssence, result.lifetimeEssence + gained);
  assert.equal(after.totalDeaths, result.totalDeaths + (!noRun && (outcome === 'death' || outcome === 'legacy') ? 1 : 0));
  await page.evaluate(() => { window.settledRetrySave = window.__seedDev.saveSystem.snapshot; });
  return { before: result, after, gained };
}
async function active(key) {
  await page.waitForFunction(key => { const s = window.__seedGame.scene.getScene(key);
    return s?.sys.isActive() && s.cameras.main.fadeEffect.alpha === 0; }, key);
}
async function click(x, y, touch = false) {
  const b = await page.locator('canvas').boundingBox();
  const point = { x: b.x + b.width * x / 1280, y: b.y + b.height * y / 720 };
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
async function fresh(classId) {
  await active('Run');
  const r = await page.evaluate(() => {
    const s = window.__seedGame.scene.getScene('Run'), d = window.__seedDev;
    s.enemies.clear(true, true); s.spawnTimer = s.floorTimer = -1e9;
    const { selectedClass: _, ...before } = window.settledRetrySave;
    const { selectedClass, ...after } = d.saveSystem.snapshot;
    return { classId: s.player.classId, selectedClass, freshPlayer: s.player !== window.priorRetryPlayer,
      hp: s.player.stats.hp, maxHp: s.player.stats.maxHp, kills: s.kills, floor: s.floor,
      build: s.build.owned, cooldowns: ['attack','dash','skill'].map(k => s.player.cooldownRemaining(k)),
      oldMetricsPreserved: d.runState.lastRun === window.fixtureRunIdentity,
      settled: d.runState.deathSettled, starts: window.retryStarts - window.startsBeforeRetry,
      deathActive: window.__seedGame.scene.getScene('Death').sys.isActive(),
      listeners: window.__seedGame.scene.getScene('Death').input.keyboard.listenerCount('keydown-R'),
      before, after };
  });
  assert.equal(r.classId, classId); assert.equal(r.selectedClass, classId);
  assert.equal(r.freshPlayer, true); assert.equal(r.hp, r.maxHp);
  assert.deepEqual(r.build, []); assert.deepEqual(r.cooldowns, [0,0,0]);
  assert.equal(r.floor, 1); assert.equal(r.kills, 0); assert.equal(r.starts, 1);
  assert.equal(r.deathActive, false); assert.equal(r.listeners, 0);
  assert.equal(r.oldMetricsPreserved, true); assert.deepEqual(r.after, r.before);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.retryStarts - window.startsBeforeRetry), 1);
  return r;
}
(async () => {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.SEED_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    page = await boot(await browser.newContext({ viewport: { width: 1280, height: 720 } }));
    for (const id of ['warden','reaver','shade','thorn']) await check(`${id}: real mouse retries same profession; clean Run, unchanged rewards/talents/preferences`, async () => {
      await fixture(id); await click(640,662); const r = await fresh(id); assert.equal(r.settled,true); return r;
    });
    await check('real R shortcut starts exactly one Run', async () => {
      await fixture('shade'); await page.keyboard.press('r'); return fresh('shade');
    });
    for (const outcome of ['victory','abandoned']) await check(`${outcome}: correct settlement, retry does not add death or rewards`, async () => {
      const settlement = await fixture('reaver',outcome); await click(640,662); return { settlement, run: await fresh('reaver') };
    });
    await check('legacy outcome omitted still settles as one death', async () => {
      const before = await page.evaluate(() => window.__seedDev.saveSystem.totalDeaths);
      await fixture('warden','legacy');
      assert.equal(await page.evaluate(() => window.__seedDev.saveSystem.totalDeaths),before+1);
      await page.keyboard.press('r'); return fresh('warden');
    });
    await check('no-run fallback uses saved selection without settlement', async () => {
      const s = await fixture('warden','death',true); await click(640,662); const r=await fresh('thorn');
      assert.equal(r.settled,false); return { settlement:s,run:r };
    });
    await check('Death restart does not repeat settlement or accumulate R listeners', async () => {
      await fixture('shade');
      for(let i=0;i<3;i++) { await page.evaluate(() => window.__seedGame.scene.getScene('Death').scene.restart()); await active('Death'); }
      const r=await page.evaluate(() => ({ save:window.__seedDev.saveSystem.snapshot,
        expected:window.settledRetrySave, listeners:window.__seedGame.scene.getScene('Death').input.keyboard.listenerCount('keydown-R') }));
      assert.deepEqual(r.save,r.expected); assert.equal(r.listeners,1); await page.keyboard.press('r'); await fresh('shade'); return r;
    });
    await check('engine-event fixture: repeat rejected; same event cannot replay after scene restart', async () => {
      await fixture('thorn');
      await page.evaluate(() => { const k=window.__seedGame.scene.getScene('Death').input.keyboard;
        k.emit('keydown-R',new KeyboardEvent('keydown',{key:'r',repeat:true})); });
      await page.waitForTimeout(300); assert.equal(await page.evaluate(() => window.retryStarts-window.startsBeforeRetry),0);
      await page.evaluate(() => { window.usedRetryEdge=new KeyboardEvent('keydown',{key:'r'});
        window.__seedGame.scene.getScene('Death').input.keyboard.emit('keydown-R',window.usedRetryEdge); });
      await fresh('thorn'); await fixture('thorn');
      await page.evaluate(() => window.__seedGame.scene.getScene('Death').input.keyboard.emit('keydown-R',window.usedRetryEdge));
      await page.waitForTimeout(300); assert.equal(await page.evaluate(() => window.retryStarts-window.startsBeforeRetry),0);
      await page.keyboard.press('r'); return fresh('thorn');
    });
    await check('real double-click plus R during fade only starts once', async () => {
      await fixture('reaver'); const b=await page.locator('canvas').boundingBox();
      await page.mouse.dblclick(b.x+b.width/2,b.y+b.height*662/720,{delay:20});
      await page.keyboard.press('r'); return fresh('reaver');
    });
    await check('release from prior scene cannot activate retry without matching down', async () => {
      await page.mouse.move(640,662); await page.mouse.down(); await fixture('warden'); await page.mouse.up();
      await page.waitForTimeout(350); assert.equal(await page.evaluate(() => window.retryStarts-window.startsBeforeRetry),0);
      await click(640,662); return fresh('warden');
    });
    for (const [x,key] of [[400,'Talent'],[880,'Menu']]) await check(`existing ${key} button still works; no retry or extra settlement`,async () => {
      await fixture('warden'); await click(x,662); await active(key);
      const r=await page.evaluate(() => ({ starts:window.retryStarts-window.startsBeforeRetry,
        save:window.__seedDev.saveSystem.snapshot, expected:window.settledRetrySave,
        listeners:window.__seedGame.scene.getScene('Death').input.keyboard.listenerCount('keydown-R') }));
      assert.equal(r.starts,0); assert.equal(r.listeners,0); assert.deepEqual(r.save,r.expected); return r;
    });
    for(const lang of ['zh','en']) for(const scale of [0.75,1,1.5,2]) await check(`${lang} layout and actual retry hit at renderScale ${scale}`,async () => {
      await page.evaluate(({lang,scale})=>{ window.__seedDev.saveSystem.setLanguage(lang); window.__seedDev.applyRenderScale(scale); },{lang,scale});
      await fixture('shade');
      const r=await page.evaluate(()=>{ const s=window.__seedGame.scene.getScene('Death');
        const b=s.children.list.find(o=>o.getData?.('action')==='retry');
        const label=b.list.find(o=>o.type==='Text'); const hint=s.children.list.find(o=>o.type==='Text'&&o.y===608);
        return {label:label.text,labelWidth:label.width,buttonWidth:b.width,hint:hint.text,hintWidth:hint.width}; });
      assert.equal(r.label,lang==='zh'?'再来一局':'Try Again'); assert.ok(r.labelWidth<r.buttonWidth-24); assert.ok(r.hintWidth<1100);
      if(scale===1) await page.screenshot({path:path.join(OUT,`death-${lang}.png`)});
      await click(640,662); await fresh('shade'); return r;
    });
    await page.context().close();
    page=await boot(await browser.newContext({viewport:{width:960,height:540},isMobile:true,hasTouch:true,deviceScaleFactor:2}));
    await check('simulated mobile: no keyboard hint; actual touch retry retains profession and save',async()=>{
      await fixture('thorn'); const hints=await page.evaluate(()=>window.__seedGame.scene.getScene('Death').children.list.filter(o=>o.type==='Text').map(o=>o.text));
      assert.ok(hints.some(t=>t.includes('继续使用'))); assert.ok(!hints.some(t=>t.includes('R 快速重开')));
      await page.screenshot({path:path.join(OUT,'death-touch.png')}); await click(640,662,true); return fresh('thorn');
    });
    await check('no uncaught browser exceptions',async()=>assert.deepEqual(errors,[]));
  } finally {
    fs.writeFileSync(path.join(OUT,'checks.json'),JSON.stringify({date:new Date().toISOString(),checks,errors,
      scope:'Synthetic completed-run metrics and disposable seeded saves; real browser mouse/key/tap except explicitly labelled engine-event replay fixture. Not natural-combat, physical-device or subjective-fun acceptance.'},null,2));
    await browser?.close();
  }
  console.log(`Quick retry browser: ${checks.filter(c=>c.passed).length}/${checks.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
