'use strict';
// NEW first-floor policy: release held attack before Q; approach while cloaked,
// stop movement on a visible in-range target, then deliberately press attack/Shift.
// Original read-only route/hazard planner copied verbatim from shade-return, with CRLF normalized to LF.
// Normal engine clock, fresh save and original spawns/stats; no sleep/time scaling.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const OUT=path.resolve(process.env.SEED_SHADE_LINK_PLAY_OUTPUT||'output/shade-link-v1/natural');if(fs.existsSync(OUT))throw Error('Refuse overwrite '+OUT);fs.mkdirSync(OUT,{recursive:true});
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
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[];let result;try{const page=await browser.newPage({viewport:{width:1280,height:720},locale:'zh-CN'}),pressed=new Set(),actions=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await page.evaluate(()=>{window.__seedDev.saveSystem.setSelectedClass('shade');window.__seedDev.saveSystem.setLanguage('zh');window.__seedGame.scene.stop('Menu');window.__seedGame.scene.start('Run');});await page.waitForFunction(()=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player.classId==='shade'&&s.cameras.main.fadeEffect.alpha===0;});
const initial=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.linkNatural=[];window.linkNaturalFrames=[];let captureUntil=0,losses=[];const emit=e=>window.linkNatural.push({time:s.timeAlive,floor:s.floor,...e});const sceneAttack=s.tryPlayerAttack.bind(s);s.tryPlayerAttack=(...args)=>{losses=[];return sceneAttack(...args);};const hit=s.hitEnemy.bind(s);s.hitEnemy=(e,...args)=>{const hp=e.hp,r=hit(e,...args);if(e.hp<hp)losses.push({before:hp,after:e.hp,kind:e.kind});return r;};const confirm=p.confirmAmbushHit.bind(p);p.confirmAmbushHit=(...args)=>{const r=confirm(...args);if(r)emit({type:'earned',losses:losses.slice(),remaining:p.shadowReturnRemaining});return r;};const update=p.updateEntity.bind(p);p.updateEntity=(...args)=>{const r=update(...args);if(r===true){emit({type:'deferred',hp:p.stats.hp,buffer:p.hasBufferedAttack,dashReady:p.dashReady});if(!captureUntil)captureUntil=performance.now()+1600;}return r;};const dash=p.performDash.bind(p);p.performDash=(...args)=>{const before={return:p.shadowReturnAvailable,dir:p.shadowReturnDirection,move:{x:p.moveIntent.x,y:p.moveIntent.y},invuln:p.invulnTimer,ready:p.dashReady};const r=dash(...args);emit({type:'dash',before,after:{vx:p.body.velocity.x,vy:p.body.velocity.y,duration:p.dashActive,cooldown:p.cooldownRemaining('dash'),invuln:p.invulnTimer,return:p.shadowReturnAvailable}});return r;};const damage=p.applyDamage.bind(p);p.applyDamage=(...args)=>{const r=damage(...args);if(r>0)emit({type:'hurt',damage:r,hp:p.stats.hp});return r;};const collect=()=>{if(captureUntil>performance.now()&&window.linkNaturalFrames.length<100)window.linkNaturalFrames.push({elapsed:performance.now(),time:s.timeAlive,x:p.x,y:p.y,texture:p.texture.key,frame:p.frame.name,hp:p.stats.hp,image:s.game.canvas.toDataURL('image/png').split(',')[1]});};s.game.events.on('postrender',collect);s.events.once('shutdown',()=>s.game.events.off('postrender',collect));return{hp:p.stats.hp,maxHp:p.stats.maxHp,damage:p.stats.damage,seed:window.__seedDev.saveSystem.seedStage};});assert.deepEqual(initial,{hp:95,maxHp:95,damage:15,seed:1});
let held=false,last;const begin=Date.now();while(Date.now()-begin<60000){const base=await page.evaluate(observeAndPlan,'shade');const view=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,c=s.cameras.main;const target=s.enemies.getChildren().filter(e=>e.isTargetable&&s.navigation.clearLine(p.x,p.y,e.x,e.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];const close=!!(p.isStealthed&&!p.isDashing&&p.attackReady&&p.dashReady&&target&&Math.hypot(target.x-p.x,target.y-p.y)<=p.stats.attackRange+target.hitRadius-5);return{stealth:p.isStealthed,close,ready:close&&p.moveIntent.lengthSq()<=.01,choosing:s.choosing,ended:s.ended,kills:s.kills,hp:p.stats.hp,time:s.timeAlive,damage:s.damageDealt};});last={...base,...view};if(view.ended||view.choosing)break;
await page.mouse.move(base.aimX,base.aimY);const keys=new Set();if(!view.close){if(base.mx)keys.add(base.mx>0?'d':'a');if(base.my)keys.add(base.my>0?'s':'w');}for(const k of pressed)if(!keys.has(k)){await page.keyboard.up(k);pressed.delete(k);}for(const k of keys)if(!pressed.has(k)){await page.keyboard.down(k);pressed.add(k);}
if(view.ready){if(held){await page.keyboard.up('Space');held=false;}await page.keyboard.down('Space');held=true;await page.keyboard.down('Shift');await page.keyboard.up('Shift');actions.push({type:'attack-then-dash',time:view.time,hp:view.hp});}
else if(view.stealth||base.skill){if(held){await page.keyboard.up('Space');held=false;}if(base.skill){await page.keyboard.press('q');actions.push({type:'Q',time:view.time});}else if(!view.close&&base.dash){await page.keyboard.press('Shift');actions.push({type:'defensive-dash',time:view.time});}}
else{if(!held){await page.keyboard.down('Space');held=true;}if(base.dash){await page.keyboard.press('Shift');actions.push({type:'defensive-dash',time:view.time});}}
await page.waitForTimeout(65);
}
await page.keyboard.up('Space');for(const k of pressed)await page.keyboard.up(k);await page.screenshot({path:path.join(OUT,'ending.png')});const data=await page.evaluate(()=>({events:window.linkNatural,frames:window.linkNaturalFrames}));const frameDir=path.join(OUT,'frames');fs.mkdirSync(frameDir);for(let i=0;i<data.frames.length;i++){fs.writeFileSync(path.join(frameDir,String(i).padStart(3,'0')+'.png'),Buffer.from(data.frames[i].image,'base64'));delete data.frames[i].image;}fs.writeFileSync(path.join(OUT,'frame-times.json'),JSON.stringify(data.frames,null,2));const deferred=data.events.filter(e=>e.type==='deferred'),earned=data.events.filter(e=>e.type==='earned'),reverse=data.events.filter(e=>e.type==='dash'&&e.before.return&&Math.hypot(e.before.move.x,e.before.move.y)<=.1);result={initial,last,actions,events:data.events,wallSeconds:(Date.now()-begin)/1000,coverage:{deferred:deferred.length,earned:earned.length,reverseDashes:reverse.length},frames:data.frames.length};fs.writeFileSync(path.join(OUT,'natural.json'),JSON.stringify({result,errors,scope:'NEW paired-input first-floor policy, not the canonical controller. Original route/hazard scoring, native inputs only, fresh save, normal clock/spawns/stats. Captures actual POST_RENDER after the first naturally coalesced link; not human discoverability, win rate or causal DPS proof.'},null,2));assert.deepEqual(errors,[]);assert.ok(last.choosing&&!last.ended&&last.kills>=12,'Did not clear first floor');assert.ok(deferred.length>0,'This sample did not naturally coalesce a pair');assert.ok(earned.length>0&&reverse.length>0);for(const e of earned){assert.equal(e.remaining,650);assert.ok(e.losses.some(l=>l.after<l.before));}for(const e of reverse){const d=e.before.dir,a=e.after;assert.ok((a.vx*d.x+a.vy*d.y)/520>.999);assert.equal(a.duration,140);assert.equal(a.cooldown,600);assert.equal(a.invuln,Math.max(e.before.invuln,140));assert.equal(a.return,false);}console.log('NEW natural paired-input sample:',JSON.stringify({time:last.time,hp:last.hp,kills:last.kills,coverage:result.coverage,frames:result.frames}));
}finally{if(!result)fs.writeFileSync(path.join(OUT,'incomplete.json'),JSON.stringify({errors},null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
