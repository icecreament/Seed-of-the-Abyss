'use strict';
// Real Phaser / Arcade / Canvas in a disposable browser profile. Does not use the user's save.
// Floor timers and isolated combat deltas are fast-forwarded; this is not a natural-speed balance test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve(__dirname,'../output/chapter-v1');fs.mkdirSync(OUT,{recursive:true});
const results=[],errors=[];let page,browser;
async function check(name,fn){try{const detail=await fn();results.push({name,passed:true,detail});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});console.log(await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return {active:window.__seedGame.scene.getScenes(true).map(s=>s.sys.settings.key),paused:s.paused,ended:s.ended,choosing:s.choosing};}).catch(()=>null));throw e;}}
async function ready(p=page){await p.waitForFunction(()=>{const s=window.__seedGame?.scene.getScene('Run');return s?.sys.isActive()&&s.input.enabled&&s.cameras.main.fadeEffect.alpha===0;});}
async function start(id='warden',lang='zh',p=page){
 await p.evaluate(async({id,lang})=>{const {saveSystem}=window.__seedDev;saveSystem.setSelectedClass(id);saveSystem.setLanguage(lang);const game=window.__seedGame;
 window.previousRunPlayer=game.scene.getScene('Run').player;for(const name of ['Menu','Run','Death','ClassSelect']) game.scene.stop(name);game.scene.start('Run');},{id,lang});await p.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player!==window.previousRunPlayer&&s.player?.classId===id&&s.input.enabled&&s.cameras.main.fadeEffect.alpha===0;},id);
}
async function isolated(id){await start(id);await page.evaluate(async()=>{
 const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.spawnTimer=-1e9;s.floorTimer=-1e9;s.paused=true;s.physics.world.pause();s.player.stats.critChance=0;
 const {Enemy}=await import('/src/entities/Enemy.ts');window.probeEnemy=(dx=60,dy=0,hp=1000)=>{const e=new Enemy(s,s.player.x+dx,s.player.y+dy,'crawler',1);e.hp=e.maxHp=hp;e.damage=0;e.speed=60;s.enemies.add(e);return e;};
});}
async function finishFloor(p=page,choice=1){await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.floorTimer=45000;});await p.waitForFunction(()=>window.__seedGame.scene.getScene('Run').choosing);
 await p.keyboard.press(String(choice));await p.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').choosing);}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN'});page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 try{
 await check('守望者：壁垒脉冲与冲刺蓄力震地真实造成伤害',async()=>{await isolated('warden');const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('warden_thorns');s.build.acquire('warden_ram');
 const e=window.probeEnemy();p.wantSkill=true;p.updateEntity(16);p.wantSkill=false;s.consumeCombatEvents();const before=e.hp;s.updateMutations(1);const pulse=before-e.hp;p.skillActive=0;s.updateMutations(700);const inactive=e.hp;
 const rear=window.probeEnemy(-90);p.wantDash=true;p.updateEntity(16);p.wantDash=false;s.consumeCombatEvents();p.dashActive=0;p.attackTimer=0;p.facing.set(1,0);s.tryPlayerAttack();
 return {pulse,inactive,afterInactive:before-pulse,quake:1000-rear.hp,ready:s.ramReady,effects:s.combat.effects.length};});assert.equal(r.pulse,10);assert.equal(r.inactive,r.afterInactive);assert.equal(r.quake,16);assert.equal(r.ready,false);assert.ok(r.effects>0);return r;});
 await check('掠夺者：三次流血跳伤、重复命中刷新和第三击环斩',async()=>{await isolated('reaver');const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('reaver_bleed');s.build.acquire('reaver_cleave');const e=window.probeEnemy();s.hitEnemy(e,19,1,0,false,0,0,true);const initial=e.hp;
 for(let i=0;i<3;i++)s.updateMutations(1000);const bleed=initial-e.hp;s.updateMutations(1000);const stopped=e.hp;
 s.hitEnemy(e,19,1,0,false,0,0,true);s.updateMutations(500);s.hitEnemy(e,19,1,0,false,0,0,true);const refreshed=s.marks.get(e).bleed;
 const rear=window.probeEnemy(-90);s.attackCount=2;p.attackTimer=0;p.facing.set(1,0);s.tryPlayerAttack();return{bleed,stopped,expected:initial-15,refreshed,cleave:1000-rear.hp};});assert.equal(r.bleed,15);assert.equal(r.stopped,r.expected);assert.equal(r.refreshed,3100);assert.equal(r.cleave,17);return r;});
 await check('影行者：破隐必暴、诱饵真实改变追踪目标、击杀返还冲刺',async()=>{await isolated('shade');const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('shade_ambush');s.build.acquire('shade_decoy');p.setPosition(1200,950);p.forceAmbushCrit=true;p.wantSkill=true;p.updateEntity(16);p.wantSkill=false;s.consumeCombatEvents();p.updateEntity(170);const crit=p.tryAttack().crit;
 const e=window.probeEnemy(-90);p.setPosition(p.x-300,p.y);p.dashActive=0;s.paused=false;s.update(0,16);s.paused=true;const towardDecoy=e.body.velocity.x;
 s.updateMutations(2100);s.paused=false;s.update(0,16);s.paused=true;const towardPlayer=e.body.velocity.x;
 p.dashTimer=600;s.hitEnemy(e,2000,0,0,false,0,0);return{crit,towardDecoy,towardPlayer,dash:p.cooldownRemaining('dash'),decoyExpired:!s.decoy};});assert.equal(r.crit,true);assert.ok(r.towardDecoy>0);assert.ok(r.towardPlayer<0);assert.equal(r.dash,200);assert.ok(r.decoyExpired);return r;});
 await check('棘语者：三歧实弹、三层植种与新星引爆',async()=>{await isolated('thorn');const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('thorn_seeds');s.build.acquire('thorn_fork');p.facing.set(1,0);const e=window.probeEnemy(45);s.tryPlayerAttack();const shots=s.projectiles.length;s.updateProjectiles(80);const stacks=s.marks.get(e)?.seeds,before=e.hp;s.fireNova();return{shots,stacks,detonation:before-e.hp,nova:s.projectiles.length,stacksAfter:s.marks.get(e)?.seeds};});assert.equal(r.shots,3);assert.equal(r.stacks,3);assert.equal(r.detonation,49);assert.equal(r.nova,8);assert.equal(r.stacksAfter,0);return r;});
 await check('通用突变：击杀回复/双冷却返还/伤害统计不含过量',async()=>{await isolated('warden');const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('shared_feast');s.build.acquire('shared_haste');p.stats.hp=80;p.dashTimer=900;p.skillTimer=7000;const e=window.probeEnemy(60,0,1);s.hitEnemy(e,999,0,0,false,0,0);return{hp:p.stats.hp,dash:p.cooldownRemaining('dash'),skill:p.cooldownRemaining('skill'),damage:s.damageDealt};});assert.deepEqual(r,{hp:83,dash:550,skill:6650,damage:1});return r;});
 await check('通用突变：冲刺落点爆裂与反伤1秒内不重复触发',async()=>{await isolated('warden');const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('shared_dash');s.build.acquire('shared_spite');const e=window.probeEnemy();p.wantDash=true;p.updateEntity(16);p.wantDash=false;s.consumeCombatEvents();s.updateMutations(1);const during=e.hp;p.updateEntity(145);s.updateMutations(145);const burst=during-e.hp;
 p.invulnTimer=0;p.applyDamage(10);s.consumeCombatEvents();const first=e.hp;p.invulnTimer=0;p.applyDamage(10);s.consumeCombatEvents();const second=e.hp;s.updateMutations(1000);p.invulnTimer=0;p.applyDamage(10);s.consumeCombatEvents();return{during,burst,first,second,retaliation:first-e.hp};});assert.equal(r.during,1000);assert.equal(r.burst,12);assert.equal(r.first,r.second);assert.equal(r.retaliation,12);return r;});
 await check('三层→三次融合→Boss：真实键盘选择，战斗/冷却/弹道在选择期冻结',async()=>{await start();await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.player.stats.hp=80;s.player.skillTimer=4000;s.player.dashTimer=600;s.spawnProjectile(s.player.x,s.player.y,1,0,1,false,100);s.floorKills=12;});await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').choosing);
 const sample=()=>page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{time:s.timeAlive,skill:s.player.cooldownRemaining('skill'),dash:s.player.cooldownRemaining('dash'),x:s.projectiles[0].sprite.x,clock:s.floorTimer,frame:s.player.frame.name,offers:s.choices.map(m=>m.id),save:localStorage.getItem('seed_of_the_abyss_save_v1')};});
 const a=await sample();await page.keyboard.press('q');await page.keyboard.press('Shift');await page.keyboard.press('Escape');await page.waitForTimeout(300);assert.deepEqual(await sample(),a);
 await page.screenshot({path:path.join(OUT,'mutation-zh.png')});await page.keyboard.press('1');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').floor===2);const after=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{hp:s.player.stats.hp,build:s.build.owned.length,save:localStorage.getItem('seed_of_the_abyss_save_v1')};});assert.equal(after.hp,108);assert.equal(after.build,1);assert.equal(after.save,a.save);
 await finishFloor();await finishFloor();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{floor:s.floor,owned:s.build.owned.length,boss:!!s.boss,enemies:s.enemies.getLength(),projectiles:s.projectiles.length,pillars:s.pointInWall(1050,290),open:s.pointInWall(750,600),ground:s.groundImage.texture.key};});assert.equal(r.floor,4);assert.equal(r.owned,3);assert.equal(r.boss,true);assert.equal(r.enemies,1);assert.equal(r.ground,'run_boss_ground_baked');assert.equal(r.open,false);return r;});
 await check('Boss：冲锋锁定预警、暂停冻结计时与特效、恢复继续',async()=>{
 await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').boss.activeTelegraphs>0);await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').paused);
 const snap=()=>page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{hazards:s.boss.hazards,clock:s.boss.clock,effects:s.combat.effects,projectiles:s.projectiles.map(p=>({x:p.sprite.x,y:p.sprite.y,life:p.life})),time:s.timeAlive};});const a=await snap();assert.equal(a.hazards[0].kind,'lane');await page.waitForTimeout(350);assert.deepEqual(await snap(),a);await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').paused);await page.waitForTimeout(100);assert.ok((await snap()).time>a.time);return{windup:a.hazards[0].windup};});
 await check('Boss：地刺未到预警时间不伤害；命中可被冲刺无敌躲过',async()=>{const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),b=s.boss,p=s.player;s.physics.world.pause();s.paused=true;b.hazards=[];b.clock=10000;b.chargeMs=0;
 const hazard=()=>({kind:'circle',x:p.x,y:p.y,dx:0,dy:0,radius:64,length:0,age:0,windup:1150,fired:false});b.hazards.push(hazard());p.invulnTimer=0;const before=p.stats.hp;b.updateAI(p,1149);const safe=p.stats.hp;b.updateAI(p,1);const hit=p.stats.hp;b.hazards=[hazard()];p.invulnTimer=140;p.dashActive=140;b.updateAI(p,1150);const dodged=p.stats.hp;return{before,safe,hit,dodged};});assert.equal(r.safe,r.before);assert.ok(r.hit<r.safe);assert.equal(r.dodged,r.hit);return r;});
 await check('Boss：低血二阶段、五处地刺及16向孢子弹幕',async()=>{const r=await page.evaluate(()=>{
 const s=window.__seedGame.scene.getScene('Run'),b=s.boss,p=s.player;b.hazards=[];b.recoveryMs=0;b.chargeMs=0;b.hp=Math.floor(b.maxHp*0.49);b.clock=0;b.pattern=1;p.invulnTimer=10000;b.updateAI(p,1);const circles=b.hazards.length;b.updateAI(p,1150);b.hazards=[];b.recoveryMs=0;b.clock=0;b.pattern=2;s.projectiles.forEach(p=>p.sprite.destroy());s.projectiles=[];b.updateAI(p,1);b.updateAI(p,950);return{phase:b.phase,circles,shots:s.projectiles.length};});assert.deepEqual(r,{phase:2,circles:5,shots:16});
 await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.boss.hazards=[];s.boss.recoveryMs=0;s.boss.clock=0;s.boss.pattern=1;s.boss.updateAI(s.player,1);s.player.dashActive=0;s.player.invulnTimer=0;s.player.clearTint().setAlpha(1);s.updateHud();});await page.screenshot({path:path.join(OUT,'boss-phase2.png')});return r;});
 await check('Boss击杀→通关→奖励只结算一次，胜利不算死亡',async()=>{
 const before=await page.evaluate(()=>window.__seedDev.saveSystem.snapshot);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.invulnTimer=0;s.player.dashActive=0;s.hitEnemy(s.boss,99999,0,0,true,0,0);});await page.waitForFunction(()=>window.__seedGame.scene.getScene('Death')?.sys.isActive());await page.waitForTimeout(600);
 const r=await page.evaluate(async()=>{const {runState}=window.__seedDev;const save=window.__seedDev.saveSystem;return{outcome:runState.lastRun.outcome,mutations:runState.lastRun.mutations.length,settled:runState.deathSettled,save:save.snapshot,texts:window.__seedGame.scene.getScene('Death').children.list.filter(o=>o.type==='Text').map(t=>t.text)};});assert.equal(r.outcome,'victory');assert.equal(r.mutations,3);assert.ok(r.settled);assert.equal(r.save.totalDeaths,before.totalDeaths);assert.ok(r.save.essence-before.essence>=100);assert.ok(r.texts.some(t=>t.includes('章节通关')));await page.screenshot({path:path.join(OUT,'victory-zh.png')});
 await page.evaluate(()=>window.__seedGame.scene.getScene('Death').scene.restart());await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>window.__seedDev.saveSystem.snapshot),r.save);return{gained:r.save.essence-before.essence};});
 await check('重开归零突变/Boss/标记/监听，不继承上一局构筑',async()=>{await start('shade');const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{floor:s.floor,owned:s.build.owned.length,boss:!!s.boss,marks:s.marks.size,choice:!!s.choiceRoot,off:!!s.offChoiceKey,ground:s.groundImage.texture.key,ambush:s.player.forceAmbushCrit};});assert.deepEqual(r,{floor:1,owned:0,boss:false,marks:0,choice:false,off:false,ground:'run_ground_baked',ambush:false});return r;});
 await check('死亡与撤离分别结算，撤离不增加死亡次数',async()=>{let before=await page.evaluate(()=>window.__seedDev.saveSystem.totalDeaths);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.invulnTimer=0;s.player.applyDamage(99999);});await page.waitForFunction(()=>window.__seedGame.scene.getScene('Death')?.sys.isActive());assert.equal(await page.evaluate(()=>window.__seedDev.saveSystem.totalDeaths),before+1);
 await start('reaver');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').paused);await page.waitForTimeout(100);await page.mouse.click(640,426);await page.waitForFunction(()=>window.__seedGame.scene.getScene('Death')?.sys.isActive());assert.equal(await page.evaluate(()=>window.__seedDev.saveSystem.totalDeaths),before+1);assert.equal(await page.evaluate(async()=>window.__seedDev.runState.lastRun.outcome),'abandoned');});
 await check('英文三选一与通关UI没有未翻译key',async()=>{await start('thorn','en');await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.floorTimer=45000;});await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').choosing);await page.screenshot({path:path.join(OUT,'mutation-en.png')});const texts=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');const all=[];const visit=o=>{if(o.type==='Text')all.push(o.text);if(o.list)o.list.forEach(visit);};visit(s.choiceRoot);return all;});assert.ok(texts.includes('Choose a parasite mutation'));assert.ok(texts.every(t=>!t.startsWith('mutation_')));});
 await check('四种渲染倍率：鼠标点卡片中心实际命中正确选项',async()=>{for(const scale of [0.75,1,1.5,2]){await start('thorn');await page.evaluate(scale=>{window.__seedDev.applyRenderScale(scale);window.__seedGame.scene.getScene('Run').floorTimer=45000;},scale);await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').choosing);const id=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').choices[1].id);await page.waitForTimeout(100);await page.mouse.click(640,410);await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').choosing);assert.equal(await page.evaluate(()=>window.__seedGame.scene.getScene('Run').build.owned[0]),id);}await page.evaluate(()=>window.__seedDev.applyRenderScale(1));});
 await check('模拟手机：真触摸选突变、选择期旋屏不误恢复战斗',async()=>{
 const mc=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'zh-CN'}),mp=await mc.newPage();mp.on('pageerror',e=>errors.push(e.stack));await mp.goto('http://127.0.0.1:5173');await mp.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await start('thorn','zh',mp);await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').floorTimer=45000);await mp.waitForFunction(()=>window.__seedGame.scene.getScene('Run').choosing);await mp.setViewportSize({width:390,height:844});await mp.waitForTimeout(150);assert.equal(await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').choosing),true);await mp.setViewportSize({width:844,height:390});await mp.waitForTimeout(200);
 await mp.screenshot({path:path.join(OUT,'mutation-mobile.png')});const id=await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').choices[2].id),box=await mp.locator('canvas').boundingBox();await mp.touchscreen.tap(box.x+960/1280*box.width,box.y+410/720*box.height);await mp.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').choosing);assert.equal(await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').build.owned[0]),id);assert.equal(await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').virtual.isVisible),true);await mc.close();});
 await check('四职业都能用真实普攻击中并击杀Boss，接入胜利结算',async()=>{
 const detail=[];
 for(const id of ['warden','reaver','shade','thorn']) {
  await start(id);await finishFloor();await finishFloor();await finishFloor();
  const hit=await page.evaluate(id=>{
   const s=window.__seedGame.scene.getScene('Run'),p=s.player,b=s.boss;s.paused=true;s.physics.world.pause();b.hazards=[];
   p.setPosition(b.x+(id==='thorn'?150:60),b.y);p.facing.set(-1,0);p.stats.critChance=0;p.attackTimer=0;p.invulnTimer=10000;
   const hp=b.hp;s.tryPlayerAttack();if(id==='thorn')s.updateProjectiles(300);const damage=hp-b.hp;
   b.hp=1;p.attackTimer=0;s.tryPlayerAttack();if(id==='thorn')s.updateProjectiles(300);
   return {id,damage,ended:s.ended,alive:b.isAlive};
  },id);
  assert.ok(hit.damage>0);assert.equal(hit.ended,true);assert.equal(hit.alive,false);
  await page.waitForFunction(()=>window.__seedGame.scene.getScene('Death')?.sys.isActive());
  assert.equal(await page.evaluate(async()=>window.__seedDev.runState.lastRun.outcome),'victory');detail.push(hit);
 }
 return detail;
 });
 await check('Boss竞技场复用碰撞组，真实移动不能穿过新围墙；主战场不被技能栏遮挡',async()=>{
 await start();await finishFloor();await finishFloor();await finishFloor();
 await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.setPosition(540,720);s.player.body.reset(540,720);s.player.invulnTimer=10000;});
 await page.keyboard.down('a');await page.waitForTimeout(400);await page.keyboard.up('a');
 const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{x:s.player.x,bottom:Math.max(...s.wallRects.filter(r=>r.y<900).map(r=>r.y)),wall:s.pointInWall(500,720),open:s.pointInWall(600,720),following:!!s.cameras.main._follow};});
 assert.ok(r.x>=525 && r.x<540);assert.equal(r.wall,true);assert.equal(r.open,false);assert.equal(r.following,false);return r;
 });
 await check('四职业演出截图：独立斩击/技能/残影，并限制粒子与弹体数量',async()=>{
 for(const id of ['warden','reaver','shade','thorn']) {
  await isolated(id);
  await page.evaluate(id=>{
   const s=window.__seedGame.scene.getScene('Run'),p=s.player;
   for(const [dx,dy] of [[60,0],[90,30],[-70,40]]) window.probeEnemy(dx,dy);
   p.wantSkill=true;p.updateEntity(16);p.wantSkill=false;s.consumeCombatEvents();
   if(p.pendingNova){p.pendingNova=false;s.fireNova();}
   p.facing.set(1,0);p.attackTimer=0;s.tryPlayerAttack();
   if(id==='shade'){s.combat.ghost(p,p.x-45,p.y);s.combat.ghost(p,p.x-25,p.y);}
   s.combat.update(60,p);s.updateHud();s.setActorsAnimsPaused(true);
  },id);
  await page.screenshot({path:path.join(OUT,`presentation-${id}.png`)});
  const limits=await page.evaluate(()=>{
   const s=window.__seedGame.scene.getScene('Run'),p=s.player;
   for(let i=0;i<250;i++){s.combat.impact(p.x,p.y,0x9ddcb0);s.combat.ghost(p);s.spawnProjectile(p.x,p.y,1,0,1,false,1);}
   return{effects:s.combat.effects.length,ghosts:s.combat.ghosts.length,projectiles:s.projectiles.length};
  });assert.ok(limits.effects<=80);assert.ok(limits.ghosts<=18);assert.ok(limits.projectiles<=180);
 }
 });
 await check('全新存档30秒自然战斗烟测：真实按键/瞄准，不改属性、刷怪、时钟或楼层',async()=>{
 const fresh=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN'}),fp=await fresh.newPage();fp.on('pageerror',e=>errors.push(e.stack));await fp.goto('http://127.0.0.1:5173');await fp.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await start('reaver','zh',fp);
 const initial=await fp.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{hp:s.player.stats.maxHp,damage:s.player.stats.damage,seed:window.__seedDev.saveSystem.seedStage};});assert.deepEqual(initial,{hp:110,damage:19,seed:1});
 await fp.keyboard.down('Space');const until=Date.now()+30000;let last;
 while(Date.now()<until){
  last=await fp.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,c=s.cameras.main;const e=s.enemies.getChildren().filter(e=>e.isAlive).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];return{ended:s.ended,choosing:s.choosing,kills:s.kills,damage:s.damageDealt,hp:p.stats.hp,skill:p.skillReady,x:e?Math.max(2,Math.min(1278,e.x-c.scrollX)):640,y:e?Math.max(2,Math.min(718,e.y-c.scrollY)):360,time:s.timeAlive};});
  if(last.ended||last.choosing)break;
  await fp.mouse.move(last.x,last.y);if(last.skill)await fp.keyboard.press('q');await fp.waitForTimeout(120);
 }
 await fp.keyboard.up('Space');assert.ok(last.kills>=3,JSON.stringify(last));assert.ok(last.damage>0);assert.ok(last.time>8);await fp.screenshot({path:path.join(OUT,'natural-run.png')});await fresh.close();return last;
 });
 await check('致死接触优先于同帧壁垒脉冲，不会死后反杀并错判通关',async()=>{
 await start('warden');await finishFloor();await finishFloor();await finishFloor();
 const r=await page.evaluate(async()=>{
  const s=window.__seedGame.scene.getScene('Run'),p=s.player,b=s.boss;s.build.acquire('warden_thorns');b.hp=1;
  p.setPosition(b.x+60,b.y);p.skillActive=1000;p.invulnTimer=0;p.stats.hp=1;s.thornPulse=0;p.applyDamage(99999);s.update(0,16);
  const {runState}=window.__seedDev;return{dead:p.dead,outcome:runState.lastRun.outcome,bossAlive:b.isAlive};
 });assert.deepEqual(r,{dead:true,outcome:'death',bossAlive:true});await page.waitForFunction(()=>window.__seedGame.scene.getScene('Death')?.sys.isActive());return r;
 });
 await check('浏览器运行时零异常',async()=>assert.deepEqual(errors,[]));
 }finally{fs.writeFileSync(path.join(OUT,'chapter-checks.json'),JSON.stringify({date:new Date().toISOString(),results,errors,limitations:['楼层用计时器快进；职业数值与Boss形状测试使用隔离状态和受控delta，非自然时长平衡测试。','移动端为Edge触屏模拟，未验证安卓/iOS真机或APK/EXE。']},null,2));await browser.close();console.log(`Chapter browser: ${results.filter(r=>r.passed).length}/${results.length}`);}
})().catch(e=>{console.error(e);process.exitCode=1;});
