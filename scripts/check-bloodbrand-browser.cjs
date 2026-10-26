'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = path.resolve(process.env.SEED_BLOODBRAND_OUTPUT || 'output/reaver-bloodbrand-v1/checks');
fs.mkdirSync(OUT, { recursive: true });
let page;
const checks = [], errors = [];
async function check(name, fn) {
  if (process.env.SEED_BLOODBRAND_FILTER && !name.includes(process.env.SEED_BLOODBRAND_FILTER)) return;
  try {
    const detail = await fn(); checks.push({ name, passed: true, detail }); console.log('PASS', name);
  } catch (e) {
    const state = await page.evaluate(() => {
      const s = window.__seedGame.scene.getScene('Run'), p = s.player;
      return { hp:p.stats.hp, position:[p.x,p.y], pursuit:p.pursuit, attacks:s.attackCount, paused:s.paused, reservation:s.pursuitBrand?{pulses:s.pursuitBrand.pulses}:null, trace:window.trace };
    }).catch(() => null);
    checks.push({ name, passed:false, error:String(e.stack), state });
    await page.screenshot({ path:path.join(OUT,'failure.png') }).catch(() => {});
    throw e;
  }
}
async function start(id='reaver', live=false) {
  for (const key of ['Space','w','a','s','d','q','Shift','Escape']) await page.keyboard.up(key);
  await page.evaluate(id => {
    const g=window.__seedGame; window.oldPlayer=g.scene.getScene('Run').player;
    window.__seedDev.saveSystem.setSelectedClass(id);
    window.__seedDev.saveSystem.setLanguage('zh');
    window.__seedDev.saveSystem.setFeedback({ impactMotion:false, sfxVolume:.4 });
    for (const key of ['Run','Menu','Death','ClassSelect']) g.scene.stop(key);
    g.scene.start('Run');
  }, id);
  await page.waitForFunction(id => {
    const s=window.__seedGame.scene.getScene('Run');
    return s.sys.isActive() && s.player!==window.oldPlayer && s.player.classId===id && s.cameras.main.fadeEffect.alpha===0;
  }, id);
  await page.evaluate(async live => {
    const s=window.__seedGame.scene.getScene('Run'), p=s.player;
    const {Enemy}=await import('/src/entities/Enemy.ts');
    s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;
    s.paused=!live;if(!live)s.physics.world.pause();
    p.setPosition(1100,950);p.body.reset(p.x,p.y);p.body.updateFromGameObject();p.setVelocity(0,0);
    p.stats.critChance=0;s.cameras.main.stopFollow();s.cameras.main.centerOn(p.x,p.y);
    p.moveIntent.set(1,0);p.aimIntent.set(1,0);p.updateEntity(1);
    window.trace=[];
    const begin=p.startPursuit.bind(p), strike=p.consumePursuitStrike.bind(p);
    p.startPursuit=(...args)=>{const result=begin(...args);if(result)window.trace.push({event:'start',time:s.timeAlive,x:p.x,y:p.y,distance:args[0],paidWound:!!args[1]});return result;};
    p.consumePursuitStrike=()=>{const result=strike();if(result)window.trace.push({event:'strike',time:s.timeAlive,x:p.x,y:p.y});return result;};
    window.foe=(dx=110,dy=0,hp=200,wake=0)=>{
      const e=new Enemy(s,p.x+dx,p.y+dy,'crawler',1,false,wake);
      e.hp=e.maxHp=hp;e.speed=0;s.enemies.add(e);e.body.updateBounds();e.body.reset(e.x,e.y);e.body.updateFromGameObject();
      window.target=e;return e;
    };
    window.attack=(held=false,direction)=>{const paused=s.paused;s.paused=false;try{s.tryPlayerAttack(held,direction);}finally{s.paused=paused;}};
    window.earn=()=>{const e=window.foe(-45,0,1);s.hitEnemy(e,1,0,0,false,0,0);s.hitStopMs=s.hitStopCooldown=0;};
    window.step=(count=8)=>{s.physics.world.resume();s.physics.world.update(performance.now(),count*1000/60);s.physics.world.postUpdate();s.physics.world.pause();};
    window.brand=(dx=110,bleed=3100,tick=1000)=>{s.build.acquire('reaver_bleed');const e=window.foe(dx);s.marks.set(e,{seeds:0,bleed,tick});return e;};
    window.finish=()=>{const direction=p.consumePursuitStrike();if(direction)window.attack(false,direction);return direction;};
  }, live);
  await page.mouse.move(800,360);
}
(async()=>{
 const b=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const ctx=await b.newContext({viewport:{width:1280,height:720}});page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
  await check('普通真实命中种下流血，未击杀也不自动觉醒或白送击杀票',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.foe(50);s.build.acquire('reaver_bleed');s.hitEnemy(e,19,1,0,false,0,0,true);return{hp:e.hp,mark:s.marks.get(e),awake:p.isAwakened,killTicket:p.pursuitAvailable,kills:s.kills};});assert.deepEqual(r,{hp:181,mark:{seeds:0,bleed:3100,tick:1000},awake:false,killTicket:false,kills:0});return r;
  });
  await check('没有突变/没有伤口不能无击杀追斩，其他职业不能借用授权',async()=>{
   const rows=[];for(const id of ['reaver','warden','shade','thorn']){await start(id);rows.push(await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;const acquired=s.build.acquire('reaver_bleed');window.foe();window.attack();return{id:p.classId,acquired,active:p.isPursuing};}));}assert.ok(rows.every(r=>!r.active&&r.acquired===(r.id==='reaver')));return rows;
  });
  await check('承诺先支付伤口，踏步无伤害；命中只结清原3脉冲且不再种新伤口',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.brand();window.attack();const before={hp:e.hp,active:p.isPursuing,pulses:s.pursuitBrand?.pulses,mark:s.marks.has(e),invuln:p.isInvulnerable,count:s.attackCount};window.step();window.finish();const hp=e.hp;s.updateMutations(3500);window.finish();return{before,after:{hp:e.hp,count:s.attackCount,available:p.pursuitAvailable,mark:s.marks.has(e),pending:!!s.pursuitBrand},unchanged:hp===e.hp};});assert.deepEqual(r.before,{hp:200,active:true,pulses:3,mark:false,invuln:false,count:0});assert.deepEqual(r.after,{hp:166,count:1,available:false,mark:false,pending:false});assert.ok(r.unchanged);return r;
  });
  await check('相位保留：刷新后的4脉冲结20，而不是写死3脉冲或暴击放大',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.brand(110,3100,100);window.attack();const pulses=s.pursuitBrand.pulses;window.step();window.finish();return{pulses,hp:e.hp};});assert.deepEqual(r,{pulses:4,hp:161});return r;
  });
  await check('暴击/露核逐脉冲取整，流血部分不吃普攻暴击倍率',async()=>{
   const rows=[];for(const test of ['crit','exposed','both']){await start();rows.push(await page.evaluate(test=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.brand();if(test!=='exposed')p.stats.critChance=1;if(test!=='crit')Object.defineProperty(e,'incomingDamageMultiplier',{get:()=>1.25});window.attack();window.step();window.finish();return{test,hp:e.hp};},test));}assert.deepEqual(rows,[{test:'crit',hp:152},{test:'exposed',hp:156},{test:'both',hp:138}]);return rows;
  });
  await check('普通流血和3100ms追帧都只支付原3脉冲，不丢伤害也不重放',async()=>{
   const rows=[];for(const hitch of [false,true]){await start();rows.push(await page.evaluate(hitch=>{const s=window.__seedGame.scene.getScene('Run'),e=window.brand();if(hitch)s.updateMutations(3100);else for(let i=0;i<31;i++)s.updateMutations(100);const hp=e.hp;s.updateMutations(5000);return{hitch,hp:e.hp,unchanged:hp===e.hp,marks:s.marks.size};},hitch));}assert.deepEqual(rows,[{hitch:false,hp:185,unchanged:true,marks:0},{hitch:true,hp:185,unchanged:true,marks:0}]);return rows;
  });
  await check('重复普攻只刷新持续时间，不重置下一脉冲相位',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.brand();s.updateMutations(900);s.hitEnemy(e,1,1,0,false,0,0,true);const mark={...s.marks.get(e)};s.updateMutations(100);return{mark,hp:e.hp};});assert.deepEqual(r,{mark:{seeds:0,bleed:3100,tick:100},hp:194});return r;
  });
  await check('伤口支付不吞已有击杀票，实际击杀只结算一次',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.brand();window.attack();window.step();window.finish();const preserved=p.pursuitAvailable;p.attackTimer=0;p.cancelPursuit();s.marks.set(e,{seeds:0,bleed:3100,tick:1000});e.hp=20;e.setPosition(p.x+110,p.y);e.body.reset(e.x,e.y);e.body.updateFromGameObject();window.attack();window.step();window.finish();return{preserved,kills:s.kills,dead:!e.isAlive,ticket:p.pursuitAvailable,window:p.pursuitRemaining};});assert.deepEqual(r,{preserved:true,kills:2,dead:true,ticket:true,window:1200});return r;
  });
  await check('扑空不退款，不把原目标剩余伤害转移给另一个敌人',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.brand();window.attack();e.setPosition(p.x-150,p.y+100);e.body.reset(e.x,e.y);e.body.updateFromGameObject();const other=window.foe(105);window.step();window.finish();return{original:e.hp,other:other.hp,oldMark:s.marks.has(e),newMark:s.marks.get(other)?.bleed,pending:!!s.pursuitBrand};});assert.deepEqual(r,{original:200,other:181,oldMark:false,newMark:3100,pending:false});return r;
  });
  await check('途中丢失视线时不隔墙补刀或结清，已付伤口仍不返还',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.brand();window.attack();s.navigation.clearLine=()=>false;window.step();window.finish();return{hp:e.hp,mark:s.marks.has(e),pending:!!s.pursuitBrand,count:s.attackCount};});assert.deepEqual(r,{hp:200,mark:false,pending:false,count:1});return r;
  });
  await check('持续按住不会花伤口；近敌优先、后退、隔墙也不消耗',async()=>{
   const rows=[];for(const test of ['hold','near','retreat','wall']){await start();rows.push(await page.evaluate(test=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.brand();if(test==='near')window.foe(45);if(test==='retreat')p.moveIntent.set(-1,0);if(test==='wall')s.navigation.clearLine=()=>false;window.attack(test==='hold');return{test,active:p.isPursuing,left:s.marks.get(e)?.bleed};},test));}assert.ok(rows.every(r=>!r.active&&r.left===3100));return rows;
  });
  await check('没有未来脉冲的残余状态不能付费，伤口已经过期也不能白追',async()=>{
   const rows=[];for(const left of [0,99]){await start();rows.push(await page.evaluate(left=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.brand(110,left,100);window.attack();return{left,active:p.isPursuing};},left));}assert.ok(rows.every(r=>!r.active));return rows;
  });
  await check('实际受击/冲刺/血涌取消后不迟到结清，也不退款',async()=>{
   const rows=[];for(const action of ['hurt','dash','skill']){await start();rows.push(await page.evaluate(action=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.brand();window.attack();if(action==='hurt')p.applyDamage(8);else s[action==='dash'?'pendingDash':'pendingSkill']=true;s.paused=false;s.update(0,1);s.paused=true;window.step(20);window.finish();return{action,active:p.isPursuing,left:s.marks.get(e)?.bleed??0,pending:!!s.pursuitBrand,count:s.attackCount};},action));}assert.ok(rows.every(r=>!r.active&&r.left===0&&!r.pending&&r.count===0),JSON.stringify(rows));return rows;
  });
  await check('实际暂停菜单冻结已支付预约，恢复后只结清一次',async()=>{
   await start();await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');window.brand();window.attack();s.paused=false;s.togglePause();});const before=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{pulses:s.pursuitBrand.pulses,x:s.player.x,hp:window.target.hp};});await page.waitForTimeout(180);const r=await page.evaluate(before=>{const s=window.__seedGame.scene.getScene('Run');const frozen=s.paused&&s.physics.world.isPaused&&s.pursuitBrand.pulses===before.pulses&&s.player.x===before.x&&window.target.hp===before.hp;s.togglePause();s.physics.world.pause();s.paused=true;window.step();window.finish();window.finish();return{frozen,hp:window.target.hp,count:s.attackCount};},before);assert.deepEqual(r,{frozen:true,hp:166,count:1});return r;
  });
  await check('三选一/换层/死亡/结算清理预约，不带入下一局',async()=>{
   const rows=[];for(const action of ['choice','floor','death','end']){await start();rows.push(await page.evaluate(action=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.brand();window.attack();if(action==='choice')s.openMutationChoice();if(action==='floor')s.beginNextFloor();if(action==='death'){p.applyDamage(999);s.endRun(false);}if(action==='end')s.endRun(true);return{action,pending:!!s.pursuitBrand,active:p.isPursuing};},action));}assert.ok(rows.every(r=>!r.pending&&!r.active));await start();return rows;
  });
  await check('第三刀进度只数实际出刀，原110范围/90%群斩不改',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.build.acquire('reaver_cleave');window.attack();p.attackTimer=0;window.attack();s.combat.update(0,p,false);const ready={count:s.attackCount,steps:s.combat.requiemSteps,visible:s.combat.requiemBlades.visible,commands:s.combat.requiemBlades.commandBuffer.length};const enemies=[];for(let i=0;i<4;i++)enemies.push(window.foe(Math.cos(i*Math.PI/2)*90,Math.sin(i*Math.PI/2)*90));p.attackTimer=0;window.attack();s.combat.update(0,p,false);return{ready,after:{count:s.attackCount,steps:s.combat.requiemSteps,flash:s.combat.requiemFlash,hp:enemies.map(e=>e.hp)}};});assert.equal(r.ready.count,2);assert.equal(r.ready.steps,2);assert.ok(r.ready.visible&&r.ready.commands>0);assert.deepEqual(r.after,{count:3,steps:0,flash:160,hp:[183,183,183,183]});return r;
  });
  await check('双突变第三刀追入只追加一轮群斩和一份已付流血',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.brand();s.build.acquire('reaver_cleave');s.attackCount=2;window.attack();const before=s.attackCount;window.step();window.finish();s.updateMutations(5000);return{before,count:s.attackCount,hp:e.hp,mark:s.marks.has(e)};});assert.deepEqual(r,{before:2,count:3,hp:149,mark:false});return r;
  });
  await check('真实键鼠：先普攻刻伤，再移动重按追斩；没有击杀票也实际结清',async()=>{
   await start('reaver',true);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('reaver_bleed');window.foe(62);window.frames=[];window.capture=()=>{const s=window.__seedGame.scene.getScene('Run');if(window.frames.length<90)window.frames.push({time:performance.now(),x:s.player.x,active:s.player.isPursuing,attacks:s.attackCount,image:document.querySelector('canvas').toDataURL('image/png').split(',')[1]});};window.__seedGame.events.on('postrender',window.capture);});
   await page.keyboard.press('Space');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').marks.has(window.target));await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').player.attackReady);
   const before=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{hp:window.target.hp,ticket:s.player.pursuitAvailable,kills:s.kills};});await page.keyboard.down('d');await page.keyboard.press('Space');await page.waitForFunction(()=>window.trace.some(e=>e.event==='strike'));await page.keyboard.up('d');
   const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.paused=true;s.physics.world.pause();return{hp:window.target.hp,kills:s.kills,count:s.attackCount,trace:window.trace,remaining:s.marks.get(window.target)?.bleed??0,awake:s.player.isAwakened};});assert.deepEqual(before,{hp:181,ticket:false,kills:0});assert.equal(r.hp,147);assert.equal(r.count,2);assert.equal(r.remaining,0);assert.equal(r.awake,false);assert.ok(r.trace.some(e=>e.event==='start'&&e.paidWound));
   await page.screenshot({path:path.join(OUT,'keyboard-rend.png')});const frames=await page.evaluate(()=>{window.__seedGame.events.off('postrender',window.capture);return window.frames;});fs.mkdirSync(path.join(OUT,'frames'),{recursive:true});for(let i=0;i<frames.length;i++){fs.writeFileSync(path.join(OUT,'frames',`${i}`.padStart(3,'0')+'.png'),Buffer.from(frames[i].image,'base64'));delete frames[i].image;}fs.writeFileSync(path.join(OUT,'frame-times.json'),JSON.stringify(frames,null,2));return{before,...r};
  });
  await check('提示/第三刀标记500次更新不增对象，四倍率不改体积或伤害',async()=>{
   const rows=[];for(const scale of [.75,1,1.5,2]){await start();rows.push(await page.evaluate(scale=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.__seedDev.applyRenderScale(scale);window.brand();s.build.acquire('reaver_cleave');s.combat.setRequiemProgress(2);const count=s.children.length;for(let i=0;i<500;i++)s.combat.update(0,p,false);const growth=s.children.length-count;s.updateHud();const zh=s.pursuitText.text;window.__seedDev.i18n.setLang('en');s.updateHud();const en=s.pursuitText.text,width=s.pursuitText.width;window.attack();window.step();window.finish();return{scale,growth,body:[p.body.width,p.body.height],hp:window.target.hp,zh,en,width};},scale));}assert.ok(rows.every(r=>r.growth===0&&r.hp===166&&r.zh.includes('血棘')&&r.en.includes('BLOODBRAND')&&r.width<=460));assert.ok(rows.every(r=>JSON.stringify(r.body)===JSON.stringify(rows[0].body)));await page.evaluate(()=>window.__seedDev.applyRenderScale(1));return rows;
  });
  await check('突变卡中英文说明不越界，真实选择流血不会偷开环斩觉醒',async()=>{
   const rows=[];for(const lang of ['zh','en']){await start();await page.evaluate(async lang=>{const s=window.__seedGame.scene.getScene('Run'),{MUTATIONS}=await import('/src/systems/RunBuild.ts');window.__seedDev.saveSystem.setLanguage(lang);s.build.offer=()=>[MUTATIONS.find(m=>m.id==='reaver_bleed'),MUTATIONS.find(m=>m.id==='reaver_cleave'),MUTATIONS.find(m=>m.id==='shared_feast')];s.openMutationChoice();},lang);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),card=s.choiceRoot.list.find(o=>o.getData?.('mutation-id')==='reaver_bleed'),desc=card.list.find(o=>o.type==='Text'&&(o.text.startsWith('普攻流血')||o.text.startsWith('Basic hits')));const bounds=desc.getBounds(),name=card.list.find(o=>o.type==='Text'&&(o.text==='血棘刻印'||o.text==='Bloodbrand')).getBounds();return{left:bounds.x,right:bounds.right,titleBottom:name.bottom,lang:window.__seedDev.i18n.current,top:bounds.y,bottom:bounds.bottom,height:bounds.height,cardTop:259,chooseTop:528};});assert.ok(r.top>=r.titleBottom+8&&r.bottom<528&&r.left>=195&&r.right<=445,JSON.stringify(r));await page.screenshot({path:path.join(OUT,`choice-${lang}.png`)});await page.keyboard.press('1');await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').choosing);const form=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{owned:s.build.has('reaver_bleed'),awake:s.player.isAwakened};});assert.deepEqual(form,{owned:true,awake:false});rows.push({...r,...form});}return rows;
  });
  await check('模拟触屏：移动摇杆加新点攻击，付费追斩同样结清',async()=>{
   const desktop=page,c=await b.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});page=await c.newPage();page.on('pageerror',e=>errors.push(e.stack));try{await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await start('reaver',true);await page.evaluate(()=>{window.brand(115);window.__seedGame.scene.getScene('Run').virtual.show();});const box=await page.locator('canvas').boundingBox(),cdp=await c.newCDPSession(page),point=(id,x,y)=>({id,x:box.x+x/1280*box.width,y:box.y+y/720*box.height});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,100,620)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,156,620)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,156,620),point(2,1160,610)]});await page.waitForFunction(()=>window.trace.some(e=>e.event==='strike'));await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const r=await page.evaluate(()=>({hp:window.target.hp,trace:window.trace}));assert.equal(r.hp,166);assert.ok(r.trace.some(e=>e.event==='start'&&e.paidWound));await page.screenshot({path:path.join(OUT,'touch-rend.png')});return r;}finally{await c.close();page=desktop;}
  });
  await check('模拟触屏中英文长说明也不穿卡、不压标题或确认按钮',async()=>{
   const desktop=page,c=await b.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});page=await c.newPage();const rows=[];
   try{await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());for(const lang of ['zh','en']){await start();await page.evaluate(async lang=>{const s=window.__seedGame.scene.getScene('Run'),{MUTATIONS}=await import('/src/systems/RunBuild.ts');window.__seedDev.saveSystem.setLanguage(lang);s.build.offer=()=>[MUTATIONS.find(m=>m.id==='reaver_bleed'),MUTATIONS.find(m=>m.id==='reaver_cleave'),MUTATIONS.find(m=>m.id==='shared_feast')];s.openMutationChoice();},lang);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),card=s.choiceRoot.list.find(o=>o.getData?.('mutation-id')==='reaver_bleed'),desc=card.list.find(o=>o.type==='Text'&&(o.text.startsWith('普攻流血')||o.text.startsWith('Basic hits'))),title=card.list.find(o=>o.type==='Text'&&(o.text==='血棘刻印'||o.text==='Bloodbrand')).getBounds(),bounds=desc.getBounds();return{lang:window.__seedDev.i18n.current,left:bounds.x,right:bounds.right,top:bounds.y,bottom:bounds.bottom,titleBottom:title.bottom,fontSize:desc.style.fontSize};});assert.ok(r.top>=r.titleBottom+8&&r.bottom<528&&r.left>=195&&r.right<=445,JSON.stringify(r));await page.screenshot({path:path.join(OUT,`choice-touch-${lang}.png`)});rows.push(r);}return rows;}finally{await c.close();page=desktop;}
  });
  await check('撕裂局部演出复用80上限，暂停不偷走时间，也不新增震屏闪白',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;let shakes=0,flashes=0;s.cameras.main.shake=()=>{shakes++;};s.cameras.main.flash=()=>{flashes++;};const before=s.children.length;for(let i=0;i<100;i++)s.combat.rip(p.x,p.y,0);s.combat.update(0,p,false);const ages=s.combat.effects.map(e=>e.age);s.update(0,500);return{growth:s.children.length-before,effects:s.combat.effects.length,frozen:JSON.stringify(ages)===JSON.stringify(s.combat.effects.map(e=>e.age)),shakes,flashes};});assert.deepEqual(r,{growth:0,effects:80,frozen:true,shakes:0,flashes:0});return r;
  });
  await check('浏览器没有未处理异常或缺失动画',()=>assert.deepEqual(errors,[]));
 }finally{fs.writeFileSync(path.join(OUT,'browser-checks.json'),JSON.stringify({checks,errors,date:new Date().toISOString(),scope:'Isolated engine fixtures plus actual keyboard and emulated touch. Not natural balance or subjective enjoyment acceptance.'},null,2));await ctx.close();await b.close();}
 console.log(`Bloodbrand browser: ${checks.length}/${checks.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
