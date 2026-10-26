"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const OUT=path.resolve(process.env.SEED_WORLD_CLICK_OUTPUT||'output/world-click-ownership-v1/browser');
fs.mkdirSync(OUT,{recursive:true});
const checks=[],errors=[];let page;
async function check(name,f){try{const detail=await f();checks.push({name,passed:true,detail});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:String(e.stack)});await page.screenshot({path:path.join(OUT,`failure-${checks.length}.png`)}).catch(()=>{});throw e;}}
async function start(id='warden',release=true){
 if(release)await page.mouse.up();await page.keyboard.up('Space');
 await page.evaluate(id=>{const g=window.__seedGame;window.oldPlayer=g.scene.getScene('Run').player;window.__seedDev.saveSystem.setSelectedClass(id);for(const k of ['Menu','Run','Death'])g.scene.stop(k);g.scene.start('Run');},id);
 await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player!==window.oldPlayer&&s.player.classId===id&&s.cameras.main.fadeEffect.alpha===0;},id);
 await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;window.worldDowns=0;s.input.on('pointerdown',p=>{if(!p.wasTouch&&p.button===0)window.worldDowns++;});});
}
async function move(x,y){const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+x/1280*box.width,box.y+y/720*box.height);}
async function state(){return page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.input.manager.mousePointer;return{attacks:s.attackCount,paused:s.paused,pending:s.pendingAttack,want:s.player.wantAttack,owned:s.worldAttack.held(p.id,p.leftButtonDown()),worldDowns:window.worldDowns,volume:window.__seedDev.saveSystem.feedback.sfxVolume};});}
async function worldHold(){const before=(await state()).attacks;await move(850,410);await page.mouse.down();await page.waitForFunction(count=>window.__seedGame.scene.getScene('Run').attackCount>count,before);}
async function noMore(before,ms=530){await page.waitForTimeout(ms);assert.equal((await state()).attacks,before);}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 for(const id of ['warden','reaver','shade','thorn'])for(const button of ['sound','pause'])await check(`${id}: actual 380ms ${button} hold never attacks; release still activates UI exactly once`,async()=>{
  await start(id);const initial=await state();
  await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');window.uiCalls=0;const method=s.toggleSound,pause=s.togglePause;s.toggleSound=function(...args){window.uiCalls++;return method.apply(this,args);};s.togglePause=function(...args){window.uiCalls++;return pause.apply(this,args);};window.restoreUiObservation=()=>{s.toggleSound=method;s.togglePause=pause;};});
  await move(button==='sound'?962:1218,button==='sound'?94:92);await page.mouse.down();await page.waitForTimeout(380);
  const held=await state();assert.equal(held.attacks,0);assert.equal(held.pending,false);assert.equal(held.want,false);assert.equal(held.owned,false);assert.equal(held.worldDowns,0);assert.equal(held.paused,false);
  await page.screenshot({path:path.join(OUT,`${id}-${button}-held.png`)});await page.mouse.up();await page.waitForTimeout(65);
  const released=await state();assert.equal(released.attacks,0);assert.equal(await page.evaluate(()=>window.uiCalls),1);
  if(button==='pause')assert.equal(released.paused,true);else assert.equal(released.volume,initial.volume>0?0:0.55);
  await page.evaluate(()=>window.restoreUiObservation());return{held,released};
 });
 await check('Actual UI-origin drag into world stays non-attacking until a fresh world press',async()=>{
  await start();const before=await state();await move(962,94);await page.mouse.down();await move(850,410);await noMore(0,600);assert.equal((await state()).owned,false);await page.mouse.up();assert.equal((await state()).volume,before.volume);await page.mouse.down();await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').attackCount===1);await page.mouse.up();await noMore(1);return state();
 });
 await check('Actual fast world click queues exactly one strike after release',async()=>{
  await start();await move(850,410);await page.mouse.down();await page.mouse.up();await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').attackCount===1);await noMore(1);const s=await state();assert.equal(s.owned,false);return s;
 });
 await check('World-origin hold repeats across HUD; RMB release and other-finger fixture do not cancel LMB',async()=>{
  await start();await worldHold();await page.waitForTimeout(520);const first=await state();assert.ok(first.attacks>=2);await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});await move(962,94);
  await page.evaluate(()=>window.__seedGame.scene.getScene('Run').onAttackRelease({wasTouch:true,id:17,leftButtonDown:()=>false}));
  assert.equal((await state()).owned,true);await page.waitForTimeout(530);const after=await state();assert.ok(after.attacks>first.attacks);await page.mouse.up();await noMore(after.attacks);assert.equal((await state()).owned,false);assert.equal((await state()).volume,first.volume);return{first,after};
 });
 await check('RMB-only actual hold does not authorize basic attacks',async()=>{await start();await move(850,410);await page.mouse.down({button:'right'});await noMore(0);assert.equal((await state()).owned,false);await page.mouse.up({button:'right'});return state();});
 await check('Explicit Space attack remains independent during a UI-origin mouse hold',async()=>{
  await start();await move(962,94);await page.mouse.down();await page.keyboard.down('Space');await page.waitForTimeout(650);const s=await state();assert.ok(s.attacks>=2);assert.equal(s.owned,false);await page.keyboard.up('Space');await page.mouse.up();await noMore(s.attacks);return s;
 });
 await check('Actual Shade Q + UI hold preserves stealth/200HP foe; fresh world ambush still earns reverse dash',async()=>{
  await start('shade');await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;p.stats.critChance=0;p.setPosition(1100,950);p.body.reset(p.x,p.y);s.cameras.main.stopFollow();s.cameras.main.centerOn(p.x,p.y);});
  await move(962,94);await page.keyboard.press('q');await page.waitForFunction(()=>{const p=window.__seedGame.scene.getScene('Run').player;return p.isStealthed&&!p.isDashing;});
  await page.evaluate(async()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,{Enemy}=await import('/src/entities/Enemy.ts'),point=s.cameras.main.getWorldPoint(962,94),dx=point.x-p.x,dy=point.y-p.y,l=Math.hypot(dx,dy);const e=window.uiEnemy=new Enemy(s,p.x+dx/l*45,p.y+dy/l*45,'crawler',1,false,0);e.hp=e.maxHp=200;e.speed=0;s.enemies.add(e);e.body.reset(e.x,e.y);});
  await page.mouse.down();await page.waitForTimeout(180);
  const held=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{stealth:s.player.isStealthed,hp:window.uiEnemy.hp,attacks:s.attackCount,remaining:s.player.shadowReturnRemaining};});
  assert.deepEqual(held,{stealth:true,hp:200,attacks:0,remaining:0});await page.screenshot({path:path.join(OUT,'shade-ui-ambush.png')});await page.mouse.up();
  const aim=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),c=s.cameras.main,e=window.uiEnemy;return{x:(e.x-c.worldView.x)*c.zoom,y:(e.y-c.worldView.y)*c.zoom};});
  await move(aim.x,aim.y);await page.mouse.down();await page.mouse.up();await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').player.shadowReturnRemaining>0);
  const strike=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;return{hp:window.uiEnemy.hp,stealth:p.isStealthed,attacks:s.attackCount,x:p.x,y:p.y,aimX:p.aimIntent.x,aimY:p.aimIntent.y};});assert.equal(strike.hp,167);assert.equal(strike.stealth,false);assert.equal(strike.attacks,1);
  await page.keyboard.press('Shift');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').player.isDashing);
  const dash=await page.evaluate(()=>{const p=window.__seedGame.scene.getScene('Run').player;return{vx:p.body.velocity.x,vy:p.body.velocity.y};});assert.ok(dash.vx*strike.aimX+dash.vy*strike.aimY<0);return{held,strike,dash};
 });
 for(const event of ['blur','hidden'])await check(`Engine ${event} fixture clears an actual world hold; no stale replay after focus recovery`,async()=>{
  await start();await worldHold();await page.evaluate(event=>window.__seedGame.events.emit(event),event);const count=(await state()).attacks;assert.equal((await state()).owned,false);await noMore(count);await page.mouse.up();await worldHold();assert.ok((await state()).attacks>count);await page.mouse.up();return{event,afterClear:count,afterFresh:(await state()).attacks};
 });
 await check('Actual pause/resume keyboard during held mouse requires a fresh world press',async()=>{
  await start();await worldHold();await page.keyboard.press('Escape');assert.equal((await state()).paused,true);assert.equal((await state()).owned,false);const n=(await state()).attacks;await page.keyboard.press('Escape');await noMore(n);await page.mouse.up();await worldHold();assert.ok((await state()).attacks>n);await page.mouse.up();return state();
 });
 await check('Choice lifecycle fixture + actual digit selection clears the pre-choice mouse hold',async()=>{
  await start();await worldHold();await page.evaluate(()=>window.__seedGame.scene.getScene('Run').openMutationChoice());assert.equal((await state()).owned,false);const n=(await state()).attacks;await page.keyboard.press('Digit1');await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').choosing);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;});await noMore(n);await page.mouse.up();return state();
 });
 await check('Direct next-floor lifecycle fixture also flushes queued/held mouse attack',async()=>{
  await start();await worldHold();await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.beginNextFloor();s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;});const n=(await state()).attacks;assert.equal((await state()).owned,false);assert.equal((await state()).pending,false);await noMore(n);await page.mouse.up();return state();
 });
 await check('End/restart lifecycle fixture clears old gesture; same physical hold never attacks new run',async()=>{
  await start();await worldHold();await page.evaluate(()=>window.__seedGame.scene.getScene('Run').endRun(false));assert.equal((await state()).owned,false);await start('warden',false);await noMore(0);assert.equal((await state()).owned,false);await page.mouse.up();await worldHold();assert.ok((await state()).attacks>0);await page.mouse.up();return state();
 });
 await check('Actual mouse release outside letterboxed canvas recovers ownership',async()=>{
  await page.setViewportSize({width:1600,height:720});await start();await worldHold();const box=await page.locator('canvas').boundingBox();assert.ok(box.x>10);await page.mouse.move(box.x-10,360);await page.mouse.up();await page.waitForTimeout(70);assert.equal((await state()).owned,false);const n=(await state()).attacks;await noMore(n);await page.setViewportSize({width:1280,height:720});return{canvas:box,afterRelease:n};
 });
 await check('Four render scales x CN/EN: faded SFX UI consumes the same real mouse hold',async()=>{
  const rows=[];for(const locale of ['zh','en'])for(const scale of [.75,1,1.5,2]){
   await page.evaluate(({scale,locale})=>{window.__seedDev.applyRenderScale(scale);window.__seedDev.saveSystem.setLanguage(locale);},{scale,locale});await start('thorn');await page.evaluate(()=>window.__seedGame.scene.getScene('Run').soundButton.setAlpha(.1));await move(962,94);await page.mouse.down();await noMore(0,380);assert.equal((await state()).owned,false);assert.equal((await state()).worldDowns,0);await page.mouse.up();rows.push({locale,scale,attacks:(await state()).attacks});
  }await page.evaluate(()=>{window.__seedDev.applyRenderScale(1);window.__seedDev.saveSystem.setLanguage('zh');});return rows;
 });
 await check('Run restarts do not accumulate world/focus listeners; shutdown removes exact handlers',async()=>{
  const rows=[];for(let n=0;n<4;n++){
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),g=window.__seedGame;return{down:s.input.listeners('pointerdown').filter(f=>f===s.onAttackPointer).length,up:s.input.listeners('pointerup').filter(f=>f===s.onAttackRelease).length,out:s.input.listeners('pointerupoutside').filter(f=>f===s.onAttackRelease).length,blur:g.events.listeners('blur').filter(f=>f===s.onPointerFocusLost).length,hidden:g.events.listeners('hidden').filter(f=>f===s.onPointerFocusLost).length};});assert.deepEqual(r,{down:1,up:1,out:1,blur:1,hidden:1});rows.push(r);
   await page.evaluate(()=>window.__seedGame.scene.stop('Run'));await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').sys.isActive());assert.equal(await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return window.__seedGame.events.listeners('blur').filter(f=>f===s.onPointerFocusLost).length;}),0);
  }return rows;
 });
 await check('Emulated real touch: four-class attack/drag/skill/dash work without granting mouse ownership',async()=>{
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const mp=await ctx.newPage();mp.on('pageerror',e=>errors.push(String(e.stack)));const cdp=await ctx.newCDPSession(mp),rows=[];
  try{await mp.goto('http://127.0.0.1:5173');await mp.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());for(const id of ['warden','reaver','shade','thorn']){
   await mp.evaluate(id=>{const g=window.__seedGame;window.oldPlayer=g.scene.getScene('Run').player;window.__seedDev.saveSystem.setSelectedClass(id);for(const key of ['Menu','Run','Death'])g.scene.stop(key);g.scene.start('Run');},id);
   await mp.waitForFunction(()=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player!==window.oldPlayer&&s.cameras.main.fadeEffect.alpha===0;});await mp.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;});
   const box=await mp.locator('canvas').boundingBox(),point=(x,y,id=11)=>({x:box.x+x/1280*box.width,y:box.y+y/720*box.height,id});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1190,630)]});await mp.waitForFunction(()=>window.__seedGame.scene.getScene('Run').attackCount>0);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1130,590)]});const aim=await mp.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{x:s.virtual.attackAim.x,y:s.virtual.attackAim.y,owner:s.worldAttack.held(0,true)};});assert.ok(aim.x<0&&aim.y<0);assert.equal(aim.owner,false);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1130,590),point(150,570,12)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point(150,570,12)]});assert.equal(await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').virtual.attackHeld),true);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').virtual.attackHeld),false);
   for(const [action,x,y]of [['dash',1105,580],['skill',1105,665]]){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(x,y)]});await mp.waitForFunction(action=>window.__seedGame.scene.getScene('Run').player.cooldownRemaining(action)>0,action);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   rows.push({id,aim,attacks:await mp.evaluate(()=>window.__seedGame.scene.getScene('Run').attackCount)});
  }}finally{await ctx.close();}return rows;
 });
 await check('No browser runtime exceptions',async()=>assert.deepEqual(errors,[]));
}finally{
 fs.writeFileSync(path.join(OUT,'world-click-browser-checks.json'),JSON.stringify({date:new Date().toISOString(),checks,errors,scope:'Controlled live-clock engine fixtures with actual Playwright mouse/key/touch input. Lifecycle and blur/hidden are explicitly invoked engine fixtures, not real OS focus changes. Touch is emulated, not device acceptance. Not a natural combat or subjective fun proof.'},null,2));await browser.close();
 console.log(`World click browser: ${checks.filter(c=>c.passed).length}/${checks.length}`);
}
})().catch(e=>{console.error(e);process.exitCode=1;});
