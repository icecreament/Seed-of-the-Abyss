'use strict';
// Isolated real-engine mechanisms, NOT a natural-balance playthrough.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve('output/boss-feel-v1');fs.mkdirSync(OUT,{recursive:true});const checks=[],errors=[];let page;
async function check(name,f){const detail=await f();checks.push({name,detail});console.log('PASS',name);}
async function start(id='warden',lang='zh'){
 await page.evaluate(({id,lang})=>{const g=window.__seedGame,d=window.__seedDev;window.previousPlayer=g.scene.getScene('Run').player;d.saveSystem.setSelectedClass(id);d.saveSystem.setLanguage(lang);for(const k of ['Menu','Run','Death'])g.scene.stop(k);g.scene.start('Run');},{id,lang});
 await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player!==window.previousPlayer&&s.player.classId===id&&s.cameras.main.fadeEffect.alpha===0;},id);
 await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.floor=3;s.beginNextFloor();s.paused=true;s.physics.world.pause();s.boss.clock=10000;s.player.stats.critChance=0;});
 await page.waitForTimeout(220);
}
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 page=await b.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.stack));await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 await start();
 await check('冲锋锁向→700ms位移结束→1100ms反击窗口，窗口结束才恢复追踪',async()=>{
  const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss,p=s.player;b.clock=0;b.updateAI(p,1);const locked=b.hazards[0];b.updateAI(p,1048);const early={charge:b.chargeMs,exposed:b.isExposed};p.setPosition(p.x+160,p.y);b.updateAI(p,1);const direction={x:b.chargeX,y:b.chargeY},charge=b.chargeMs;b.updateAI(p,700);const recovery={exposed:b.isExposed,remaining:b.exposureRemaining,v:b.body.velocity.length(),texture:b.texture.key};b.clock=-1;b.updateAI(p,1099);const almost={exposed:b.isExposed,telegraphs:b.activeTelegraphs};b.clock=10000;b.updateAI(p,1);return{locked:{x:locked.dx,y:locked.dy},early,direction,charge,recovery,almost,ended:b.isExposed,tracking:b.body.velocity.length()};});
  assert.deepEqual(r.early,{charge:0,exposed:false});assert.deepEqual(r.direction,r.locked);assert.equal(r.charge,700);assert.deepEqual(r.recovery,{exposed:true,remaining:1100,v:0,texture:'boss_crownroot_open'});assert.deepEqual(r.almost,{exposed:true,telegraphs:0});assert.equal(r.ended,false);assert.ok(r.tracking>0);return r;
 });
 await check('诱导撞墙：真实 Arcade 碰撞提前终止冲锋，1400ms硬直而非持续蹭伤',async()=>{
  await start();await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss;b.setPosition(1190,650);b.body.reset(1190,650);b.chargeX=1;b.chargeY=0;b.chargeMs=700;s.player.setPosition(900,600);s.player.body.reset(900,600);s.paused=false;s.physics.world.resume();});
  await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').boss.isExposed,{},{timeout:3000});
  const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss;s.paused=true;s.physics.world.pause();return{x:b.x,remaining:b.exposureRemaining,v:b.body.velocity.length(),charge:b.chargeMs};});assert.ok(r.x<1280&&r.x>1190);assert.ok(r.remaining>1200&&r.remaining<=1400);assert.equal(r.v,0);assert.equal(r.charge,0);return r;
 });
 await check('暴露窗口：135%真实伤害、统计不含过量伤害；正常接触有伤，硬直接触无伤',async()=>{
  await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss,p=s.player;s.hitEnemy(b,100,0,0,false,0,0);const normal=1150-b.hp;b.beginRecovery(1400);s.hitEnemy(b,100,0,0,false,0,0);const exposed=1050-b.hp;
   s.paused=false;p.invulnTimer=0;p.dashActive=0;const before=p.stats.hp;s.onPlayerTouchEnemy(b);const safe=p.stats.hp===before;b.recoveryMs=0;s.onPlayerTouchEnemy(b);const normalContact=before-p.stats.hp;
   b.beginRecovery(1400);b.hp=50;s.hitEnemy(b,100,0,0,false,0,0);return{normal,exposed,safe,normalContact,damage:s.damageDealt,outcome:window.__seedDev.runState.lastRun.outcome,hazards:b.hazards.length,graphics:b.weakpoint.commandBuffer.length};});
  assert.equal(r.normal,100);assert.equal(r.exposed,135);assert.equal(r.safe,true);assert.equal(r.normalContact,18);assert.equal(r.damage,285);assert.equal(r.outcome,'victory');assert.equal(r.hazards,0);assert.equal(r.graphics,0);return r;
 });
 await check('地刺/孢子收招：预警期不暴露，发招后700/900ms；同组地刺只提示一次',async()=>{
  await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss,p=s.player;let calls=0;b.hooks.exposed=()=>calls++;p.invulnTimer=10000;
   b.clock=0;b.pattern=1;b.updateAI(p,1);b.updateAI(p,1148);const early=b.isExposed;b.updateAI(p,1);const spikes={remaining:b.exposureRemaining,calls};b.updateAI(p,700);b.hazards=[];b.clock=0;b.pattern=2;b.updateAI(p,1);b.updateAI(p,949);return{early,spikes,volley:{remaining:b.exposureRemaining,calls,shots:s.projectiles.filter(p=>p.fromEnemy).length}};});assert.equal(r.early,false);assert.deepEqual(r.spikes,{remaining:700,calls:1});assert.deepEqual(r.volley,{remaining:900,calls:2,shots:12});return r;
 });
 await check('二阶段不吞掉正在进行的破绽；暂停冻结破绽/姿态/弱点演出，恢复继续',async()=>{
  await start();await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss;b.beginRecovery(1400);b.hp=550;b.updateAI(s.player,1);s.paused=false;s.physics.world.resume();});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').paused);
  const snap=()=>page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss;return{remaining:b.exposureRemaining,phase:b.phase,pose:b.poseClock,rotation:b.rotation,graphics:[...b.weakpoint.commandBuffer]};});const before=await snap();assert.equal(before.phase,2);assert.ok(before.remaining>0);await page.waitForTimeout(260);assert.deepEqual(await snap(),before);await page.keyboard.press('Escape');await page.waitForTimeout(120);assert.ok((await snap()).remaining<before.remaining);return{phase:before.phase,remaining:before.remaining};
 });
 await check('四职业真实按键普攻都命中暴露核心，身体尺寸不会随演出变化',async()=>{
  const detail=[];for(const id of ['warden','reaver','shade','thorn']){await start(id);await page.evaluate(id=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss,p=s.player;b.setPosition(896,600);b.body.reset(896,600);b.speed=0;b.beginRecovery(1400);p.setPosition(896+(id==='thorn'?150:90),600);p.body.reset(p.x,p.y);p.invulnTimer=10000;p.stats.critChance=0;s.paused=false;s.physics.world.resume();},id);
   await page.mouse.move(640,352);await page.keyboard.press('Space');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').boss.hp<1150,{},{timeout:2000});
   const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss;s.paused=true;s.physics.world.pause();return{damage:1150-b.hp,base:s.player.stats.damage,bodyW:b.body.width,bodyH:b.body.height,texture:b.texture.key};});assert.equal(r.damage,Math.floor(r.base*1.35));assert.ok(Math.abs(r.bodyW-70.4)<.01);assert.ok(Math.abs(r.bodyH-52.8)<.01);assert.equal(r.texture,'boss_crownroot_open');detail.push({id,...r});}return detail;
 });
 await check('中英Boss提示真实显示、暴露姿态和倒计时可见，重开不残留',async()=>{
  for(const lang of ['zh','en']){await start('warden',lang);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),b=s.boss;b.beginRecovery(1400);b.updateAI(s.player,1);s.tweens.killTweensOf(s.bannerText);s.bannerText.setAlpha(0);s.updateHud();});const text=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').bossCueText.text);assert.match(text,/35%/);assert.ok(!text.includes('boss_cue_'));await page.screenshot({path:path.join(OUT,`core-exposed-${lang}.png`)});}
  await page.evaluate(()=>{window.__seedGame.scene.stop('Run');window.__seedGame.scene.start('Run');});await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').floor===1);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{boss:!!s.boss,cue:s.bossCueText.text,weakpoints:s.children.list.filter(g=>g===s.boss?.weakpoint).length};});assert.deepEqual(r,{boss:false,cue:'',weakpoints:0});return r;
 });
 await check('浏览器运行时无异常',()=>assert.deepEqual(errors,[]));
 }finally{fs.writeFileSync(path.join(OUT,'checks.json'),JSON.stringify({date:new Date().toISOString(),checks,errors},null,2));await b.close();}
 console.log(`Boss feel: ${checks.length}/${checks.length}`);
})().catch(async e=>{console.error(e);process.exitCode=1;});
