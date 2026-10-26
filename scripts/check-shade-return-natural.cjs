'use strict';
// Full chapter, fresh saves, normal clock. The controller only reads game state;
// gameplay actions are real keyboard/mouse inputs, including all three mutations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve(process.env.SEED_SHADE_RETURN_PLAY_OUTPUT||'output/shade-return-v1/route-natural');
fs.mkdirSync(OUT,{recursive:true});
const results=[],errors=[];
const classes=['shade'];

// NEW, separately declared return-cue input policy, not the canonical controller.
// When a live earned cue has actually rendered, release movement through key-up.
// Only on a subsequent rendered zero-input cue, with the original dash ready,
// press Shift. Otherwise retain the canonical scoring/Q/held-attack/offer policy.
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
 const skill=p.skillReady&&!!target&&(id==='shade'?dist<190&&approaching:dist<(ranged?115:126));
 const rendered=window.lastReturnRender;
 const returnCue=!!(p.shadowReturnAvailable&&s.combat.shadeReturn.visible&&s.pursuitText.visible&&s.pursuitText.alpha>0&&s.pursuitText.text&&rendered?.available&&rendered.visible&&rendered.grant===window.returnGrant&&performance.now()-rendered.at<150);
 const returnReady=!!(returnCue&&p.dashReady&&!p.isDashing&&p.moveIntent.lengthSq()<=.01&&rendered.moveLength<=.1);
 return{returnCue,returnReady,returnRemaining:p.shadowReturnRemaining,ended:false,choosing:false,floor:s.floor,kills:s.kills,floorKills:s.floorKills,hp:p.stats.hp,maxHp:p.stats.maxHp,time:s.timeAlive,damage:s.damageDealt,chain:s.chain.best,x:p.x,y:p.y,dist,boss:boss?{hp:boss.hp,maxHp:boss.maxHp,phase:boss.phase,x:boss.x,y:boss.y,telegraphs:boss.activeTelegraphs,exposed:boss.isExposed,cue:boss.actionCue}:null,owned:[...s.build.owned],appearance:{ambushRemaining:p.shadeAmbushRemaining,ambushDuration:p.shadeAmbushDuration,backRemaining:p.shadeBackstepRemaining,shadeFrame:p.frame.name,shadeHurt:p.hitFlashTimer,awake:p.isAwakened,hero:p.texture.key,portrait:s.heroPortrait.texture.key},ranged:{...s.rangedStats},rangedEnemies:all.filter(e=>e.rangedTelegraph).map(e=>({x:e.x,y:e.y,tell:e.rangedTelegraph})),elite:{...s.eliteStats},eliteEnemies:all.filter(e=>e.isBreakableElite).map(e=>({x:e.x,y:e.y,hp:e.hp,phase:e.duel.phase,remaining:e.duel.remaining,pressure:e.duel.pressure,threshold:e.duel.threshold})),aimX:Math.max(2,Math.min(1278,aimX-c.scrollX)),aimY:Math.max(2,Math.min(718,aimY-c.scrollY)),mx:returnCue?0:best.mx,my:returnCue?0:best.my,dash:returnCue?returnReady:dash,skill:returnCue?false:skill};
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
    window.damageEvents=[];window.contactRecoveries=[];let contact=null;
    window.returnEvents=[];window.returnGrant=0;window.returnFrames=[];
    let activeAttack=null,sequence=0,captureUntil=0,renderKey='';
    let shadeActionKey='';
    const emit=e=>window.returnEvents.push({time:s.timeAlive,floor:s.floor,x:p.x,y:p.y,...e});
    const tryScene=s.tryPlayerAttack.bind(s);
    s.tryPlayerAttack=(...a)=>{const previous=activeAttack;activeAttack=null;try{return tryScene(...a);}finally{activeAttack=previous;}};
    const tryAttack=p.tryAttack.bind(p);
    p.tryAttack=(...a)=>{const r=tryAttack(...a);if(r){activeAttack={id:++sequence,ambush:r.ambush,dir:{x:r.dir.x,y:r.dir.y},losses:[]};if(r.ambush)emit({event:'ambush',attack:activeAttack.id,damage:r.damage,dir:activeAttack.dir});}return r;};
    const hit=s.hitEnemy.bind(s);
    s.hitEnemy=(enemy,...a)=>{const hp=enemy.hp,r=hit(enemy,...a);if(activeAttack?.ambush&&a[6]&&enemy.hp<hp){const loss={before:hp,after:enemy.hp,actual:Math.min(hp,hp-enemy.hp),kind:enemy.kind};activeAttack.losses.push(loss);emit({event:'ambush-hit',attack:activeAttack.id,...loss});}return r;};
    const confirm=p.confirmAmbushHit.bind(p);
    p.confirmAmbushHit=(...a)=>{const r=confirm(...a);if(r){window.returnGrant++;emit({event:'earned',grant:window.returnGrant,attack:activeAttack?.id,actualHitLosses:activeAttack?.losses.slice()||[],direction:p.shadowReturnDirection,remaining:p.shadowReturnRemaining,dashCooldown:p.cooldownRemaining('dash')});if(window.returnGrant===1)captureUntil=performance.now()+1300;}return r;};
    const dash=p.performDash.bind(p);
    p.performDash=(...a)=>{const before={grant:window.returnGrant,available:p.shadowReturnAvailable,remaining:p.shadowReturnRemaining,direction:p.shadowReturnDirection||null,move:{x:p.moveIntent.x,y:p.moveIntent.y},ready:p.dashReady,expectedCooldown:p.stats.dashCooldown,rendered:window.lastReturnRender||null};const r=dash(...a);emit({event:'dash',before,after:{vx:p.body.velocity.x,vy:p.body.velocity.y,cooldown:p.cooldownRemaining('dash'),available:p.shadowReturnAvailable,invulnerable:p.isInvulnerable,duration:p.dashActive}});return r;};
    s.game.events.on('postrender',()=>{
     if(!p.active||!s.sys.isActive())return;
     // Read-only actual body observation; original return-cue/controller logic below is untouched.
     const ambush=p.texture.key==='strike_shade_ambush'||p.texture.key==='strike_shade_ambush_awakened',back=p.texture.key==='step_shade_return'||p.texture.key==='step_shade_return_awakened';
     const actionKey=ambush||back?p.texture.key+':'+p.frame.name:'';
     if(actionKey&&actionKey!==shadeActionKey)emit({event:'action-visible',kind:back?'return':'ambush',texture:p.texture.key,frame:Number(p.frame.name),remaining:back?p.shadeBackstepRemaining:p.shadeAmbushRemaining,duration:back?140:p.shadeAmbushDuration,awake:p.isAwakened});
     shadeActionKey=actionKey;
     const visible=!!(p.shadowReturnAvailable&&s.combat.shadeReturn.visible&&s.pursuitText.visible&&s.pursuitText.alpha>0&&s.pursuitText.text);
     window.lastReturnRender={at:performance.now(),time:s.timeAlive,grant:window.returnGrant,available:p.shadowReturnAvailable,remaining:p.shadowReturnRemaining,visible,text:s.pursuitText.text,moveLength:p.moveIntent.length(),direction:p.shadowReturnDirection||null};
     const key=visible?'visible:'+window.returnGrant:'';
     if(key!==renderKey){emit({event:visible?'rendered-cue':'hidden',...window.lastReturnRender});renderKey=key;}
     if(captureUntil>performance.now()&&window.returnFrames.length<80){window.returnFrames.push({...window.lastReturnRender,x:p.x,y:p.y,dashing:p.isDashing,vx:p.body.velocity.x,vy:p.body.velocity.y,image:s.game.canvas.toDataURL('image/png').split(',')[1]});}
    });
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
     if(id==='shade'&&(last.appearance.ambushRemaining>0||last.appearance.backRemaining>0)){
      const a=last.appearance,back=a.backRemaining>0;
      if(back)assert.ok(Number.isFinite(a.backRemaining)&&a.backRemaining<=140);
      else assert.ok(Number.isFinite(a.ambushDuration)&&a.ambushDuration>0&&a.ambushDuration<=250&&a.ambushRemaining>0&&a.ambushRemaining<=a.ambushDuration);
      if(a.shadeHurt>0){assert.equal(a.hero,`hero_${id}${suffix}`);assert.equal(Number(a.shadeFrame),13);}
      else{assert.equal(a.hero,`${back?'step_shade_return':'strike_shade_ambush'}${suffix}`);assert.equal(Number(a.shadeFrame),back?Math.min(1,Math.floor((140-a.backRemaining)/70)):Math.min(3,Math.floor((a.ambushDuration-a.ambushRemaining)*4/a.ambushDuration)));}
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
   const {damageEvents,contactRecoveries,returnEvents,returnFrames}=await page.evaluate(()=>({damageEvents:window.damageEvents,contactRecoveries:window.contactRecoveries,returnEvents:window.returnEvents,returnFrames:window.returnFrames}));
   fs.mkdirSync(path.join(OUT,'frames'),{recursive:true});
   for(let i=0;i<returnFrames.length;i++){fs.writeFileSync(path.join(OUT,'frames',String(i).padStart(3,'0')+'.png'),Buffer.from(returnFrames[i].image,'base64'));delete returnFrames[i].image;}
   fs.writeFileSync(path.join(OUT,'frame-times.json'),JSON.stringify(returnFrames,null,2));
   const result={id,initial,firstHit,bossStarted,dashes,skills,damageEvents,contactRecoveries,returnEvents,lastActive,buildStyle:process.env.SEED_BUILD_STYLE||'survival',wallTime:(Date.now()-begin)/1000,events,last};results.push(result);console.log(id,'RESULT',JSON.stringify(result));
  }catch(error){errors.push({id,error:String(error.stack)});await page.screenshot({path:path.join(OUT,`${id}-error.png`)}).catch(()=>{});}
  finally{
   await ctx.close();fs.writeFileSync(path.join(OUT,'shade-return-playchecks.json'),JSON.stringify({date:new Date().toISOString(),results,errors,scope:'NEW separately declared visible-return-cue policy derived from canonical chapter controller, fresh save, normal clock, input-only. Release movement, wait for rendered zero-input cue, then press original Shift. No rerolls or gameplay state edits. Controller success is not human discoverability, subjective fun, balance, or real-device proof.'},null,2));
  }
 }}finally{await browser.close();}
 assert.deepEqual(errors,[]);
 for(const id of classes){const r=results.find(r=>r.id===id);assert.ok(r?.last.ended,`${id}: timeout`);assert.equal(r.last.result?.outcome,'victory',`${id}: not a victory`);assert.equal(r.last.result?.mutations.length,3);assert.ok(r.events.some(e=>e.type==='awakening'),`${id}: awakening was not naturally exercised`);assert.ok(r.events.some(e=>e.type==='elite-seen'),`${id}: elite was not naturally exercised`);}
 for(const r of results){
  const earned=r.returnEvents.filter(e=>e.event==='earned');
  assert.ok(earned.length>0,'No actual ambush-hit return window earned');
  assert.ok(earned.every(e=>e.remaining===650&&e.actualHitLosses.some(h=>h.actual>0)),'Return grant missing actual basic HP-loss provenance');
  const used=r.returnEvents.filter(e=>e.event==='dash'&&e.before.available&&Math.hypot(e.before.move.x,e.before.move.y)<=.1);
  assert.ok(used.length>0,'No actual zero-input reverse dash used');
  for(const e of used){const {before:b,after:a}=e;assert.ok(b.ready&&b.rendered?.visible&&b.rendered.moveLength<=.1&&b.rendered.grant===b.grant,'Dash was not based on rendered zero-input cue');assert.ok((a.vx*b.direction.x+a.vy*b.direction.y)/520>.99,'Dash was not reverse');assert.equal(a.cooldown,b.expectedCooldown);assert.equal(a.cooldown,600);assert.equal(a.duration,140);assert.ok(a.invulnerable&&!a.available);}
  console.log('SHADE RETURN COVERAGE',JSON.stringify({earned:earned.length,visible:r.returnEvents.filter(e=>e.event==='rendered-cue').length,zeroInputReverseDashes:used.length}));
 }
 for(const r of results)for(const kind of ['ambush','return'])assert.ok(r.returnEvents.some(e=>e.event==='action-visible'&&e.kind===kind),'No naturally rendered Shade body '+kind);
 console.log(`Natural shade return: ${results.length}/${classes.length} victories`);
})().catch(e=>{console.error(e);process.exitCode=1;});
