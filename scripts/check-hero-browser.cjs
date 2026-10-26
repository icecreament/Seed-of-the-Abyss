'use strict';

// Optional real-browser checks. No runtime dependency or real user save is touched.
// Start Vite first, then use Node 20+: node scripts/check-hero-browser.cjs
// If Playwright is supplied externally, set PLAYWRIGHT_MODULE to its package path.
// Optional: SEED_TEST_URL, EDGE_EXECUTABLE, SEED_ART_OUTPUT.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.SEED_ART_OUTPUT || 'output/art-classes-v1');
const URL = process.env.SEED_TEST_URL || 'http://127.0.0.1:5173';
const CLASSES = ['warden', 'reaver', 'shade', 'thorn'];
const checks = [], errors = [];
fs.mkdirSync(OUT, { recursive: true });

async function check(name, fn) {
  try {
    const details = await fn();
    checks.push({ name, passed: true, ...(details || {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
    throw error;
  }
}
async function ready(page, scene) {
  await page.waitForFunction(key => {
    const s = window.__seedGame?.scene.getScene(key);
    return s?.sys.isActive() && s.input.enabled && s.cameras.main.fadeEffect.alpha === 0;
  }, scene);
}
async function select(page, id) {
  await page.evaluate(() => {
    const game = window.__seedGame;
    game.scene.stop('Run');
    game.scene.stop('ClassSelect');
    game.scene.stop('Menu');
    game.scene.start('ClassSelect');
  });
  await ready(page, 'ClassSelect');
  await page.mouse.click(202 + CLASSES.indexOf(id) * 292, 310);
  await page.mouse.click(756, 658);
  await ready(page, 'Run');
}
async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.__seedGame.scene.getScene('Run'), p = s.player;
    return { id: p.classId, key: p.anims.currentAnim?.key, frame: p.frame.name,
      hp: p.stats.hp, stats: { ...p.stats }, dash: p.cooldownRemaining('dash'),
      skill: p.cooldownRemaining('skill'), attack: p.cooldownRemaining('attack'),
      active: p.skillActive, stealth: p.isStealthed, alpha: p.alpha, shadow: p.shadow.visible,
      paused: s.paused, time: s.timeAlive, slots: s.abilityTexts.map(t => t.text),
      abilities: s.abilityRoot.list.filter(o => o.type === 'Text').map(o => o.text),
      abilityVisible: s.abilityRoot.visible, identityVisible: s.identityRoot.visible,
      virtualVisible: s.virtual.isVisible, projectiles: s.projectiles.length,
      trace: window.__heroTrace || [],
    };
  });
}
async function clearTrace(page) { await page.evaluate(() => { window.__heroTrace = []; }); }
async function tapAttack(page) {
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').player.cooldownRemaining('attack') > 0);
  await page.keyboard.up('Space');
}
async function waitIdle(page) {
  await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').player.anims.currentAnim.key.endsWith('_idle'));
}

(async () => {
  const edge = process.env.EDGE_EXECUTABLE || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(URL);
    await ready(page, 'Menu');
    await page.screenshot({ path: path.join(OUT, 'menu.png') });
    await page.mouse.click(276, 402);
    await ready(page, 'ClassSelect');
    await page.screenshot({ path: path.join(OUT, 'class-select.png') });
    await check('真实菜单导航及四套448×32图集／128×160肖像', async () => {
      const assets = await page.evaluate(() => {
        const game = window.__seedGame;
        return ['warden','reaver','shade','thorn'].map(id => {
          const hero = game.textures.get(`hero_${id}`), portrait = game.textures.get(`portrait_${id}`);
          return { id, frames: hero.frameTotal, hero: hero.getSourceImage().toDataURL(),
            portrait: portrait.getSourceImage().toDataURL(),
            size: [hero.getSourceImage().width, hero.getSourceImage().height,
              portrait.getSourceImage().width, portrait.getSourceImage().height] };
        });
      });
      for (const a of assets) {
        assert.deepEqual(a.size, [448,32,128,160]); assert.equal(a.frames, 15); // includes __BASE
        for (const kind of ['hero','portrait']) fs.writeFileSync(path.join(OUT, `${kind}_${a.id}.png`), Buffer.from(a[kind].split(',')[1], 'base64'));
      }
      return { classes: assets.map(a => a.id) };
    });
    for (const id of CLASSES) {
      await select(page, id);
      // Actual fresh-run screenshot, taken before applying any test fixtures below.
      await page.screenshot({ path: path.join(OUT, `combat-${id}.png`) });
      await check(`${id}: 卡片选择、身份、技能名与真实生命一致`, async () => {
        const s = await snapshot(page);
        assert.equal(s.id, id); assert.equal(s.hp, s.stats.maxHp);
        assert.equal(s.slots.length, 3); assert.equal(s.abilityVisible, true);
        const skills = {warden:'壁垒',reaver:'血涌',shade:'暗影步',thorn:'荆棘新星'};
        assert.ok(s.abilities.includes(skills[id]));
      });
      // Isolated runtime fixture: prevent enemies interrupting animation tests.
      await page.evaluate(() => {
        const s = window.__seedGame.scene.getScene('Run');
        s.enemies.clear(true, true); s.spawnTimer = -1e9;
        window.__heroTrace = [];
        for (const event of ['animationstart','animationupdate']) s.player.on(event, (animation, frame) => {
          window.__heroTrace.push({ key: animation.key, frame: frame.textureFrame, time: performance.now() });
        });
      });
      await check(`${id}: 待机四帧循环`, async () => {
        await page.waitForTimeout(1120);
        const s = await snapshot(page), frames = [...new Set(s.trace.filter(e => e.key.endsWith('_idle')).map(e => e.frame))].sort();
        assert.deepEqual(frames, [4,5,6,7]); return { frames };
      });
      await check(`${id}: 移动中完整攻击四帧，结束后恢复移动／待机`, async () => {
        await clearTrace(page);
        await page.keyboard.down('d'); await tapAttack(page);
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').player.anims.currentAnim.key.endsWith('_walk'));
        await page.keyboard.up('d'); await waitIdle(page);
        const s = await snapshot(page), frames = s.trace.filter(e => e.key.endsWith('_attack')).map(e => e.frame);
        assert.deepEqual([...new Set(frames)], [8,9,10,11]);
        // Also exercise a runtime cooldown override for future speed modifiers (without changing saved data).
        await page.evaluate(() => { const p=window.__seedGame.scene.getScene('Run').player; p.stats.attackCooldown=180; p.attackTimer=0; });
        await clearTrace(page); await tapAttack(page); await waitIdle(page);
        const faster = await snapshot(page);
        assert.deepEqual([...new Set(faster.trace.filter(e=>e.key.endsWith('_attack')).map(e=>e.frame))], [8,9,10,11]);
        // Held repeat fire must restart all four cells on every successful attack,
        // including when the animation length equals the cooldown exactly.
        await page.evaluate(() => {
          const p=window.__seedGame.scene.getScene('Run').player, original=p.tryAttack;
          p.attackTimer=0; window.__heroAttackCount=0;
          p.tryAttack=function(...args){const hit=original.apply(this,args);if(hit)window.__heroAttackCount++;return hit;};
        });
        await clearTrace(page); await page.keyboard.down('Space'); await page.waitForTimeout(1000);
        await page.keyboard.up('Space'); await waitIdle(page);
        const repeated=await snapshot(page);
        const attacks=await page.evaluate(()=>window.__heroAttackCount);
        const starts=repeated.trace.filter(e=>e.key.endsWith('_attack') && e.frame===8).length;
        assert.ok(attacks>=5); assert.equal(starts,attacks,'每次连发都必须重新开始攻击动作');
        await page.evaluate(cooldown => { const p=window.__seedGame.scene.getScene('Run').player;p.stats.attackCooldown=cooldown;delete p.tryAttack; }, s.stats.attackCooldown);
        return { frames, shortenedCooldown: 180, repeatedAttacks:attacks, animationRestarts:starts };
      });
      await check(`${id}: Shift冲刺姿态及真实冷却`, async () => {
        await page.keyboard.down('d'); await page.keyboard.press('Shift');
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').player.isDashing);
        const s = await snapshot(page); assert.equal(s.frame, 12); assert.ok(s.key.endsWith('_dash'));
        assert.ok(s.dash > 0); assert.notEqual(s.slots[1], '就绪');
        await page.keyboard.up('d'); await waitIdle(page);
        return { frame:s.frame, remaining:s.dash };
      });
      await check(`${id}: 受击姿态优先，闪白结束后回到待机`, async () => {
        const hit = await page.evaluate(() => {
          const p=window.__seedGame.scene.getScene('Run').player;
          p.invulnTimer=0; const before=p.stats.hp; const damage=p.applyDamage(20);
          return { damage, lost:before-p.stats.hp, frame:p.frame.name, key:p.anims.currentAnim.key };
        });
        assert.ok(hit.damage > 0); assert.equal(hit.damage, hit.lost); assert.equal(hit.frame, 13); assert.ok(hit.key.endsWith('_hurt'));
        await waitIdle(page); return hit;
      });
      await check(`${id}: Q技能保留原机制及攻击加成`, async () => {
        await page.keyboard.press('q');
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').player.cooldownRemaining('skill') > 0);
        const s = await snapshot(page); assert.ok(s.skill > 0);
        if (id === 'warden') {
          const damage = await page.evaluate(() => { const p=window.__seedGame.scene.getScene('Run').player; p.invulnTimer=0; return p.applyDamage(20); });
          assert.equal(damage, 5);
        } else if (id === 'reaver') {
          assert.ok(s.active > 0); assert.ok(s.hp > 90);
          const attack = await page.evaluate(() => { const p=window.__seedGame.scene.getScene('Run').player;p.attackTimer=0;p.stats.critChance=0;return {damage:p.tryAttack().damage,base:p.stats.damage}; });
          assert.equal(attack.damage, Math.floor(attack.base * 1.6));
        } else if (id === 'shade') {
          // Skill intent is consumed at the end of updateEntity; appearance resolves next tick.
          await page.waitForFunction(()=>{const p=window.__seedGame.scene.getScene('Run').player;return p.isStealthed && p.alpha<1 && !p.shadow.visible;});
          assert.equal(s.stealth, true);
          await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').player.isDashing);
          const attack = await page.evaluate(() => { const p=window.__seedGame.scene.getScene('Run').player;p.attackTimer=0;p.stats.critChance=0;const a=p.tryAttack();return {damage:a.damage,base:p.stats.damage,stealth:p.isStealthed}; });
          assert.equal(attack.damage, Math.floor(attack.base * 2.2)); assert.equal(attack.stealth, false);
          await waitIdle(page); const after = await snapshot(page); assert.equal(after.alpha,1); assert.equal(after.shadow,true);
        } else {
          assert.ok(s.projectiles >= 8, 'nova must create radial seed projectiles'); assert.equal(s.active, 0);
        }
        return { remaining:s.skill, stealth:s.stealth, projectiles:s.projectiles };
      });
      await check(`${id}: 暂停冻结动作／计时／冷却，继续后恢复`, async () => {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').paused);
        const before = await snapshot(page); await page.waitForTimeout(200); const after = await snapshot(page);
        for (const key of ['time','attack','dash','skill','frame']) assert.equal(after[key], before[key], key);
        await page.mouse.click(640,370); await page.waitForFunction(() => !window.__seedGame.scene.getScene('Run').paused);
        await page.waitForTimeout(100); const resumed=await snapshot(page); assert.ok(resumed.time>after.time);
      });
      await check(`${id}: 死亡不被待机或攻击动画覆盖`, async () => {
        const result = await page.evaluate(() => {
          const s=window.__seedGame.scene.getScene('Run'),p=s.player;
          s.scene.pause(); p.invulnTimer=0;p.dashActive=0;p.skillActive=0;
          p.applyDamage(10000); const frame=p.frame.name;p.wantAttack=true;p.updateEntity(300);
          return {dead:p.dead,playing:p.anims.isPlaying,attack:p.tryAttack(),frame:p.frame.name,before:frame};
        });
        assert.equal(result.dead,true); assert.equal(result.playing,false); assert.equal(result.attack,null); assert.equal(result.frame,result.before);
        // Keep the dead fixture paused until select() stops it; do not trigger save settlement.
      });
    }
    await check('四种渲染倍率下职业卡片选择与开始按钮命中', async () => {
      for(const scale of [0.75,1,1.5,2]) {
        await page.evaluate(s => { window.__seedDev.applyRenderScale(s); },scale);
        await select(page, 'thorn'); assert.equal((await snapshot(page)).id,'thorn');
      }
      await page.evaluate(()=>window.__seedDev.applyRenderScale(1));
    });
    await check('英文战斗HUD正确显示Thorn Nova', async () => {
      await page.evaluate(async () => { window.__seedDev.saveSystem.setLanguage('en'); });
      await select(page,'thorn'); const s=await snapshot(page); assert.ok(s.abilities.includes('Thorn Nova'));
      await page.screenshot({path:path.join(OUT,'combat-thorn-en.png')});
    });
    await check('模拟触屏横屏：三个职业显示操作区，隐藏重复PC卡片', async () => {
      const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'zh-CN'});
      const mp=await mobile.newPage(); mp.on('pageerror',e=>errors.push(e.message));
      const cdp=await mobile.newCDPSession(mp);
      await mp.goto(URL);await ready(mp,'Menu');
      for(const id of CLASSES.slice(1)) {
        await mp.evaluate(id=>{window.__seedDev.saveSystem.setSelectedClass(id);window.__seedGame.scene.stop('Menu');window.__seedGame.scene.stop('Run');window.__seedGame.scene.start('Run');},id);
        await ready(mp,'Run'); const s=await snapshot(mp); assert.equal(s.id,id);
        assert.equal(s.abilityVisible,false);assert.equal(s.identityVisible,false);assert.equal(s.virtualVisible,true);
        await mp.screenshot({path:path.join(OUT,`mobile-${id}.png`)});
        await mp.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.spawnTimer=-1e9;});
        const box=await mp.locator('canvas').boundingBox();
        const point=(x,y)=>({x:box.x+x/1280*box.width,y:box.y+y/720*box.height,id:11});
        for(const [action,x,y] of [['attack',1190,630],['dash',1105,580],['skill',1105,665]]) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(x,y)]});
          await mp.waitForFunction(action=>window.__seedGame.scene.getScene('Run').player.cooldownRemaining(action)>0,action);
          const p=await snapshot(mp);
          if(action==='attack') assert.ok(p.key.endsWith('_attack'));
          if(action==='dash') assert.equal(p.frame,12);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }
      }
      await mobile.close();
    });
    await check('浏览器运行时无异常', async () => assert.deepEqual(errors,[]));
  } finally {
    fs.writeFileSync(path.join(OUT,'browser-checks.json'),JSON.stringify({date:new Date().toISOString(),browser:'Microsoft Edge / Playwright, headless',checks,errors,
      limitations:['移动端为浏览器模拟，未覆盖安卓／iOS真机。','动作与技能断言使用隔离测试状态；combat截图在注入测试状态前截取。','未重新打包APK／EXE；未实现四／八方向独立图集或死亡专用帧。']},null,2)+'\n');
    await browser.close();
    console.log(`Browser checks: ${checks.filter(c=>c.passed).length}/${checks.length}`);
  }
})().catch(error => { console.error(error); process.exitCode=1; });
