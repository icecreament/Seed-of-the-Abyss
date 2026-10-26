'use strict';
// Full chapter, fresh saves, normal clock. The controller only reads game state;
// gameplay actions are real keyboard/mouse inputs, including all three mutations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve(process.env.SEED_GUARD_CUE_PLAY_OUTPUT||'output/warden-guard-cue-v1/route-natural');
fs.mkdirSync(OUT,{recursive:true});
const results=[],errors=[];
const classes=['warden'];

// NEW, separately declared cue-aware input policy, not the canonical controller.
// On an actual visible ready/hold cue with no earned pressure: stand still, do not dash,
// and cast Q only for a ready cue. No melee-distance Q fallback. Otherwise use the
// previous Warden controller, including its release/re-press counter policy.
// No direct movement, damage, timers, spawn, or stat writes.
function observeAndPlan(id){
 const s=window.__seedGame.scene.getScene('Run'),p=s.player,c=s.cameras.main;
 const result=window.__seedDev.runState.lastRun;
 if(s.ended||!s.sys.isActive())return {ended:true,result};
 if(s.choosing)return{choosing:true,floor:s.floor,kills:s.kills,hp:p.stats.hp,time:s.timeAlive,choices:s.choices.map(m=>({id:m.id,owner:m.owner})),owned:[...s.build.owned]};
 const all=s.enemies.getChildren().filter(e=>e.isTargetable).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
 const target=all.find(e=>s.navigation.clearLine(p.x,p.y,e.x,e.y))||all[0];
 const boss=s.boss,dist=target?Math.hypot(target.x-p.x,target.y-p.y):9999;
 const dx=target?target.x-p.x:0,dy=target?target.y-p.y:0;
 const ranged=id==='thorn',ideal=boss?(ranged?210:92):(ranged?180:Math.max(42,p.stats.attackRange+4));
 const walls=s.wallRects;
 const offsets={left:p.body.left-p.x,right:p.body.right-p.x,top:p.body.top-p.y,bottom:p.body.bottom-p.y};
 const free=(x,y)=>!walls.some(r=>x+offsets.right+3>r.x&&x+offsets.left-3<r.right&&y+offsets.bottom+3>r.y&&y+offsets.top-3<r.bottom);
 let goal=target?{x:target.x,y:target.y}:{x:p.x,y:p.y};
 // Read-only, independent coarse BFS to approach targets around pillars.
 if(target&&!s.navigation.clearLine(p.x,p.y,goal.x,goal.y)){
  const tile=32,cols=Math.ceil(s.mapW/tile),rows=Math.ceil(s.mapH/tile),start=Math.floor(p.y/tile)*cols+Math.floor(p.x/tile),end=Math.floor(goal.y/tile)*cols+Math.floor(goal.x/tile);
  const queue=[start],previous=new Map([[start,-1]]);let found=-1;
  for(let at=0;at<queue.length&&at<cols*rows;at++){
   const index=queue[at],x=index%cols,y=Math.floor(index/cols);
   if(index===end||Math.hypot((x+.5)*tile-goal.x,(y+.5)*tile-goal.y)<45){found=index;break;}
   for(const [ox,oy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+ox,ny=y+oy,next=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||previous.has(next)||!free((nx+.5)*tile,(ny+.5)*tile))continue;previous.set(next,index);queue.push(next);}
  }
  if(found>=0){while(previous.get(found)!==start&&previous.get(found)!==-1)found=previous.get(found);goal={x:(found%cols+.5)*tile,y:(Math.floor(found/cols)+.5)*tile};}
 }
 const hazards=[...(boss?.hazards||[]),...all.map(e=>e.eliteTelegraph).filter(Boolean)],shots=s.projectiles.filter(p=>p.fromEnemy);
 const score=(mx,my)=>{
  const len=Math.hypot(mx,my)||1,vx=mx/len*p.stats.speed,vy=my/len*p.stats.speed;
  let score=0;
  for(const t of [.08,.18,.3]){
   const x=p.x+vx*t,y=p.y+vy*t;
   if(!free(x,y))return 1e8;
   const d=target?Math.hypot(x-target.x,y-target.y):0;
   score+=(goal.x===target?.x&&goal.y===target?.y?Math.abs(d-ideal):Math.hypot(x-goal.x,y-goal.y))*(t===.3?1:.15);
   for(const enemy of all){const ex=enemy.x+(enemy.body?.velocity.x||0)*t,ey=enemy.y+(enemy.body?.velocity.y||0)*t,space=boss&&enemy===boss?79:39,ed=Math.hypot(x-ex,y-ey);score+=Math.max(0,space-ed)**2*.7;}
   for(const h of hazards){
    if(h.fired||h.age+t*1000<h.windup-600)continue;
    const weight=3+10*Math.min(1,(h.age+t*1000)/h.windup);
    if(h.kind==='circle')score+=Math.max(0,h.radius+23-Math.hypot(x-h.x,y-h.y))*weight;
    else{const along=(x-h.x)*h.dx+(y-h.y)*h.dy,cross=Math.abs((x-h.x)*-h.dy+(y-h.y)*h.dx);if(along>-40&&along<h.length+25)score+=Math.max(0,h.radius+26-cross)*weight;}
   }
   for(const shot of shots){const d=Math.hypot(x-shot.sprite.x-shot.vx*t,y-shot.sprite.y-shot.vy*t);score+=Math.max(0,32-d)*10;}
  }
  if(mx||my)score+=1.5;
  return score;
 };
 const moves=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].map(([mx,my])=>({mx,my,score:score(mx,my)})).sort((a,b)=>a.score-b.score);
 const best=moves[0];
 const dangerous=moves.find(m=>m.mx===0&&m.my===0).score-best.score>180;
 const aimLead=ranged&&target?Math.min(.3,dist/480):0;
 const aimX=target?target.x+(target.body?.velocity.x||0)*aimLead:p.x+50;
 const aimY=target?target.y+(target.body?.velocity.y||0)*aimLead:p.y;
 // Dash only into verified free space. Q for Shade should approach, not flee.
 const ml=Math.hypot(best.mx,best.my)||1,landX=p.x+best.mx/ml*112,landY=p.y+best.my/ml*112;
 const dash=!!(dangerous&&p.dashReady&&(best.mx||best.my)&&free(landX,landY)&&free((p.x+landX)/2,(p.y+landY)/2));
 const approaching=(best.mx*dx+best.my*dy)>=0;
 const cue=s.guardCue;
 const brace=!!(cue&&s.combat.guardOpportunity.visible&&s.pursuitText.visible&&s.pursuitText.alpha>0&&s.pursuitText.text&&p.reprisalDamage===0&&(cue.stage==='ready'||cue.stage==='hold'));
 const skill=!!(brace&&cue.stage==='ready'&&p.skillReady);
 const holdAttack=!(p.reprisalDamage>0&&!p.isDashing);
 const counter=!!(p.reprisalDamage>0&&!p.isDashing&&p.cooldownRemaining('attack')<140&&target&&dist<=p.stats.attackRange+target.hitRadius&&s.navigation.clearLine(p.x,p.y,target.x,target.y));
 return{brace,guardCue:brace?{...cue,text:s.pursuitText.text}:null,holdAttack,counter,reprisal:p.reprisalDamage,ended:false,choosing:false,floor:s.floor,kills:s.kills,floorKills:s.floorKills,hp:p.stats.hp,maxHp:p.stats.maxHp,time:s.timeAlive,damage:s.damageDealt,chain:s.chain.best,x:p.x,y:p.y,dist,boss:boss?{hp:boss.hp,maxHp:boss.maxHp,phase:boss.phase,x:boss.x,y:boss.y,telegraphs:boss.activeTelegraphs,exposed:boss.isExposed,cue:boss.actionCue}:null,owned:[...s.build.owned],appearance:{awake:p.isAwakened,hero:p.texture.key,portrait:s.heroPortrait.texture.key,releaseRemaining:p.wardenReleaseRemaining,releaseDuration:p.wardenReleaseDuration,releaseFrame:p.frame.name,releaseHurt:p.hitFlashTimer},ranged:{...s.rangedStats},rangedEnemies:all.filter(e=>e.rangedTelegraph).map(e=>({x:e.x,y:e.y,tell:e.rangedTelegraph})),elite:{...s.eliteStats},eliteEnemies:all.filter(e=>e.isBreakableElite).map(e=>({x:e.x,y:e.y,hp:e.hp,phase:e.duel.phase,remaining:e.duel.remaining,pressure:e.duel.pressure,threshold:e.duel.threshold})),aimX:Math.max(2,Math.min(1278,aimX-c.scrollX)),aimY:Math.max(2,Math.min(718,aimY-c.scrollY)),mx:brace?0:best.mx,my:brace?0:best.my,dash:brace?false:dash,skill};
}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const id of classes){
  const ctx=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN'}),page=await ctx.newPage(),pressed=new Set(),events=[];
  let last,lastActive,initial,lastFloor=0,lastLog=0,bossStarted=null,dashes=0,skills=0,firstHit=null,combatStart=0,lastBossCue=null,lastElite='',lastRanged='';
  const begin=Date.now();
  page.on('pageerror',e=>errors.push({id,error:e.stack}));
  try{
   await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');
   await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
   await page.evaluate(id=>{window.__seedDev.saveSystem.setSelectedClass(id);window.__seedDev.saveSystem.setLanguage('zh');window.__seedGame.scene.stop('Menu');window.__seedGame.scene.start('Run');},id);
   await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s?.player?.classId===id&&s.sys.isActive()&&s.cameras.main.fadeEffect.alpha===0;},id);
   // Read-only provenance. Every wrapper calls the original exactly once and returns
   // its result. Never alter damage, timers, collision, target choice or input policy.
   await page.evaluate(async()=>{
    const s=window.__seedGame.scene.getScene('Run'),p=s.player;
    window.damageEvents=[];window.contactRecoveries=[];window.reprisalEvents=[];window.guardCueEvents=[];let contact=null;
    let cueKey='';const updateCue=s.updatePursuitCue.bind(s);
    s.updatePursuitCue=(...a)=>{const result=updateCue(...a),cue=s.guardCue;
     const visible=!!(cue&&s.combat.guardOpportunity.visible&&s.pursuitText.visible&&s.pursuitText.alpha>0&&s.pursuitText.text);
     const key=visible?cue.stage+':'+cue.kind:'';
     if(key!==cueKey){window.guardCueEvents.push({event:visible?'cue':'hidden',time:s.timeAlive,floor:s.floor,stage:visible?cue.stage:null,kind:visible?cue.kind:null,eta:visible?cue.eta:null,text:visible?s.pursuitText.text:'',hp:p.stats.hp,pressure:p.reprisalDamage,bulwark:p.hasBulwark,x:p.x,y:p.y});cueKey=key;}
     return result;};
    let currentReprisal=0;
    const attack=p.tryAttack.bind(p),swing=s.tryPlayerAttack.bind(s),hit=s.hitEnemy.bind(s);
    s.tryPlayerAttack=(...a)=>{const before=currentReprisal;currentReprisal=0;try{return swing(...a);}finally{currentReprisal=before;}};
    p.tryAttack=(...a)=>{const result=attack(...a);currentReprisal=result?.reprisal||0;if(currentReprisal)window.reprisalEvents.push({event:'swing',time:s.timeAlive,floor:s.floor,bonus:currentReprisal,damage:result.damage});return result;};
    s.hitEnemy=(enemy,...a)=>{const before=enemy.hp;const result=hit(enemy,...a);if(currentReprisal&&a[6]===true&&enemy.hp<before)window.reprisalEvents.push({event:'hit',time:s.timeAlive,floor:s.floor,bonus:currentReprisal,kind:enemy.kind,damage:Math.min(before,before-enemy.hp)});return result;};
    const touch=s.onPlayerTouchEnemy.bind(s);
    // Observe the actual scene instance, not a separately imported module prototype:
    // Vite HMR query URLs can make those different constructors with identical code.
    s.onPlayerTouchEnemy=e=>{const previous=contact,before=e.contactRecoveryRemaining;contact=e;try{const result=touch(e);if(e.contactRecoveryRemaining>before)window.contactRecoveries.push({time:s.timeAlive,floor:s.floor,kind:e.kind,elite:e.elite,remaining:e.contactRecoveryRemaining,x:e.x,y:e.y});return result;}finally{contact=previous;}};
    const damage=p.applyDamage.bind(p);
    p.applyDamage=amount=>{
     const before={reprisal:p.reprisalDamage,bulwark:p.hasBulwark,hp:p.stats.hp,x:p.x,y:p.y,moving:Math.hypot(p.body.velocity.x,p.body.velocity.y)>5,dashing:p.isDashing,stealthed:p.isStealthed,attackRemaining:p.cooldownRemaining('attack'),dashRemaining:p.cooldownRemaining('dash'),skillRemaining:p.cooldownRemaining('skill')};
     const stack=new Error().stack||'',dealt=damage(amount);
     if(dealt>0){
      if(p.reprisalDamage>before.reprisal)window.reprisalEvents.push({event:'guard',time:s.timeAlive,floor:s.floor,requested:amount,dealt,gained:p.reprisalDamage-before.reprisal,pressure:p.reprisalDamage,hp:p.stats.hp});
      const enemy=e=>({kind:e.kind,elite:e.elite,hp:e.hp,x:e.x,y:e.y,distance:Math.hypot(e.x-p.x,e.y-p.y),phase:e.duel?.phase,canContact:e.canDealContactDamage});
      const nearby=s.enemies.getChildren().filter(e=>e.isTargetable).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).slice(0,5).map(enemy);
      const type=contact?'contact':stack.includes('updateProjectiles')?'projectile':stack.includes('consumeEliteEvents')?'elite-slam':stack.includes('ChapterBoss')||stack.includes('Object.hurt')?'boss-pattern':'other';
      window.damageEvents.push({time:s.timeAlive,floor:s.floor,type,requested:amount,dealt,hpAfter:p.stats.hp,before,enemy:contact?enemy(contact):null,nearby,stack:stack.split('\n').slice(1,6),ranged:{...s.rangedStats}});
     }
     return dealt;
    };
   });
   initial=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{hp:s.player.stats.hp,maxHp:s.player.stats.maxHp,damage:s.player.stats.damage,seed:window.__seedDev.saveSystem.seedStage};});
   assert.equal(initial.seed,1);
   combatStart=Date.now();
   await page.keyboard.down('Space');
   if(process.env.SEED_RECORD!=='0')await page.evaluate(()=>{
    const stream=document.querySelector('canvas').captureStream(24),audio=window.__seedGame.scene.getScene('Run').audio,dest=audio.context.createMediaStreamDestination();audio.limiter.connect(dest);for(const track of dest.stream.getAudioTracks())stream.addTrack(track);
    window.chapterChunks=[];window.chapterRecorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:1200000});window.chapterRecorder.ondataavailable=e=>{if(e.data.size)window.chapterChunks.push(e.data);};window.chapterRecorder.start(1000);
   });
   while(Date.now()-begin<Number(process.env.SEED_PLAY_DEADLINE_MS||300000)){
    last=await page.evaluate(observeAndPlan,id);
    if(last.ended)break;
    if(!last.choosing){
     lastActive=last;
     if(last.eliteEnemies.length&&!events.some(e=>e.type==='elite-seen')){
      events.push({type:'elite-seen',time:last.time,floor:last.floor,enemies:last.eliteEnemies});
      await page.screenshot({path:path.join(OUT,`${id}-natural-elite.png`)});
     }
     const rangedKey=JSON.stringify(last.ranged);
     if(last.rangedEnemies.length&&!events.some(e=>e.type==='ranged-seen')){
      events.push({type:'ranged-seen',time:last.time,floor:last.floor,enemies:last.rangedEnemies});
      await page.screenshot({path:path.join(OUT,`${id}-natural-ranged.png`)});
     }
     if(rangedKey!==lastRanged){
      if(lastRanged)events.push({type:'ranged-action',time:last.time,...last.ranged});
      lastRanged=rangedKey;
      if(last.ranged.interrupted>0)await page.screenshot({path:path.join(OUT,`${id}-natural-interrupt.png`)});
     }
     const eliteKey=JSON.stringify(last.elite);
     if(eliteKey!==lastElite){
      if(lastElite)events.push({type:'elite-action',time:last.time,...last.elite});
      lastElite=eliteKey;
      if(last.elite.breaks>0)await page.screenshot({path:path.join(OUT,`${id}-natural-break.png`)});
     }
     const trigger={warden:'warden_thorns',reaver:'reaver_cleave',shade:'shade_ambush',thorn:'thorn_seeds'}[id];
     const awakened=last.owned.includes(trigger),suffix=awakened?'_awakened':'';
     assert.equal(last.appearance.awake,awakened,`${id}: mutation/form mismatch`);
     if(id==='warden' && last.appearance.releaseRemaining>0){
    const a=last.appearance;
    assert.ok(Number.isFinite(a.releaseDuration)&&a.releaseDuration>0&&a.releaseDuration<=250);
    assert.ok(a.releaseRemaining<=a.releaseDuration);
    if(a.releaseHurt>0){
     assert.equal(a.hero,`hero_${id}${suffix}`);assert.equal(Number(a.releaseFrame),13);
    }else{
     assert.equal(a.hero,`strike_warden_reprisal${suffix}`);
     assert.equal(Number(a.releaseFrame),Math.min(3,Math.floor((a.releaseDuration-a.releaseRemaining)*4/a.releaseDuration)));
    }
   }else assert.equal(last.appearance.hero,`hero_${id}${suffix}`);
     assert.equal(last.appearance.portrait,`portrait_${id}${suffix}`);
     if(awakened&&!events.some(e=>e.type==='awakening')){
      events.push({type:'awakening',time:last.time,floor:last.floor,...last.appearance});
      await page.screenshot({path:path.join(OUT,`${id}-natural-awakening.png`)});
     }
    }
    if(last.damage>0&&firstHit===null)firstHit=(Date.now()-combatStart)/1000;
    if(last.floor!==lastFloor){lastFloor=last.floor;events.push({type:'floor',...last,wallTime:(Date.now()-begin)/1000});console.log(id,'FLOOR',JSON.stringify(events.at(-1)));await page.screenshot({path:path.join(OUT,`${id}-floor-${last.floor}.png`)});}
    if(last.boss&&!bossStarted)bossStarted=last.time;
    if(last.boss&&last.boss.cue!==lastBossCue){
     lastBossCue=last.boss.cue;events.push({type:'boss-cue',cue:lastBossCue,time:last.time,bossHp:last.boss.hp,hp:last.hp});
     if(lastBossCue==='exposed')await page.screenshot({path:path.join(OUT,`${id}-natural-exposed.png`)});
    }
    if(last.choosing){
     await page.keyboard.up('Space');for(const key of pressed)await page.keyboard.up(key);pressed.clear();
     const priority=[...(process.env.SEED_BUILD_STYLE==='class'?[]:['shared_feast']),`${id}_thorns`,`${id}_cleave`,`${id}_ambush`,`${id}_fork`,`${id}_ram`,`${id}_bleed`,`${id}_decoy`,`${id}_seeds`,'shared_haste','shared_dash','shared_spite','shared_feast'];
     const choice=last.choices.map((m,index)=>({...m,index,rank:priority.indexOf(m.id)})).sort((a,b)=>a.rank-b.rank)[0];
     events.push({type:'mutation',...choice,hp:last.hp,time:last.time});console.log(id,'MUTATION',choice.id);
     await page.waitForTimeout(350);await page.keyboard.press(String(choice.index+1));await page.keyboard.down('Space');continue;
    }
    if(Date.now()-lastLog>15000){lastLog=Date.now();console.log(id,'PLAY',JSON.stringify(last));}
    await page.mouse.move(last.aimX,last.aimY);
    const keys=new Set();if(last.mx)keys.add(last.mx>0?'d':'a');if(last.my)keys.add(last.my>0?'s':'w');
    for(const key of pressed)if(!keys.has(key)){await page.keyboard.up(key);pressed.delete(key);}for(const key of keys)if(!pressed.has(key)){await page.keyboard.down(key);pressed.add(key);}
    // Separate cue-aware policy: brace overrides movement/dash/Q only; existing fresh-press and offer priorities remain unchanged.
    if(!last.holdAttack)await page.keyboard.up('Space');
    if(last.counter)await page.keyboard.down('Space');else if(last.holdAttack)await page.keyboard.down('Space');
    if(last.dash){await page.keyboard.press('Shift');dashes++;}if(last.skill){await page.keyboard.press('q');skills++;}
    await page.waitForTimeout(90);
   }
   await page.keyboard.up('Space');for(const key of pressed)await page.keyboard.up(key);
   await page.screenshot({path:path.join(OUT,`${id}-ending.png`)});
   const {damageEvents,contactRecoveries,reprisalEvents,guardCueEvents}=await page.evaluate(()=>({damageEvents:window.damageEvents,contactRecoveries:window.contactRecoveries,reprisalEvents:window.reprisalEvents,guardCueEvents:window.guardCueEvents}));
   const result={guardCueEvents,reprisalEvents,id,initial,firstHit,bossStarted,dashes,skills,damageEvents,contactRecoveries,lastActive,buildStyle:process.env.SEED_BUILD_STYLE||'survival',wallTime:(Date.now()-begin)/1000,events,last};results.push(result);console.log(id,'RESULT',JSON.stringify(result));
  }catch(error){errors.push({id,error:String(error.stack)});await page.screenshot({path:path.join(OUT,`${id}-error.png`)}).catch(()=>{});}
  finally{
   const data=await page.evaluate(async()=>{const rec=window.chapterRecorder;if(!rec||rec.state==='inactive')return null;return await new Promise(resolve=>{rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(new Blob(window.chapterChunks,{type:'video/webm'}));};rec.stop();});}).catch(()=>null);
   if(data)fs.writeFileSync(path.join(OUT,`${id}-chapter.webm`),Buffer.from(data,'base64'));
   await ctx.close();fs.writeFileSync(path.join(OUT,'chapter-playchecks.json'),JSON.stringify({date:new Date().toISOString(),results,errors,scope:'NEW separate cue-aware Warden input-only route: actual visible ready/hold cue without paid pressure stops movement and suppresses dash; Q is reserved for ready cues, with no melee-distance fallback. On cue loss resume original movement/dash. Existing release/fresh-press counter and real offer priorities retained. Read-only observation wrappers forward original once. No drops, damage, positions, stats, spawn or clock writes. Requires visible ready+hold, accepted guard, spent swing and actual basic hit as well as victory/mutations/awakening/elite. One sample per declared policy, no retry. Not pooled with canonical/old Warden routes; not human discoverability, fun or balance proof.'},null,2));
  }
 }}finally{await browser.close();}
 assert.deepEqual(errors,[]);
 for(const id of classes){const r=results.find(r=>r.id===id);assert.ok(r?.last.ended,`${id}: timeout`);assert.equal(r.last.result?.outcome,'victory',`${id}: not a victory`);assert.equal(r.last.result?.mutations.length,3);assert.ok(r.events.some(e=>e.type==='awakening'),`${id}: awakening was not naturally exercised`);assert.ok(r.events.some(e=>e.type==='elite-seen'),`${id}: elite was not naturally exercised`);}
 for(const r of results){for(const stage of ['ready','hold'])assert.ok(r.guardCueEvents.some(e=>e.event==='cue'&&e.stage===stage&&e.text),`No natural visible guard cue ${stage}`);}
 for(const r of results){for(const event of ['guard','swing','hit'])assert.ok(r.reprisalEvents.some(e=>e.event===event),`No natural reprisal ${event}`);}
 console.log(`Warden cue-aware route: ${results.length}/${classes.length} victories`);
})().catch(e=>{console.error(e);process.exitCode=1;});
