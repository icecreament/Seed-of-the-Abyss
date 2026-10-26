'use strict';
// Fresh-save, natural-speed combat. Inputs only: aim, hold attack, context-sensitive Q/dash/retreat.
// No time-scale changes, entity teleporting, stat buffs, spawn edits or direct damage calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve(process.env.SEED_FIRST_FLOOR_OUTPUT||path.resolve(__dirname,'../output/feel-v1/playtests'));fs.mkdirSync(OUT,{recursive:true});const results=[],errors=[];
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
for(const id of ['warden','reaver','shade','thorn']){
 const ctx=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN'});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.stack));const pressed=new Set();let last,firstHit=null,firstKill=null,firstRetreatAt=null;
 try{
  await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await page.evaluate(id=>{window.__seedDev.saveSystem.setSelectedClass(id);window.__seedDev.saveSystem.setLanguage('zh');window.__seedGame.scene.stop('Menu');window.__seedGame.scene.start('Run');},id);await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s?.player?.classId===id&&s.sys.isActive()&&s.cameras.main.fadeEffect.alpha===0;},id);
  const initial=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');window.frameTimes=[];window.contactEvents=[];window.enemyKindsSeen=new Set();const touch=s.onPlayerTouchEnemy.bind(s);s.onPlayerTouchEnemy=e=>{const before=s.player.stats.hp;touch(e);if(s.player.stats.hp<before)window.contactEvents.push({time:s.timeAlive,kind:e.kind,damage:before-s.player.stats.hp,hp:s.player.stats.hp,moving:s.player.moveIntent.lengthSq()>0.01});};let prior=performance.now();function track(now){window.frameTimes.push(now-prior);prior=now;requestAnimationFrame(track);}requestAnimationFrame(track);return{hp:s.player.stats.hp,maxHp:s.player.stats.maxHp,damage:s.player.stats.damage,seed:window.__seedDev.saveSystem.seedStage};});assert.equal(initial.seed,1);
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').audio.state==='running');
  await page.evaluate(()=>{
    const stream=document.querySelector('canvas').captureStream(30),audio=window.__seedGame.scene.getScene('Run').audio;
    const dest=audio.context.createMediaStreamDestination();audio.limiter.connect(dest);for(const track of dest.stream.getAudioTracks())stream.addTrack(track);
    window.captureChunks=[];window.captureRecorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:1800000});
    window.captureRecorder.ondataavailable=e=>{if(e.data.size)window.captureChunks.push(e.data);};window.captureRecorder.start(1000);
  });
  const begin=Date.now(),deadline=begin+42000;
  while(Date.now()<deadline){
   last=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,c=s.cameras.main;
    const all=s.enemies.getChildren().filter(e=>e.isTargetable).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));const e=all.find(e=>s.navigation.clearLine(p.x,p.y,e.x,e.y))||all[0];const near=all[0],dx=near?near.x-p.x:0,dy=near?near.y-p.y:0,len=Math.hypot(dx,dy)||1;
    for(const enemy of all)window.enemyKindsSeen.add(enemy.kind);
    const retreat=s.navigation.clearLine(p.x,p.y,p.x-dx/len*80,p.y-dy/len*80);
    return{ended:s.ended,choosing:s.choosing,floor:s.floor,kills:s.kills,hp:p.stats.hp,maxHp:p.stats.maxHp,damage:s.damageDealt,time:s.timeAlive,skill:p.skillReady,dash:p.dashReady,near:near?Math.hypot(dx,dy):9999,dx,dy,retreat,aimX:e?Math.max(2,Math.min(1278,e.x-c.scrollX)):640,aimY:e?Math.max(2,Math.min(718,e.y-c.scrollY)):360,chain:s.chain.best};});
   const elapsed=(Date.now()-begin)/1000;if(last.damage>0&&firstHit===null)firstHit=elapsed;if(last.kills>0&&firstKill===null)firstKill=elapsed;
   if(last.ended||last.choosing)break;
   await page.mouse.move(last.aimX,last.aimY);
   const keys=new Set();if(last.hp<last.maxHp*0.65&&last.near<75&&last.retreat){if(Math.abs(last.dx)>12)keys.add(last.dx>0?'a':'d');if(Math.abs(last.dy)>12)keys.add(last.dy>0?'w':'s');}
   if(keys.size&&firstRetreatAt===null)firstRetreatAt=last.time;
   for(const key of pressed)if(!keys.has(key)){await page.keyboard.up(key);pressed.delete(key);}for(const key of keys)if(!pressed.has(key)){await page.keyboard.down(key);pressed.add(key);}
   if(last.skill&&last.near<(id==='shade'?160:118))await page.keyboard.press('q');
   if(last.hp<last.maxHp*0.5&&last.near<42&&last.dash&&keys.size)await page.keyboard.press('Shift');
   await page.waitForTimeout(75);
  }
  await page.keyboard.up('Space');for(const key of pressed)await page.keyboard.up(key);await page.screenshot({path:path.join(OUT,`${id}-natural.png`)});
  const timing=await page.evaluate(()=>{const t=window.frameTimes.filter(v=>v>0).sort((a,b)=>a-b);return{frames:t.length,p95:t[Math.floor(t.length*0.95)],max:t[t.length-1]};});
  const diagnostic=await page.evaluate(()=>({contactEvents:window.contactEvents,enemyKinds:[...window.enemyKindsSeen],ranged:{...window.__seedGame.scene.getScene('Run').rangedStats}}));
  const result={id,initial,firstHit,firstKill,firstRetreatAt,...last,timing,diagnostic};results.push(result);console.log(JSON.stringify(result));
  assert.deepEqual(diagnostic.enemyKinds,['crawler']);assert.equal(diagnostic.ranged.shots,0);
  assert.ok(!last.ended,`${id}: fresh player died`);assert.ok(last.choosing&&last.kills>=12,`${id}: did not clear by kills`);assert.ok(firstHit!==null&&firstHit<8,`${id}: waiting too long to fight`);
 }finally{
  const data=await page.evaluate(async()=>{
    const rec=window.captureRecorder;if(!rec||rec.state==='inactive')return null;
    return await new Promise(resolve=>{rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(new Blob(window.captureChunks,{type:'video/webm'}));};rec.stop();});
  }).catch(()=>null);
  if(data)fs.writeFileSync(path.join(OUT,`${id}-natural.webm`),Buffer.from(data,'base64'));
  await ctx.close();
 }
}
assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(OUT,'natural-checks.json'),JSON.stringify({date:new Date().toISOString(),results,errors,scope:'First floor only, fresh permanent stats, real time and real inputs. This does not certify whole-chapter balance or subjective fun.'},null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
