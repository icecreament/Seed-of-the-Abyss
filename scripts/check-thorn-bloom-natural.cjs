'use strict';
// Full chapter, fresh saves, normal clock. The controller only reads game state;
// gameplay actions are real keyboard/mouse inputs, including all three mutations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve(process.env.SEED_BLOOM_PLAY_OUTPUT||'output/thorn-bloom-v1/natural');
fs.mkdirSync(OUT,{recursive:true});
const results=[],errors=[];
const classes=['thorn'];

// Pure input policy. No direct movement, damage, timers, spawn, or stat writes.
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
 const skill=p.skillReady&&!!target&&(id==='shade'?dist<190&&approaching:dist<(ranged?115:126));
 return{ended:false,choosing:false,floor:s.floor,kills:s.kills,floorKills:s.floorKills,hp:p.stats.hp,maxHp:p.stats.maxHp,time:s.timeAlive,damage:s.damageDealt,chain:s.chain.best,x:p.x,y:p.y,dist,boss:boss?{hp:boss.hp,maxHp:boss.maxHp,phase:boss.phase,x:boss.x,y:boss.y,telegraphs:boss.activeTelegraphs,exposed:boss.isExposed,cue:boss.actionCue}:null,owned:[...s.build.owned],appearance:{awake:p.isAwakened,hero:p.texture.key,portrait:s.heroPortrait.texture.key,castRemaining:p.bloomCast.remaining,castFrame:p.frame.name},ranged:{...s.rangedStats},rangedEnemies:all.filter(e=>e.rangedTelegraph).map(e=>({x:e.x,y:e.y,tell:e.rangedTelegraph})),elite:{...s.eliteStats},eliteEnemies:all.filter(e=>e.isBreakableElite).map(e=>({x:e.x,y:e.y,hp:e.hp,phase:e.duel.phase,remaining:e.duel.remaining,pressure:e.duel.pressure,threshold:e.duel.threshold})),aimX:Math.max(2,Math.min(1278,aimX-c.scrollX)),aimY:Math.max(2,Math.min(718,aimY-c.scrollY)),mx:best.mx,my:best.my,dash,skill};
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
    window.damageEvents=[];window.contactRecoveries=[];window.bloomNaturalEvents=[];let contact=null;
    // Read-only native-pose provenance; this does not choose or inject inputs.
    let castState='';
    const recordCast=()=>{
     const texture=p.texture.key,state=texture==='cast_thorn_bloom'||texture==='cast_thorn_bloom_awakened'?`${texture}:${p.frame.name}`:'';
     if(state&&state!==castState)window.bloomNaturalEvents.push({event:'cast-visible',time:s.timeAlive,floor:s.floor,texture,frame:p.frame.name,remaining:p.bloomCast.remaining});
     castState=state;
    };
    s.game.events.on('postrender',recordCast);
    s.events.once('shutdown',()=>s.game.events.off('postrender',recordCast));
    let novaSeeds;
    const hit=s.hitEnemy.bind(s),nova=s.fireNova.bind(s);
    s.fireNova=(...args)=>{
     const previous=novaSeeds;novaSeeds=new Map([...s.marks].filter(([e,m])=>e.isAlive&&m.seeds>0).map(([e,m])=>[e,m.seeds]));
     window.bloomNaturalEvents.push({event:'nova',time:s.timeAlive,floor:s.floor,targets:novaSeeds.size,ripe:[...novaSeeds.values()].filter(n=>n===3).length});
     try{return nova(...args);}finally{novaSeeds=previous;}
    };
    s.hitEnemy=(e,...args)=>{
     const before=s.marks.get(e)?.seeds||0,hp=e.hp,result=hit(e,...args),after=s.marks.get(e)?.seeds||0;
     if(args[6]===true&&after>before)window.bloomNaturalEvents.push({event:'plant',time:s.timeAlive,floor:s.floor,seeds:after,ripe:after===3,kind:e.kind});
     if(novaSeeds?.has(e)&&!args[6]&&args[4]===0&&args[5]===0&&e.hp<hp)window.bloomNaturalEvents.push({event:'detonate',time:s.timeAlive,floor:s.floor,seeds:novaSeeds.get(e),damage:hp-e.hp,kind:e.kind});
     return result;
    };
    const touch=s.onPlayerTouchEnemy.bind(s);
    // Observe the actual scene instance, not a separately imported module prototype:
    // Vite HMR query URLs can make those different constructors with identical code.
    s.onPlayerTouchEnemy=e=>{const previous=contact,before=e.contactRecoveryRemaining;contact=e;try{const result=touch(e);if(e.contactRecoveryRemaining>before)window.contactRecoveries.push({time:s.timeAlive,floor:s.floor,kind:e.kind,elite:e.elite,remaining:e.contactRecoveryRemaining,x:e.x,y:e.y});return result;}finally{contact=previous;}};
    const damage=p.applyDamage.bind(p);
    p.applyDamage=amount=>{
     const before={hp:p.stats.hp,x:p.x,y:p.y,moving:Math.hypot(p.body.velocity.x,p.body.velocity.y)>5,dashing:p.isDashing,stealthed:p.isStealthed,attackRemaining:p.cooldownRemaining('attack'),dashRemaining:p.cooldownRemaining('dash'),skillRemaining:p.cooldownRemaining('skill')};
     const stack=new Error().stack||'',dealt=damage(amount);
     if(dealt>0){
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
     if(id==='thorn' && last.appearance.castRemaining>0){
      assert.ok(last.appearance.castRemaining<=180,'cast must use the actual bounded visual clock');
      assert.equal(last.appearance.hero,`cast_thorn_bloom${suffix}`);
      assert.equal(Number(last.appearance.castFrame),Math.min(3,Math.floor((180-last.appearance.castRemaining)/45)));
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
    if(last.dash){await page.keyboard.press('Shift');dashes++;}if(last.skill){await page.keyboard.press('q');skills++;}
    await page.waitForTimeout(90);
   }
   await page.keyboard.up('Space');for(const key of pressed)await page.keyboard.up(key);
   await page.screenshot({path:path.join(OUT,`${id}-ending.png`)});
   const {damageEvents,contactRecoveries,bloomNaturalEvents}=await page.evaluate(()=>({damageEvents:window.damageEvents,contactRecoveries:window.contactRecoveries,bloomNaturalEvents:window.bloomNaturalEvents}));
   const result={bloomNaturalEvents,id,initial,firstHit,bossStarted,dashes,skills,damageEvents,contactRecoveries,lastActive,buildStyle:process.env.SEED_BUILD_STYLE||'survival',wallTime:(Date.now()-begin)/1000,events,last};results.push(result);console.log(id,'RESULT',JSON.stringify(result));
  }catch(error){errors.push({id,error:String(error.stack)});await page.screenshot({path:path.join(OUT,`${id}-error.png`)}).catch(()=>{});}
  finally{
   const data=await page.evaluate(async()=>{const rec=window.chapterRecorder;if(!rec||rec.state==='inactive')return null;return await new Promise(resolve=>{rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(new Blob(window.chapterChunks,{type:'video/webm'}));};rec.stop();});}).catch(()=>null);
   if(data)fs.writeFileSync(path.join(OUT,`${id}-chapter.webm`),Buffer.from(data,'base64'));
   await ctx.close();fs.writeFileSync(path.join(OUT,'chapter-playchecks.json'),JSON.stringify({date:new Date().toISOString(),results,errors,scope:'Separate Thorn coverage run. Canonical input policy and offer priorities unchanged; read-only observers forward each original once. No stats, HP, drops, damage, spawn, position or clock edits. Requires real planting, full stacks and actual full-stack seed detonation; not pooled with canonical four-class sample, not subjective fun or human discoverability proof.'},null,2));
  }
 }}finally{await browser.close();}
 assert.deepEqual(errors,[]);
 for(const id of classes){const r=results.find(r=>r.id===id);assert.ok(r?.last.ended,`${id}: timeout`);assert.equal(r.last.result?.outcome,'victory',`${id}: not a victory`);assert.equal(r.last.result?.mutations.length,3);assert.ok(r.events.some(e=>e.type==='awakening'),`${id}: awakening was not naturally exercised`);assert.ok(r.events.some(e=>e.type==='elite-seen'),`${id}: elite was not naturally exercised`);}
 for(const r of results){assert.ok(r.bloomNaturalEvents.some(e=>e.event==='plant'),'No natural seed planting');assert.ok(r.bloomNaturalEvents.some(e=>e.event==='plant'&&e.ripe),'No natural ripe stack');assert.ok(r.bloomNaturalEvents.some(e=>e.event==='detonate'&&e.seeds===3&&e.damage>0),'No natural full-stack detonation');assert.ok(r.bloomNaturalEvents.some(e=>e.event==='cast-visible'&&e.remaining>0&&e.remaining<=180),'No naturally visible native seed-crush pose');}
 console.log(`Thorn bloom coverage: ${results.length}/${classes.length} victories`);
})().catch(e=>{console.error(e);process.exitCode=1;});
