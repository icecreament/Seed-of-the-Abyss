'use strict';
// Isolated engine/UI fixtures. Natural playthroughs remain separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve('output/hud-focus-v1');fs.mkdirSync(OUT,{recursive:true});const checks=[],errors=[];let browser,page;
async function check(name,f){try{const detail=await f();checks.push({name,passed:true,detail});console.log('PASS',name);}catch(error){checks.push({name,passed:false,error:error.stack});await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw error;}}
async function start(p=page){
 await p.evaluate(()=>{const g=window.__seedGame;window.previousPlayer=g.scene.getScene('Run').player;window.__seedDev.saveSystem.setSelectedClass('warden');window.__seedDev.saveSystem.setFeedback({impactMotion:false});for(const k of ['Run','Menu','Death'])g.scene.stop(k);g.scene.start('Run');});
 await p.waitForFunction(()=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player!==window.previousPlayer&&s.cameras.main.fadeEffect.alpha===0;});
 await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;s.player.invulnTimer=0;s.cameras.main.stopFollow();s.tweens.killTweensOf(s.bannerText);s.bannerText.setAlpha(0);s.setActorsAnimsPaused(true);});
}
async function place(x,y,cx=640,cy=360,p=page){await p.evaluate(({x,y,cx,cy})=>{const s=window.__seedGame.scene.getScene('Run');s.player.setPosition(x,y);s.player.body.reset(x,y);s.player.setVelocity(0,0);s.cameras.main.centerOn(cx,cy);},{x,y,cx,cy});await p.waitForTimeout(140);}
async function region(x,y,p=page){return p.evaluate(({x,y})=>{const s=window.__seedGame.scene.getScene('Run'),r=s.hudFocus.regions.find(r=>r.bounds.x===x&&r.bounds.y===y);return r.layers.map(l=>({alpha:l.target.alpha,type:l.target.type,text:l.target.text,role:l.target===s.hpBar?'hp':l.target===s.hudText?'vital':l.target===s.awakeningText?'awakening':null}));},{x,y});}
async function capturePair(name,p=page){
 await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');window.realFocusUpdate=s.updateHudFocus;window.pairPlayerUpdate=s.player.updateEntity;window.pairBossUpdate=s.boss?.updateAI;s.player.updateEntity=()=>{};s.player.setAlpha(1).setVelocity(0,0);if(s.boss){s.boss.updateAI=()=>null;s.boss.setVelocity(0,0);}s.setActorsAnimsPaused(true);s.updateHudFocus=()=>{};s.hudFocus.reset();s.virtual.updateCombatFocus([],1000,false);});
 await p.waitForTimeout(30);await p.screenshot({path:path.join(OUT,`${name}-solid.png`)});
 await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.updateHudFocus=window.realFocusUpdate;});await p.waitForTimeout(140);await p.screenshot({path:path.join(OUT,`${name}-peek.png`)});
 await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.updateEntity=window.pairPlayerUpdate;if(s.boss)s.boss.updateAI=window.pairBossUpdate;});
}
(async()=>{browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.stack));await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 await check('四渲染倍率：底部角色真实投影一致，仅背景让位，生命/冷却仍可读',async()=>{const detail=[];
  for(const scale of [.75,1,1.5,2]){await start();await page.evaluate(scale=>window.__seedDev.applyRenderScale(scale),scale);await place(896,1140,896,1140);
   const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),c=s.cameras.main,p=s.player,z=s.scale.width/1280,rect=p.getBounds();const sx=(c.width/2+(rect.centerX-c.scrollX-c.width/2)*c.zoom)/z,sy=(c.height/2+(rect.centerY-c.scrollY-c.height/2)*c.zoom)/z;const inverse=c.getWorldPoint(sx*z,sy*z);return{scale:z,sx,sy,inverseError:Math.hypot(inverse.x-rect.centerX,inverse.y-rect.centerY),frames:s.abilityRoot.list[0].alpha,cooldown:s.cdBar.alpha,numbers:s.abilityTexts.map(t=>t.alpha),hp:s.hudText.alpha};});
   assert.ok(r.inverseError<1e-5);assert.ok(r.frames<.061);assert.ok(r.cooldown>=.84);assert.ok(r.numbers.every(a=>a>=.89));assert.equal(r.hp,1);assert.ok(r.sx>620&&r.sx<660&&r.sy>600);detail.push(r);if(scale===1)await capturePair('bottom-hero');
  }await page.evaluate(()=>window.__seedDev.applyRenderScale(1));return detail;
 });
 await check('左上生命卡：肖像/实心板让位，生命数字和分段条保留，右侧卡不跟着变淡',async()=>{
  await start();await place(160,96);const left=await region(20,20),right=await region(1024,20);assert.ok(left[0].alpha<.07);assert.ok(left[1].alpha<.13);assert.ok(left.find(l=>l.role==='hp').alpha>=.84);assert.ok(left.find(l=>l.role==='vital').alpha>=.89);assert.ok(right.every(l=>l.alpha===1));await capturePair('vital-hero');return{left,right};
 });
 await check('透明后的暂停按钮真实点击有效；暂停后HUD恢复，不误触攻击',async()=>{
  await start();await place(1218,100);const alpha=await region(1186,76);assert.ok(alpha.find(l=>l.type==='Rectangle').alpha<.12);assert.ok(alpha.find(l=>l.type==='Text').alpha>=.89);const before=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').attackCount);await page.mouse.click(1218,92);await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').paused);await page.waitForTimeout(260);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{paused:s.paused,physics:s.physics.world.isPaused,attacks:s.attackCount,alpha:s.pauseButton.list[0].alpha};});assert.equal(r.attacks,before);assert.equal(r.alpha,1);assert.equal(r.physics,true);await page.keyboard.press('Escape');return r;
 });
 await check('SFX按钮让位不改变命中区，真实静音点击不发起攻击',async()=>{
  await start();await place(962,94);assert.ok((await region(924,79)).find(l=>l.type==='Rectangle').alpha<.12);const before=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{sfx:window.__seedDev.saveSystem.feedback.sfxVolume,attacks:s.attackCount};});await page.mouse.click(962,94);await page.waitForTimeout(90);const after=await page.evaluate(()=>({sfx:window.__seedDev.saveSystem.feedback.sfxVolume,attacks:window.__seedGame.scene.getScene('Run').attackCount}));assert.notEqual(after.sfx,before.sfx);assert.equal(after.attacks,before.attacks);return{before,after};
 });
 await check('Boss完整冠骨触及HUD时，头部/招式/横幅分层让位，不缩小真实身体',async()=>{
  await start();await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.floor=3;s.beginNextFloor();const b=s.boss;b.clock=1e9;b.speed=0;b.setPosition(896,430);b.body.reset(896,430);b.beginRecovery(1e9);s.tweens.killTweensOf(s.bannerText);s.bannerText.setAlpha(1).setText('冠骨崩裂 · 狂生阶段');s.player.setPosition(896,730);s.player.body.reset(896,730);});await page.waitForTimeout(300);
  const header=await region(350,20),banner=await region(300,118);assert.ok(header[0].alpha<.17);assert.ok(header[1].alpha<.25);assert.ok(header[2].alpha>=.49);assert.ok(header[3].alpha>=.64);assert.ok(banner[0].alpha<.13);await capturePair('boss-crown');const body=await page.evaluate(()=>{const b=window.__seedGame.scene.getScene('Run').boss;return{w:b.body.width,h:b.body.height};});assert.ok(Math.abs(body.w-70.4)<.001);assert.ok(Math.abs(body.h-52.8)<.001);return{header,banner,body};
 });
 await check('保护附近敌人/危险弹体，不只保护玩家；离开后有防抖再恢复',async()=>{
  await start();await place(896,940,896,1140);assert.equal((await region(490,595))[0].alpha,1);
  await page.evaluate(async()=>{const s=window.__seedGame.scene.getScene('Run'),{Enemy}=await import('/src/entities/Enemy.ts');const e=new Enemy(s,896,1140,'crawler',1);e.speed=0;s.enemies.add(e);});await page.waitForTimeout(130);assert.ok((await region(490,595))[0].alpha<.06);
   const holdState=await page.evaluate(async()=>{const s=window.__seedGame.scene.getScene('Run'),r=s.hudFocus.regions.find(r=>r.bounds.x===490);const start=performance.now(),before={alpha:r.layers[0].target.alpha,hold:r.peek.hold,amount:r.peek.amount};s.enemies.clear(true,true);await new Promise(resolve=>setTimeout(resolve,120));return{before,alpha:r.layers[0].target.alpha,hold:r.peek.hold,amount:r.peek.amount,elapsed:performance.now()-start};});assert.ok(holdState.alpha<.06,JSON.stringify(holdState));await page.waitForTimeout(420);assert.equal((await region(490,595))[0].alpha,1);
  await place(896,984,896,1140);await page.evaluate(()=>window.__seedGame.scene.getScene('Run').spawnProjectile(896,1140,0,0,1,true,0,10000));await page.waitForTimeout(130);assert.ok((await region(490,595))[0].alpha<.06);return{enemy:true,projectile:true,restored:true,holdState};
 });
 await check('快速越过面板边缘不会闪回实心；三选一期间恢复完整HUD且冷却冻结',async()=>{
  await start();await place(896,1140,896,1140);for(let i=0;i<6;i++){await page.evaluate(y=>{const s=window.__seedGame.scene.getScene('Run');s.player.setPosition(896,y);s.player.body.reset(896,y);},i%2===0?1040:1140);await page.waitForTimeout(45);assert.ok((await region(490,595))[0].alpha<.08);}
  await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.skillTimer=4000;s.openMutationChoice();});const before=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').player.skillTimer);await page.waitForTimeout(300);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{choosing:s.choosing,timer:s.player.skillTimer,frames:s.abilityRoot.list[0].alpha};});assert.equal(r.choosing,true);assert.equal(r.timer,before);assert.equal(r.frames,1);await page.keyboard.press('1');return r;
 });
 await check('连斩/横幅动画保留自己alpha，不与让位争抢；多次重开不积累注册对象',async()=>{
  await start();const count=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').hudFocus.regions.length);await place(640,185);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.chain.count=8;s.chain.remaining=400;s.showBanner('测试横幅',0xffffff);});await page.waitForTimeout(100);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{alpha:s.chainText.alpha,parent:s.chainText.parentContainer.alpha,bar:s.chainBar.parentContainer===s.chainText.parentContainer,banner:s.bannerText.alpha};});assert.ok(r.alpha>0&&r.alpha<1);assert.ok(r.parent<.2);assert.equal(r.bar,true);assert.ok(r.banner>0&&r.banner<=1);await start();assert.equal(await page.evaluate(()=>window.__seedGame.scene.getScene('Run').hudFocus.regions.length),count);return{count,...r};
 });
 await check('触屏透明按钮：边框/文字/冷却保留，攻击拖瞄/技能/摇杆仍真实工作',async()=>{
  const ctx=await browser.newContext({viewport:{width:1280,height:720},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.stack));try{
   await p.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await p.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await start(p);await place(1190,640,640,360,p);
   const cdp=await ctx.newCDPSession(p);const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:6,radiusY:6,force:1}))});
   const r=await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),v=s.virtual,e=v.combatPeeks[0];return{fill:e.outer.fillAlpha,stroke:e.outer.strokeAlpha,text:e.button.list.find(o=>o.type==='Text').alpha,visible:v.isVisible,desktop:s.abilityRoot.visible,radius:e.button.getData('hitRadius')};});assert.ok(r.fill<.12);assert.equal(r.stroke,.65);assert.equal(r.text,1);assert.equal(r.visible,true);assert.equal(r.desktop,false);assert.equal(r.radius,48);
   await touch('touchStart',[[1,1190,630]]);await p.waitForTimeout(80);await touch('touchMove',[[1,1160,630]]);await p.waitForTimeout(80);const aim=await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{held:s.virtual.attackHeld,x:s.virtual.attackAim.x,attacks:s.attackCount};});assert.equal(aim.held,true);assert.ok(aim.x<0);assert.ok(aim.attacks>0);await touch('touchEnd',[]);await p.waitForTimeout(30);assert.equal(await p.evaluate(()=>window.__seedGame.scene.getScene('Run').virtual.attackHeld),false);
   await touch('touchStart',[[2,1105,665]]);await touch('touchEnd',[]);await p.waitForTimeout(60);assert.ok(await p.evaluate(()=>window.__seedGame.scene.getScene('Run').player.cooldownRemaining('skill')>0));
   await place(100,620,640,360,p);await touch('touchStart',[[3,100,620]]);await touch('touchMove',[[3,145,600]]);await p.waitForTimeout(60);const stick=await p.evaluate(()=>{const v=window.__seedGame.scene.getScene('Run').virtual;return{x:v.moveVector.x,y:v.moveVector.y,fill:v.base.fillAlpha,stroke:v.base.strokeAlpha};});assert.ok(stick.x>0&&stick.y<0);assert.ok(stick.fill<.12);assert.equal(stick.stroke,.65);await touch('touchEnd',[]);
   await place(1190,640,640,360,p);await capturePair('touch-hero',p);return{button:r,aim,stick};
  }finally{await ctx.close();}
 });
 await check('触屏旋屏与暂停所有权：竖屏隐藏操作，横屏恢复后再次自动让位',async()=>{
  const ctx=await browser.newContext({viewport:{width:1280,height:720},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'}),p=await ctx.newPage();try{await p.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await p.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await start(p);await place(1190,640,640,360,p);await p.setViewportSize({width:720,height:1280});await p.waitForFunction(()=>window.__seedGame.scene.getScene('Run').pausedByPortrait);assert.equal(await p.evaluate(()=>window.__seedGame.scene.getScene('Run').virtual.isVisible),false);await p.setViewportSize({width:1280,height:720});await p.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').paused);await place(1190,640,640,360,p);const r=await p.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{visible:s.virtual.isVisible,fill:s.virtual.combatPeeks[0].outer.fillAlpha};});assert.equal(r.visible,true);assert.ok(r.fill<.12);return r;}finally{await ctx.close();}
 });
 await check('窄窗/超宽留黑布局：让位投影稳定，按CSS画布坐标真实点击暂停',async()=>{
  const detail=[];try{for(const [width,height] of [[960,540],[1920,800],[1280,900]]){
   await page.setViewportSize({width,height});await start();await place(1218,100);
   assert.ok((await region(1186,76)).find(l=>l.type==='Rectangle').alpha<.12);
   const canvas=await page.locator('canvas').boundingBox();assert.ok(canvas);await page.mouse.click(canvas.x+1218*canvas.width/1280,canvas.y+92*canvas.height/720);await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').paused);detail.push({width,height,canvas});await page.keyboard.press('Escape');
  }}finally{await page.setViewportSize({width:1280,height:720});}return detail;
 });
 await check('底板让位后仍有文字对比度：生命/计时/冷却/破绽/按钮采用深色描边',async()=>{
  await start();const styles=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return [s.hudText,s.elapsedText,s.floorProgressText,s.bossCueText,...s.abilityTexts,...s.pauseButton.list.filter(o=>o.type==='Text'),...s.soundButton.list.filter(o=>o.type==='Text'),...s.virtual.combatPeeks.map(e=>e.button.list.find(o=>o.type==='Text'))].map(t=>({text:t.text,stroke:t.style.stroke,thickness:t.style.strokeThickness}));});assert.ok(styles.every(s=>s.stroke==='#070a10'&&s.thickness>=2));return styles;
 });
 await check('浏览器运行时无异常',()=>assert.deepEqual(errors,[]));
 }finally{fs.writeFileSync(path.join(OUT,'browser-checks.json'),JSON.stringify({date:new Date().toISOString(),checks,errors,scope:'Isolated UI/mechanism fixtures, not natural playthroughs. Solid/peek pairs freeze actor pose/position; only HUD focus differs between captures.'},null,2));await browser.close();}
 console.log(`HUD browser: ${checks.length}/${checks.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
