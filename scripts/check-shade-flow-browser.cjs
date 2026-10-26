'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseline = process.env.SEED_SHADE_BASELINE === '1';
const OUT = path.resolve(process.env.SEED_SHADE_OUTPUT || `output/shade-flow-v1/${baseline ? 'baseline' : 'final'}`);
fs.mkdirSync(OUT, { recursive: true });
if (baseline && fs.existsSync(path.join(OUT, 'browser-checks.json'))) throw new Error('Refusing to overwrite baseline');
const checks = [], errors = [];
let page, browser;
async function snapshot() {
  return page.evaluate(() => {
    const s = window.__seedGame.scene.getScene('Run'), p = s.player;
    return { attacks: s.attackCount, damage: s.damageDealt, stealth: p.isStealthed, skill: p.skillActive,
      hp: p.stats.hp, x: p.x, y: p.y, cooldown: p.cooldownRemaining('skill'), attackCooldown: p.cooldownRemaining('attack'),
      paused: s.paused, choosing: s.choosing, touch: { held:s.virtual.attackHeld, pointer:s.virtual.attackPointerId, pressed:s.virtual.attackPressed }, hits: window.shadeHits || [], attackEvents: window.shadeAttacks || [] };
  });
}
async function check(name, action) {
  if (process.env.SEED_SHADE_CHECK_FILTER && !name.includes(process.env.SEED_SHADE_CHECK_FILTER)) return;
  try { const detail = await action(); checks.push({ name, passed: true, detail }); console.log('PASS', name); }
  catch (error) { const state = await snapshot().catch(() => null); checks.push({ name, passed: false, state, error: String(error.stack) });
    await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {}); throw error; }
}
async function start(id = 'shade', live = false) {
  await page.keyboard.up('Space'); await page.keyboard.up('KeyD'); await page.keyboard.up('q');
  await page.evaluate(id => {
    const g = window.__seedGame;
    window.previousPlayer = g.scene.getScene('Run').player;
    window.__seedDev.saveSystem.setSelectedClass(id);
    window.__seedDev.saveSystem.setFeedback({ sfxVolume: .55, impactMotion: false });
    for (const k of ['Menu', 'Run', 'Death']) g.scene.stop(k);
    g.scene.start('Run');
  }, id);
  await page.waitForFunction(id => {
    const s = window.__seedGame.scene.getScene('Run');
    return s.sys.isActive() && s.player !== window.previousPlayer && s.player.classId === id && s.cameras.main.fadeEffect.alpha === 0;
  }, id);
  await page.evaluate(async live => {
    const s = window.__seedGame.scene.getScene('Run'), p = s.player;
    s.enemies.clear(true, true); s.spawnTimer = s.floorTimer = -1e9;
    p.setPosition(1200, 950); p.body.reset(1200, 950); p.stats.critChance = 0;
    p.facing.set(1, 0); p.aimIntent.set(1, 0);
    s.cameras.main.stopFollow(); s.cameras.main.centerOn(p.x, p.y);
    s.paused = !live; if (!live) s.physics.world.pause();
    const { Enemy } = await import('/src/entities/Enemy.ts');
    window.shadeHits = []; window.shadeAttacks = [];
    const attack = s.tryPlayerAttack.bind(s);
    s.tryPlayerAttack = (...args) => {
      const before = { count:s.attackCount, stealth:p.isStealthed, skill:p.skillActive, buffered:p.hasBufferedAttack,
        held:args[0], time:s.timeAlive, x:p.x, y:p.y, virtualPressed:s.virtual.attackPressed };
      const result=attack(...args);
      if(s.attackCount>before.count)window.shadeAttacks.push({...before,damage:s.damageDealt,afterStealth:p.isStealthed});
      return result;
    };
    window.shadeTarget = (dx, dy = 0) => {
      const enemy = new Enemy(s, p.x + dx, p.y + dy, 'crawler', 1);
      enemy.hp = 1000; enemy.speed = 0; enemy.spawnGraceMs = 0; s.enemies.add(enemy);
      const hit = enemy.takeDamage.bind(enemy);
      enemy.takeDamage = amount => { window.shadeHits.push({ amount, x: p.x, distance: Math.hypot(enemy.x - p.x, enemy.y - p.y) }); return hit(amount); };
      return enemy;
    };
  }, live);
  await page.mouse.move(1000, 360);
}
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(e.stack));
    await page.goto(process.env.SEED_TEST_URL || 'http://127.0.0.1:5173');
    await page.waitForFunction(() => window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
    await check('真实长按攻击 + Q：目标尚未进入刀距，不应落地空挥耗掉破隐', async () => {
      await start('shade', true);
      await page.evaluate(() => window.shadeTarget(210));
      await page.keyboard.down('Space');
      await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').attackCount > 0);
      const before = await snapshot();
      await page.keyboard.press('q');
      await page.waitForFunction(() => !window.__seedGame.scene.getScene('Run').player.skillReady);
      await page.waitForTimeout(430);
      const landing = await snapshot();
      await page.screenshot({ path: path.join(OUT, 'held-attack-landing.png') });
      assert.equal(landing.damage, 0);
      if (baseline) {
        assert.equal(landing.stealth, false); assert.ok(landing.attacks > before.attacks);
        await page.keyboard.up('Space'); return { before, landing, note: 'Old empty-swing loss reproduced, not a success criterion for new flow.' };
      }
      assert.equal(landing.stealth, true); assert.equal(landing.attacks, before.attacks);
      await page.keyboard.down('KeyD');
      await page.waitForFunction(() => window.shadeHits.length > 0, null, { timeout: 1300 });
      await page.keyboard.up('KeyD'); await page.keyboard.up('Space');
      const hit = await snapshot();
      assert.equal(hit.hits[0].amount, 33); assert.equal(hit.stealth, false); assert.equal(hit.hp, 95);
      await page.screenshot({ path: path.join(OUT, 'held-attack-connect.png') });
      return { before, landing, hit };
    });
    if (!baseline) {
      await check('主动重新按攻击仍可空挥破隐，不把玩家锁进自动择机', async () => {
        await start('shade', true);
        await page.evaluate(() => { const p = window.__seedGame.scene.getScene('Run').player; p.skillActive = 1000; });
        await page.keyboard.press('Space');
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').attackCount === 1);
        const r = await snapshot(); assert.equal(r.stealth, false); assert.equal(r.damage, 0); return r;
      });
      await check('真实重复keydown属于长按；抬起再按才算主动出刀', async () => {
        await start('shade',true); await page.keyboard.down('Space');
        await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').attackCount>0);
        const before=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.skillActive=1000;s.player.attackTimer=0;return s.attackCount;});
        await page.keyboard.down('Space'); await page.waitForTimeout(160); const repeated=await snapshot();
        assert.equal(repeated.attacks,before); assert.equal(repeated.stealth,true);
        await page.keyboard.up('Space'); await page.keyboard.press('Space');
        await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').player.isStealthed);
        const pressed=await snapshot(); assert.equal(pressed.attacks,before+1); return {repeated,pressed};
      });
      await check('无机会的长按不消费冷却/攻击次数/暴击随机数，仍可受伤', async () => {
        await start();
        return page.evaluate(() => {
          const s = window.__seedGame.scene.getScene('Run'), p = s.player;
          p.skillActive = 1000; p.invulnTimer = 0;
          let rolls = 0; const random = Math.random;
          try { Math.random = () => { rolls++; return .5; }; for (let i = 0; i < 100; i++) s.tryPlayerAttack(true); }
          finally { Math.random = random; }
          const lost = p.applyDamage(8);
          const r = { rolls, lost, hp: p.stats.hp, stealth: p.isStealthed, skill: p.skillActive, attacks: s.attackCount, cooldown: p.cooldownRemaining('attack') };
          if (JSON.stringify(r) !== JSON.stringify({ rolls: 0, lost: 8, hp: 87, stealth: true, skill: 1000, attacks: 0, cooldown: 0 })) throw new Error(JSON.stringify(r));
          return r;
        });
      });
      await check('刀距和朝向不放宽：身后/超距等待，边界前方命中仍为33', async () => {
        await start();
        const r = await page.evaluate(() => {
          const s = window.__seedGame.scene.getScene('Run'), p = s.player, e = window.shadeTarget(-30);
          p.skillActive = 1000; s.tryPlayerAttack(true); const behind = s.attackCount;
          e.setPosition(p.x + p.stats.attackRange + e.hitRadius + .001, p.y); s.tryPlayerAttack(true); const outside = s.attackCount;
          e.setPosition(p.x + p.stats.attackRange + e.hitRadius, p.y); s.tryPlayerAttack(true);
          return { behind, outside, attacks: s.attackCount, damage: s.damageDealt, stealth: p.isStealthed };
        });
        assert.deepEqual(r, { behind: 0, outside: 0, attacks: 1, damage: 33, stealth: false }); return r;
      });
      await check('生成保护中的敌人不是出刀机会，解除保护后才出刀', async () => {
        await start();
        const r = await page.evaluate(() => {
          const s = window.__seedGame.scene.getScene('Run'), p = s.player, e = window.shadeTarget(35);
          p.skillActive = 1000; e.spawnGraceMs = 500; s.tryPlayerAttack(true); const before = s.attackCount;
          e.spawnGraceMs = 0; s.tryPlayerAttack(true); return { before, after: s.attackCount, damage: s.damageDealt };
        });
        assert.deepEqual(r, { before: 0, after: 1, damage: 33 }); return r;
      });
      await check('友弹/失活/寿命结束/110外都不诱发破隐，110边界敌弹可单独碎弹', async () => {
        await start();
        await page.evaluate(() => window.__seedGame.scene.getScene('Run').audio.unlock());
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').audio.state === 'running');
        const r = await page.evaluate(() => {
          const s = window.__seedGame.scene.getScene('Run'), p = s.player;
          p.skillActive = 1000;
          for (const [dx, hostile, life] of [[50,false,1000],[60,true,0],[111,true,1000]]) s.spawnProjectile(p.x+dx,p.y,0,0,6,hostile,0,life);
          s.spawnProjectile(p.x+70,p.y,0,0,6,true,0,1000); s.projectiles.at(-1).sprite.setActive(false);
          s.tryPlayerAttack(true); const before = { attacks: s.attackCount, shots: s.projectiles.length, stealth: p.isStealthed };
          s.spawnProjectile(p.x+110,p.y,0,0,6,true,0,1000); s.tryPlayerAttack(true);
          const after = { attacks: s.attackCount, shots: s.projectiles.length, stealth: p.isStealthed, damage: s.damageDealt, parry: s.audio.last.has('parry') };
          return { before, after };
        });
        assert.deepEqual(r.before, { attacks: 0, shots: 4, stealth: true });
        assert.deepEqual(r.after, { attacks: 1, shots: 4, stealth: false, damage: 0, parry: true }); return r;
      });
      await check('隔墙敌弹不诱发长按破隐；可见敌弹仍可不瞄准直接碎', async () => {
        await start();
        const r = await page.evaluate(() => {
          const s = window.__seedGame.scene.getScene('Run'), p = s.player;
          p.setPosition(1240,500); p.body.reset(p.x,p.y); p.skillActive = 1000;
          s.spawnProjectile(1310,500,0,0,6,true,0,10000); s.tryPlayerAttack(true); const before = s.attackCount;
          s.spawnProjectile(1240,560,0,0,6,true,0,10000); s.tryPlayerAttack(true);
          return { before, attacks: s.attackCount, remaining: s.projectiles.map(o => [o.sprite.x,o.sprite.y]) };
        });
        assert.deepEqual(r, { before: 0, attacks: 1, remaining: [[1310,500]] }); return r;
      });
      await check('隐身到期自动恢复普通连击，不延期隐身或滞留蓄刃', async () => {
        await start('shade', true); await page.keyboard.down('Space');
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').attackCount > 0);
        const count = await page.evaluate(() => { const s = window.__seedGame.scene.getScene('Run'); s.player.skillActive = 240; s.player.attackTimer = 0; return s.attackCount; });
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').player.skillActive > 0 && window.__seedGame.scene.getScene('Run').combat.ambushBlades.visible);
        const during = await snapshot(); assert.equal(during.attacks, count);
        await page.waitForFunction(() => !window.__seedGame.scene.getScene('Run').player.isStealthed && window.__seedGame.scene.getScene('Run').attackCount > 1);
        await page.keyboard.up('Space'); const after = await snapshot();
        assert.ok(after.attacks > count); assert.equal(await page.evaluate(() => window.__seedGame.scene.getScene('Run').combat.ambushBlades.visible), false);
        return { during, after };
      });
      await check('另三职业的长按连击不等待敌人；影行者普通连击也不等待', async () => {
        const detail = [];
        for (const id of ['warden','reaver','shade','thorn']) {
          await start(id);
          const r = await page.evaluate(id => {
            const s = window.__seedGame.scene.getScene('Run'); if (id !== 'shade') s.player.skillActive = 1000;
            s.tryPlayerAttack(true); return { id, attacks: s.attackCount, cooldown: s.player.cooldownRemaining('attack') };
          }, id);
          assert.equal(r.attacks, 1); assert.ok(r.cooldown > 0); detail.push(r);
        }
        return detail;
      });
      await check('蓄刃提示只在落地隐身出现，死亡/到期/重开清除，反复刷新不堆对象', async () => {
        await start();
        const r = await page.evaluate(() => {
          const s = window.__seedGame.scene.getScene('Run'), p = s.player, c = s.combat;
          const count = s.children.length; p.skillActive = 1000; p.dashActive = 100; c.update(0,p,false); const dash = c.ambushBlades.visible;
          p.dashActive = 0; c.update(0,p,false); const ready = c.ambushBlades.visible;
          for (let i=0; i<500; i++) c.update(0,p,false); const growth = s.children.length-count;
          p.invulnTimer = 0; p.applyDamage(99999); c.update(0,p,false); const dead = c.ambushBlades.visible;
          return { dash, ready, growth, dead };
        });
        assert.deepEqual(r, { dash: false, ready: true, growth: 0, dead: false });
        await start(); assert.equal(await page.evaluate(() => window.__seedGame.scene.getScene('Run').combat.ambushBlades.visible), false); return r;
      });
      await check('暂停与融合冻结隐身时长，菜单攻击不重放成主动破隐', async () => {
        await start('shade', true);
        await page.evaluate(() => { window.__seedGame.scene.getScene('Run').player.skillActive = 1500; });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__seedGame.scene.getScene('Run').paused);
        const paused = await snapshot(); await page.keyboard.press('Space'); await page.waitForTimeout(180);
        assert.equal((await snapshot()).skill, paused.skill); assert.equal((await snapshot()).attacks, 0);
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__seedGame.scene.getScene('Run').paused);
        await page.evaluate(() => window.__seedGame.scene.getScene('Run').openMutationChoice());
        const choice = await snapshot(); assert.equal(choice.choosing, true);
        await page.keyboard.press('Space'); await page.waitForTimeout(180);
        assert.equal((await snapshot()).skill, choice.skill); assert.equal((await snapshot()).attacks, 0);
        await page.keyboard.press('1'); await page.waitForFunction(() => !window.__seedGame.scene.getScene('Run').choosing);
        const after = await snapshot(); assert.equal(after.attacks, 0); assert.equal(after.stealth, true); return { paused, choice, after };
      });
      await check('中英文选人说明包含长按/主动出刀规则，文本不越出详情面板', async () => {
        const detail = [];
        for (const lang of ['zh','en']) {
          await page.evaluate(lang => {
            window.__seedDev.saveSystem.setLanguage(lang); window.__seedDev.saveSystem.setSelectedClass('shade');
            const g=window.__seedGame; g.scene.stop('Run'); g.scene.start('ClassSelect');
          }, lang);
          await page.waitForFunction(() => window.__seedGame.scene.getScene('ClassSelect').sys.isActive() && window.__seedGame.scene.getScene('ClassSelect').cameras.main.fadeEffect.alpha === 0);
          const r = await page.evaluate(() => { const s=window.__seedGame.scene.getScene('ClassSelect'); return { text:s.detail.text, y:s.detail.y, height:s.detail.height }; });
          assert.match(r.text, lang === 'zh' ? /长按.*再按/ : /hold.*press again/); assert.ok(r.height <= 76, JSON.stringify(r));
          await page.screenshot({ path:path.join(OUT,`shade-description-${lang}.png`) }); detail.push(r);
        }
        return detail;
      });
      await check('真实模拟触屏：按住攻击后按技能，落地留住破隐，左摇杆切近后命中', async () => {
        const desktop = page, context = await browser.newContext({ viewport:{width:844,height:390}, isMobile:true, hasTouch:true });
        page = await context.newPage(); page.on('pageerror',e=>errors.push(e.stack));
        try {
          await page.goto(process.env.SEED_TEST_URL || 'http://127.0.0.1:5173');
          await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
          await start('shade',true); await page.evaluate(()=>window.shadeTarget(210));
          const box=await page.locator('canvas').boundingBox(), cdp=await context.newCDPSession(page);
          const point=(x,y,id)=>({x:box.x+x/1280*box.width,y:box.y+y/720*box.height,id});
          const attack=point(1190,630,1),skill=point(1105,665,2),stick=point(100,620,3);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[attack]});
          await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').attackCount>0);
          const before=await snapshot();
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[attack,skill]});
          await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').player.skillReady);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[attack]});
          await page.waitForTimeout(430); const landing=await snapshot();
          assert.equal(landing.stealth,true); assert.equal(landing.attacks,before.attacks);
          assert.equal(landing.touch.held,true); assert.equal(landing.touch.pointer,before.touch.pointer);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[attack,stick]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[attack,point(156,620,3)]});
          await page.waitForFunction(()=>window.shadeHits.length>0,null,{timeout:1300});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); const hit=await snapshot();
          fs.writeFileSync(path.join(OUT,'touch-flow.json'),JSON.stringify({before,landing,hit},null,2));
          assert.equal(hit.hits[0].amount,33); assert.equal(hit.stealth,false);
          await page.screenshot({path:path.join(OUT,'touch-ambush-connect.png')}); return {before,landing,hit};
        } catch(error) {
          fs.writeFileSync(path.join(OUT,'touch-failure.json'),JSON.stringify({state:await snapshot(),error:String(error.stack)},null,2));
          await page.screenshot({path:path.join(OUT,'touch-failure.png')}); throw error;
        } finally { await context.close(); page=desktop; }
      });
    }
    await check('运行时没有未处理异常', () => assert.deepEqual(errors, []));
  } finally {
    fs.writeFileSync(path.join(OUT, 'browser-checks.json'), JSON.stringify({ date: new Date().toISOString(), baseline, checks, errors,
      scope: 'Isolated engine combat plus real keyboard input, not natural chapter acceptance or subjective fun evidence.' }, null, 2));
    await browser?.close();
  }
  console.log(`Shade flow browser: ${checks.filter(c => c.passed).length}/${checks.length}`);
})().catch(e => { console.error(e); process.exitCode = 1; });
