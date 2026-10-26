'use strict';
// Full chapter, fresh saves, normal clock. The controller only reads game state;
// gameplay actions are real keyboard/mouse inputs, including all three mutations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ROUTE='bloodbrand';
const OUT=path.resolve(process.env.SEED_RELAY_PLAY_OUTPUT||'output/reaver-relay-v4/natural-exploration');
fs.mkdirSync(OUT,{recursive:true});
const results=[],errors=[];
const classes=['reaver'];

// NEW Relay build priorities; original visible-wound input rules otherwise unchanged.
// When the shared HUD and actual opportunity
// marker show a wound-paid target, approach/aim at that target rather than a different
// nearest enemy. Otherwise retain the original bloodbrand-priority controller.
// Original movement scoring, Q, dash, fresh-press buffer, offers and clocks unchanged.
// No direct movement, damage, timers, spawn, or stat writes.
function observeAndPlan(id){
 const s=window.__seedGame.scene.getScene('Run'),p=s.player,c=s.cameras.main;
 const result=window.__seedDev.runState.lastRun;
 if(s.ended||!s.sys.isActive())return {ended:true,result};
 if(s.choosing)return{choosing:true,floor:s.floor,kills:s.kills,hp:p.stats.hp,time:s.timeAlive,choices:s.choices.map(m=>({id:m.id,owner:m.owner})),owned:[...s.build.owned]};
 const all=s.enemies.getChildren().filter(e=>e.isTargetable).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
 const cue=s.pursuitCue;
 const visibleWound=!!(cue&&cue.pulses>0&&s.combat.pursuitOpportunity.visible&&s.pursuitText.visible&&s.pursuitText.alpha>0&&s.pursuitText.text&&cue.target.isTargetable&&all.includes(cue.target));
 // NEW deliberate input strategy: select a visible bleed-mark target, not only the old HUD cue.
 const marked=s.build.has('reaver_relay')?all.find(e=>{const m=s.marks.get(e);return m&&m.bleed>0&&m.tick<=m.bleed&&s.navigation.clearLine(p.x,p.y,e.x,e.y);}):undefined;
 // NEW policy: explicitly follow the visible persistent hooked diamond before a generic bleed.
 const inherited=s.build.has('reaver_relay')&&s.marksInk.visible?all.find(e=>{const m=s.marks.get(e);return m?.relay&&m.bleed>0&&m.tick<=m.bleed&&c.worldView.contains(e.x,e.y)&&s.navigation.clearLine(p.x,p.y,e.x,e.y);}):undefined;
 const target=inherited||marked||(visibleWound?cue.target:all.find(e=>s.navigation.clearLine(p.x,p.y,e.x,e.y))||all[0]);
 const boss=s.boss,dist=target?Math.hypot(target.x-p.x,target.y-p.y):9999;
 const dx=target?target.x-p.x:0,dy=target?target.y-p.y:0;
 const practiceMark=target&&s.marks.get(target),practice=!!(s.build.has('reaver_relay')&&practiceMark&&practiceMark.bleed>0&&practiceMark.tick<=practiceMark.bleed);
 const ranged=id==='thorn',ideal=practice&&p.cooldownRemaining('attack')>0?p.stats.attackRange+target.hitRadius+24:boss?(ranged?210:92):(ranged?180:Math.max(42,p.stats.attackRange+4));
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
 // Reserve Q while deliberately preparing a paid wound, except at low HP. No skill/cooldown writes.
 const skill=p.skillReady&&(!practice||p.stats.hp<p.stats.maxHp*.4)&&!!target&&(id==='shade'?dist<190&&approaching:dist<(ranged?115:126));
 const wound=target&&s.marks.get(target), woundReady=s.build.has('reaver_bleed')&&!!wound&&wound.bleed>0&&wound.tick<=wound.bleed;
 const opportunity=p.pursuitAvailable||woundReady;
 const pursue=id==='reaver' && opportunity && p.cooldownRemaining('attack')<=(practice?0:140) && !p.isPursuing && !dash && !skill && !!target &&
   dist>p.stats.attackRange+target.hitRadius && dist<=p.stats.attackRange+target.hitRadius+54 &&
   (best.mx*dx+best.my*dy)/ml/Math.max(1,dist)>.94;
 return{visibleWoundTarget:visibleWound,pursuitAvailable:p.pursuitAvailable,holdAttack:!practice&&(!opportunity||!!target&&dist<=p.stats.attackRange+target.hitRadius),attackRemaining:p.cooldownRemaining('attack'),pursue,ended:false,choosing:false,floor:s.floor,kills:s.kills,floorKills:s.floorKills,hp:p.stats.hp,maxHp:p.stats.maxHp,time:s.timeAlive,damage:s.damageDealt,chain:s.chain.best,x:p.x,y:p.y,dist,boss:boss?{hp:boss.hp,maxHp:boss.maxHp,phase:boss.phase,x:boss.x,y:boss.y,telegraphs:boss.activeTelegraphs,exposed:boss.isExposed,cue:boss.actionCue}:null,owned:[...s.build.owned],appearance:{pounceActive:p.isPursuing,pounceLeft:p.reaverTravelRemaining,pounceTotal:p.reaverTravelTotal,cutRemaining:p.reaverCutRemaining,cutDuration:p.reaverCutDuration,pounceFrame:p.frame.name,pounceHurt:p.hitFlashTimer,awake:p.isAwakened,hero:p.texture.key,portrait:s.heroPortrait.texture.key},ranged:{...s.rangedStats},rangedEnemies:all.filter(e=>e.rangedTelegraph).map(e=>({x:e.x,y:e.y,tell:e.rangedTelegraph})),elite:{...s.eliteStats},eliteEnemies:all.filter(e=>e.isBreakableElite).map(e=>({x:e.x,y:e.y,hp:e.hp,phase:e.duel.phase,remaining:e.duel.remaining,pressure:e.duel.pressure,threshold:e.duel.threshold})),aimX:Math.max(2,Math.min(1278,aimX-c.scrollX)),aimY:Math.max(2,Math.min(718,aimY-c.scrollY)),mx:best.mx,my:best.my,dash,skill};
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
    window.damageEvents=[];window.contactRecoveries=[];window.pursuitEvents=[];let contact=null;
    // Read-only actual POST_RENDER pose transitions; no controller or clock writes.
    let pounceKey='';const pounceObserver=()=>{
     if(!p.active)return;
     const visible=p.texture.key==='pounce_reaver'||p.texture.key==='pounce_reaver_awakened',key=visible?p.texture.key+':'+p.frame.name:'';
     if(visible&&key!==pounceKey)window.pursuitEvents.push({event:'pounce-visible',time:s.timeAlive,floor:s.floor,pursuing:p.isPursuing,left:p.reaverTravelRemaining,total:p.reaverTravelTotal,remaining:p.reaverCutRemaining,duration:p.reaverCutDuration,frame:Number(p.frame.name),texture:p.texture.key,awake:p.isAwakened});
     pounceKey=key;
    };s.game.events.on('postrender',pounceObserver);s.events.once('shutdown',()=>s.game.events.off('postrender',pounceObserver));
    const start=p.startPursuit.bind(p),consume=p.consumePursuitStrike.bind(p),swing=s.tryPlayerAttack.bind(s),hit=s.hitEnemy.bind(s);
    let pursuitSwing=false;
    p.startPursuit=(...args)=>{const result=start(...args);if(result)window.pursuitEvents.push({event:'start',time:s.timeAlive,floor:s.floor,x:p.x,y:p.y,travel:args[0],paidWound:!!args[1],hp:p.stats.hp});return result;};
    p.consumePursuitStrike=(...args)=>{const result=consume(...args);if(result)window.pursuitEvents.push({event:'strike',time:s.timeAlive,floor:s.floor,x:p.x,y:p.y});return result;};
    s.tryPlayerAttack=(...args)=>{const previous=pursuitSwing;pursuitSwing=!!args[1];try{return swing(...args);}finally{pursuitSwing=previous;}};
    const area=s.areaDamage.bind(s);let ringSwing=false;
    s.areaDamage=(...args)=>{const previous=ringSwing;ringSwing=p.classId==='reaver'&&s.build.has('reaver_cleave')&&args[2]===110&&Math.abs(args[3]-p.stats.damage*.9)<1e-8;if(ringSwing)window.pursuitEvents.push({event:'ring',time:s.timeAlive,floor:s.floor});try{return area(...args);}finally{ringSwing=previous;}};
    s.hitEnemy=(enemy,...args)=>{const before=enemy.hp;const result=hit(enemy,...args);if(enemy.hp<before){const detail={time:s.timeAlive,floor:s.floor,kind:enemy.kind,damage:Math.max(0,Math.min(before,before-enemy.hp)),bleedPulses:args[7]||0,x:p.x,y:p.y,enemyX:enemy.x,enemyY:enemy.y};if(pursuitSwing)window.pursuitEvents.push({event:'hit',...detail});if(ringSwing)window.pursuitEvents.push({event:'ring-hit',...detail});}return result;};
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

   // Identity provenance and actual visible focus transitions. These wrappers each
   // forward the current original exactly once; WeakMap IDs never touch game objects.
   await page.evaluate(async()=>{
    const s=window.__seedGame.scene.getScene('Run'),p=s.player,{t}=await import('/src/i18n/i18n.ts');
    window.focusEvents=[];window.focusDiagnostics=[];const ids=new WeakMap();let serial=0,activeCommit=null,lastKey='';
    const id=e=>{if(!ids.has(e))ids.set(e,++serial);return ids.get(e);};
    const target=e=>({id:id(e),x:e.x,y:e.y,hp:e.hp,active:e.active,targetable:e.isTargetable,kind:e.kind,radius:e.hitRadius,vx:e.body?.velocity.x||0,vy:e.body?.velocity.y||0});
    const commit=s.tryReaverPursuit.bind(s),swing=s.tryPlayerAttack.bind(s),hit=s.hitEnemy.bind(s),update=s.updatePursuitCue.bind(s);
    s.tryReaverPursuit=(...a)=>{const result=commit(...a);if(result&&s.pursuitBrand){const b=s.pursuitBrand;window.focusDiagnostics.push({event:'commit',time:s.timeAlive,floor:s.floor,target:target(b.target),pulses:b.pulses,x:p.x,y:p.y,direction:p.pursuitDirection});}return result;};
    s.tryPlayerAttack=(...a)=>{const previous=activeCommit,b=a[1]?s.pursuitBrand:null;activeCommit=b?{id:id(b.target),pulses:b.pulses}:null;
     if(b)window.focusDiagnostics.push({event:'before-strike',time:s.timeAlive,floor:s.floor,target:target(b.target),pulses:b.pulses,x:p.x,y:p.y,direction:{...a[1]}});
     try{return swing(...a);}finally{if(b)window.focusDiagnostics.push({event:'outcome',time:s.timeAlive,floor:s.floor,target:target(b.target),focus:s.bloodFocus.current??null});activeCommit=previous;}};
    s.hitEnemy=(e,...a)=>{const before=e.hp,result=hit(e,...a);if(activeCommit&&e.hp<before)window.focusDiagnostics.push({event:'damage-during-strike',time:s.timeAlive,floor:s.floor,target:target(e),paidTarget:activeCommit.id,isPaidTarget:id(e)===activeCommit.id,basic:!!a[6],pulses:a[7]||0,hpLost:Math.min(before,before-e.hp)});return result;};
    s.updatePursuitCue=(...a)=>{const result=update(...a),focus=s.bloodFocus.current,b=s.pursuitBrand;
     const textVisible=!!(s.pursuitText.visible&&s.pursuitText.alpha>0&&s.pursuitText.text);
     const visible=!!(focus&&textVisible&&(focus.stage==='committed'?s.combat.bloodbrandFocus.visible:s.pursuitText.text===t('reaver_focus_'+focus.stage,{pulses:focus.pulses})));
     const key=focus?focus.stage+':'+visible+':'+(b?id(b.target):''):'';
     if(key!==lastKey){window.focusEvents.push({event:'focus',time:s.timeAlive,floor:s.floor,focus:focus??null,visible,text:s.pursuitText.text,target:b?target(b.target):null});lastKey=key;}return result;};
   });
   // Observer-only identities/credits; every original forwards once, no game writes.
   await page.evaluate(async()=>{
    const s=window.__seedGame.scene.getScene('Run'),{remainingBleedPulses}=await import('/src/systems/Bloodbrand.ts');
    window.relayNaturalEvents=[];window.relayNaturalRenders=[];window.relayMarkerRenders=[];window.relayMarkerCaptures=[];let captureStarted=false;
    const ids=new WeakMap(),credits=new WeakMap(),reservations=new WeakMap();let serial=0,creditSerial=0,currentHit=null,currentCommit=null;
    const id=e=>{if(!ids.has(e))ids.set(e,++serial);return ids.get(e);};
    const debt=e=>{const m=s.marks.get(e);return m?remainingBleedPulses(m.bleed,m.tick):0;};
    const target=e=>({id:id(e),x:e.x,y:e.y,hp:e.hp,active:e.active,targetable:e.isTargetable,debt:debt(e)});
    const relay=s.relayBloodbrand.bind(s),commit=s.tryReaverPursuit.bind(s),swing=s.tryPlayerAttack.bind(s),hit=s.hitEnemy.bind(s);
    s.relayBloodbrand=(enemy,pulses)=>{const source=target(enemy),damageBefore=s.damageDealt,candidates=s.enemies.getChildren().map(e=>({...target(e),los:s.navigation.clearLine(enemy.x,enemy.y,e.x,e.y)})),before=new Map(s.enemies.getChildren().map(e=>[e,{hp:e.hp,mark:s.marks.get(e)?{...s.marks.get(e)}:null}]));const result=relay(enemy,pulses);if(result){const credit={id:++creditSerial,pulses:debt(result)};credits.set(result,credit);window.relayNaturalEvents.push({event:'relay',time:s.timeAlive,floor:s.floor,credit:credit.id,paid:pulses,source,originalHit:currentHit?{...currentHit}:null,candidates,target:target(result),before:before.get(result),mark:{...s.marks.get(result)},damageBefore,damageAfter:s.damageDealt,owned:[...s.build.owned]});}return result;};
    s.tryReaverPursuit=(...a)=>{const result=commit(...a),b=s.pursuitBrand;if(result&&b){const credit=credits.get(b.target);if(credit){reservations.set(b,{...credit});window.relayNaturalEvents.push({event:'inherited-commit',time:s.timeAlive,floor:s.floor,credit:credit.id,target:target(b.target),paid:b.pulses});}}return result;};
    s.tryPlayerAttack=(...a)=>{const previous=currentCommit,b=a[1]?s.pursuitBrand:null;currentCommit=b?{target:id(b.target),pulses:b.pulses,credit:reservations.get(b)?.id||0}:null;try{return swing(...a);}finally{currentCommit=previous;}};
    s.hitEnemy=(e,...a)=>{const previous=currentHit,before=e.hp;currentHit={target:id(e),hpBefore:before,basic:a[6]===true,pulses:a[7]||0,commit:currentCommit?{...currentCommit}:null};try{const result=hit(e,...a);if(e.hp<before){if(a[6]===true&&!a[7])credits.delete(e);if(currentCommit?.credit&&currentCommit.target===id(e)&&a[6]===true&&a[7]>0)window.relayNaturalEvents.push({event:'inherited-cashout',time:s.timeAlive,floor:s.floor,credit:currentCommit.credit,target:target(e),paid:a[7],damage:Math.min(before,before-e.hp),hpBefore:before,hpAfter:e.hp});}return result;}finally{currentHit=previous;}};
    const render=()=>{const fx=s.combat.effects.filter(e=>e.kind==='relay');if(fx.length)window.relayNaturalRenders.push({time:s.timeAlive,floor:s.floor,visible:s.combat.ink.visible,commands:s.combat.ink.commandBuffer.length,effects:fx.map(e=>({...e}))});
     const inherited=[...s.marks].filter(([e,m])=>m.relay&&e.active&&e.isTargetable&&debt(e)>0).map(([e,m])=>({...target(e),mark:{...m},onScreen:s.cameras.main.worldView.contains(e.x,e.y)}));
     if(inherited.length)window.relayMarkerRenders.push({time:s.timeAlive,floor:s.floor,visible:s.marksInk.visible,commands:s.marksInk.commandBuffer.length,inherited});
     if(inherited.some(e=>e.onScreen))captureStarted=true;
     if(captureStarted&&window.relayMarkerCaptures.length<90)window.relayMarkerCaptures.push({elapsed:performance.now(),time:s.timeAlive,floor:s.floor,player:{x:s.player.x,y:s.player.y,hp:s.player.stats.hp},inherited,events:window.relayNaturalEvents.length,png:s.game.canvas.toDataURL()});
    };
    s.game.events.on('postrender',render);s.events.once('shutdown',()=>s.game.events.off('postrender',render));
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
     if(id==='reaver' && (last.appearance.pounceActive||last.appearance.cutRemaining>0)){
      const a=last.appearance;
      if(a.pounceActive)assert.ok(Number.isFinite(a.pounceTotal)&&a.pounceTotal>0&&a.pounceTotal<=64&&a.pounceLeft>=0&&a.pounceLeft<=a.pounceTotal);
      else assert.ok(Number.isFinite(a.cutDuration)&&a.cutDuration>0&&a.cutDuration<=250&&a.cutRemaining>0&&a.cutRemaining<=a.cutDuration);
      if(a.pounceHurt>0){assert.equal(a.hero,`hero_${id}${suffix}`);assert.equal(Number(a.pounceFrame),13);}
      else{assert.equal(a.hero,`pounce_reaver${suffix}`);assert.equal(Number(a.pounceFrame),a.pounceActive?(a.pounceLeft>a.pounceTotal/2?0:1):2+Math.min(3,Math.floor((a.cutDuration-a.cutRemaining)*4/a.cutDuration)));}
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
     const priority=['reaver_bleed','reaver_relay','reaver_cleave','shared_feast','shared_haste','shared_dash','shared_spite'];
     const choice=last.choices.map((m,index)=>({...m,index,rank:priority.indexOf(m.id)})).sort((a,b)=>a.rank-b.rank)[0];
     events.push({type:'mutation',...choice,hp:last.hp,time:last.time});console.log(id,'MUTATION',choice.id);
     await page.waitForTimeout(350);await page.keyboard.press(String(choice.index+1));await page.keyboard.down('Space');continue;
    }
    if(Date.now()-lastLog>15000){lastLog=Date.now();console.log(id,'PLAY',JSON.stringify(last));}
    await page.mouse.move(last.aimX,last.aimY);
    const keys=new Set();if(last.mx)keys.add(last.mx>0?'d':'a');if(last.my)keys.add(last.my>0?'s':'w');
    for(const key of pressed)if(!keys.has(key)){await page.keyboard.up(key);pressed.delete(key);}for(const key of keys)if(!pressed.has(key)){await page.keyboard.down(key);pressed.add(key);}
    // NEW marked-target practice: keep recovery spacing until attackReady (0ms),
    // then approach + fresh press. Unmarked kill-ticket use retains the 140ms buffer.
    // This intentionally different input policy is not a retry of V3 practice.
    if(!last.holdAttack)await page.keyboard.up('Space');
    if(last.pursue){await page.keyboard.up('Space');await page.keyboard.down('Space');}
    else if(last.holdAttack)await page.keyboard.down('Space');
    if(last.dash){await page.keyboard.press('Shift');dashes++;}if(last.skill){await page.keyboard.press('q');skills++;}
    await page.waitForTimeout(90);
   }
   await page.keyboard.up('Space');for(const key of pressed)await page.keyboard.up(key);
   await page.screenshot({path:path.join(OUT,`${id}-ending.png`)});
   const {damageEvents,contactRecoveries,pursuitEvents,focusEvents,focusDiagnostics,relayNaturalEvents,relayNaturalRenders,relayMarkerRenders}=await page.evaluate(()=>({damageEvents:window.damageEvents,contactRecoveries:window.contactRecoveries,pursuitEvents:window.pursuitEvents,focusEvents:window.focusEvents,focusDiagnostics:window.focusDiagnostics,relayNaturalEvents,relayNaturalRenders,relayMarkerRenders}));
   const result={relayNaturalEvents,relayNaturalRenders,relayMarkerRenders,route:ROUTE,focusEvents,focusDiagnostics,pursuitEvents,id,initial,firstHit,bossStarted,dashes,skills,damageEvents,contactRecoveries,lastActive,buildStyle:'blooddebt-relay-visible-inherited-ready-zero',wallTime:(Date.now()-begin)/1000,events,last};results.push(result);console.log(id,'RESULT',JSON.stringify(result));
  }catch(error){errors.push({id,error:String(error.stack)});await page.screenshot({path:path.join(OUT,`${id}-error.png`)}).catch(()=>{});}
  finally{
   const data=await page.evaluate(async()=>{const rec=window.chapterRecorder;if(!rec||rec.state==='inactive')return null;return await new Promise(resolve=>{rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(new Blob(window.chapterChunks,{type:'video/webm'}));};rec.stop();});}).catch(()=>null);
   if(data)fs.writeFileSync(path.join(OUT,`${id}-chapter.webm`),Buffer.from(data,'base64'));
   const frames=await page.evaluate(()=>window.relayMarkerCaptures||[]).catch(()=>[]);const frameDir=path.join(OUT,'marker-frames');fs.mkdirSync(frameDir,{recursive:true});
   for(const [i,f]of frames.entries()){fs.writeFileSync(path.join(frameDir,`${String(i).padStart(3,'0')}.png`),Buffer.from(f.png.split(',')[1],'base64'));delete f.png;}
   fs.writeFileSync(path.join(frameDir,'capture.json'),JSON.stringify({scope:'Actual POST_RENDER frames starting at the first naturally inherited visible marker. Normal clock; no fixtures/state writes or synthetic frames.',frames},null,2));
   await ctx.close();fs.writeFileSync(path.join(OUT,'chapter-playchecks.json'),JSON.stringify({date:new Date().toISOString(),results,errors,scope:"NEW V4 visible-inherited-marker / ready-zero INPUT POLICY. Derived exactly from the preserved V3 deliberate-spacing failure. Input changes: prefer a visible, LOS-clear hooked inherited marker over generic bleed; retain recovery spacing until attack remaining is 0 (not 140); fresh marked-target press only at 0, retaining original 140ms for unmarked tickets. Same earned bleed -> relay -> cleave build, danger scoring, wall navigation, Q reservation, dashes, 90ms sampling, clock and all existing provenance assertions. Read-only additional marker/render/frame observers, no HP/position/cooldown/mark writes during play. One fresh-save sample; do not retry for green. Only deliberate controller feasibility, not human discoverability, typical success, fun or balance. All older failures remain unchanged."},null,2));
  }
 }}finally{await browser.close();}
 assert.deepEqual(errors,[]);
 for(const id of classes){const r=results.find(r=>r.id===id);assert.ok(r?.last.ended,`${id}: timeout`);assert.equal(r.last.result?.outcome,'victory',`${id}: not a victory`);assert.equal(r.last.result?.mutations.length,3);assert.ok(r.events.some(e=>e.type==='awakening'),`${id}: awakening was not naturally exercised`);assert.ok(r.events.some(e=>e.type==='elite-seen'),`${id}: elite was not naturally exercised`);}
 for(const result of results){if(ROUTE==='bloodbrand'){assert.ok(result.pursuitEvents.some(e=>e.event==='start'&&e.paidWound),'No wound-paid pursuit');assert.ok(result.pursuitEvents.some(e=>e.event==='hit'&&e.bleedPulses>0),'No actual wound cashout');}else assert.ok(result.pursuitEvents.some(e=>e.event==='ring-hit'),'No actual ring-cleave hit');}
 for(const r of results){assert.ok(r.focusEvents.some(e=>e.visible&&e.focus?.stage==='committed'),'No visible committed focus');assert.ok(r.focusEvents.some(e=>e.visible&&e.focus?.stage==='hit'),'No visible actual hit outcome');assert.ok(r.focusDiagnostics.some(e=>e.event==='damage-during-strike'&&e.isPaidTarget&&e.basic&&e.pulses>0&&e.hpLost>0),'No original-target basic wound HP loss');}
 for(const r of results){assert.ok(r.pursuitEvents.some(e=>e.event==='pounce-visible'&&e.frame<2),'No naturally rendered committed approach');assert.ok(r.pursuitEvents.some(e=>e.event==='pounce-visible'&&e.frame>=2),'No naturally rendered pursuit cut');}
 for(const r of results){
  const events=r.relayNaturalEvents,relays=events.filter(e=>e.event==='relay'),commits=events.filter(e=>e.event==='inherited-commit'),cashouts=events.filter(e=>e.event==='inherited-cashout');
  assert.ok(r.events.some(e=>e.type==='mutation'&&e.id==='reaver_relay'),'Relay not naturally selected');assert.ok(relays.length,'No natural actual-paid-hit relay');
  for(const e of relays){assert.ok(e.originalHit?.basic&&e.originalHit.pulses>0&&e.originalHit.hpBefore>0);assert.ok(e.source.hp<e.originalHit.hpBefore);assert.equal(e.originalHit.target,e.source.id);assert.equal(e.originalHit.commit?.target,e.source.id);assert.equal(e.damageBefore,e.damageAfter);assert.equal(e.target.hp,e.before.hp);assert.equal(e.target.debt,Math.min(3,e.paid));assert.equal(e.mark.tick,1000);assert.equal(e.mark.bleed,Math.min(3,e.paid)*1000+100);assert.ok(e.owned.includes('reaver_bleed')&&e.owned.includes('reaver_relay'));}
  assert.ok(r.relayMarkerRenders.some(f=>f.visible&&f.commands>0&&f.inherited.some(e=>e.onScreen&&e.mark.relay)),'No actual persistent inherited marker rendered');
  assert.ok(commits.length,'No actual later commitment of inherited debt');assert.ok(cashouts.length,'No actual inherited debt HP-loss cashout');
  for(const e of cashouts){assert.ok(commits.some(c=>c.credit===e.credit&&c.target.id===e.target.id&&c.paid===e.paid));assert.ok(relays.some(r=>r.credit===e.credit&&r.target.id===e.target.id));assert.ok(e.damage>0&&e.hpAfter<e.hpBefore);}
  assert.ok(r.relayNaturalRenders.some(f=>f.visible&&f.commands>0&&f.effects.some(e=>e.age>0&&e.age<e.duration)),'No actual relay accent rendered');
 }
 console.log(`Reaver Relay NEW build route: ${results.length}/${classes.length} victories`);
})().catch(e=>{console.error(e);process.exitCode=1;});
