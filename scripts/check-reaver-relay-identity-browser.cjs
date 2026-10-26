'use strict';
// Explicit engine fixtures and one normal-clock real-input sequence; not natural play.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const OUT=path.resolve(process.env.SEED_RELAY_IDENTITY_OUTPUT||'output/reaver-relay-v4/identity-browser-exploration');fs.mkdirSync(OUT,{recursive:true});let page;const checks=[],errors=[];
async function check(name,fn){try{const detail=await fn();checks.push({name,passed:true,detail});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:String(e.stack)});await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw e;}}
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

async function setup({relay=true,live=false,motion=true}={}){await start('reaver',live);await page.evaluate(({relay,motion})=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('reaver_bleed');if(relay)s.build.acquire('reaver_relay');window.__seedDev.saveSystem.setFeedback({impactMotion:motion});},{relay,motion});}

(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const ctx=await b.newContext({viewport:{width:1280,height:720}});page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.stack));
 try{
 await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 await check('Relay grants origin without HP loss, retains seeds, original 2100/1000 clock',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),source=window.foe(90,-30),target=window.foe(105);s.marks.set(target,{seeds:2,bleed:0,tick:200});const hp=target.hp,damage=s.damageDealt,childCount=s.children.length;const result=s.relayBloodbrand(source,2);window.inheritedTarget=target;return{same:result===target,hpBefore:hp,hp:target.hp,damageBefore:damage,damage:s.damageDealt,mark:{...s.marks.get(target)},childCount,nowChildren:s.children.length};});
  assert.equal(r.same,true);assert.equal(r.hp,r.hpBefore);assert.equal(r.damage,r.damageBefore);assert.deepEqual(r.mark,{seeds:2,bleed:2100,tick:1000,relay:true});return r;
 });
 await check('Inherited identity survives original tick, then clears as soon as no debt remains',async()=>{
  const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.inheritedTarget,hp=e.hp;const samples=[];for(const dt of [1000,1000,100]){s.updateMutations(dt);samples.push({dt,hp:e.hp,mark:{...s.marks.get(e)}});}return{hp,samples};});
  assert.equal(r.samples[0].mark.relay,true);assert.equal(r.samples[0].mark.bleed,1100);assert.equal(r.samples[1].mark.relay,undefined);assert.deepEqual(r.samples[2].mark,{seeds:2,bleed:0,tick:900});assert.equal(r.hp-r.samples[2].hp,10);return r;
 });
 await check('Ordinary replant removes origin without resetting original tick or adding a hit',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(90);s.marks.set(e,{seeds:0,bleed:1800,tick:700,relay:true});const hp=e.hp;s.hitEnemy(e,19,1,0,false,0,0,true);s.updateMutations(0);return{hpLost:hp-e.hp,mark:{...s.marks.get(e)}};});assert.equal(r.hpLost,19);assert.deepEqual(r.mark,{seeds:0,bleed:3100,tick:700});return r;
 });
 await check('Ordinary new marks preserve original object shape',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(90);s.hitEnemy(e,19,1,0,false,0,0,true);return{...s.marks.get(e)};});assert.deepEqual(r,{seeds:0,bleed:3100,tick:1000});return r;
 });
 await check('Eligible inherited debt wins over nearer ordinary wound and unmarked kill ticket in both selectors',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');window.earn();const ticket=window.foe(80),wound=window.brand(90),inherited=window.foe(108);s.marks.set(inherited,{seeds:0,bleed:2100,tick:1000,relay:true});window.inheritedTarget=inherited;window.ordinaryTarget=wound;const before=JSON.stringify([...s.marks.values()]);const a=s.findReaverPursuitChoice(),g=s.findReaverPursuitChoice(true);return{actual:a?.target===inherited,guide:g?.target===inherited,pulses:a?.pulses,pure:before===JSON.stringify([...s.marks.values()])};});assert.deepEqual(r,{actual:true,guide:true,pulses:2,pure:true});return r;
 });
 await check('Cleared inherited debt falls back to ordinary wound before kill ticket',async()=>{
  const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.marks.get(window.inheritedTarget).bleed=0;return{actual:s.findReaverPursuitChoice()?.target===window.ordinaryTarget,guide:s.findReaverPursuitChoice(true)?.target===window.ordinaryTarget};});assert.deepEqual(r,{actual:true,guide:true});return r;
 });
 await check('No Relay ownership retains old nearest-wound choice even with an inherited fixture flag',async()=>{
  await setup({relay:false});const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),w=window.brand(90),e=window.foe(108);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});return s.findReaverPursuitChoice()?.target===w;});assert.equal(r,true);return{nearestUnchanged:r};
 });
 await check('Inherited priority cannot bypass range, LOS or untargetable wake-up predicates',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),w=window.brand(90),far=window.foe(140),blocked=window.foe(108),waking=window.foe(105,0,200,1000);for(const e of [far,blocked,waking])s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});const clear=s.navigation.clearLine.bind(s.navigation);s.navigation.clearLine=(x,y,tx,ty)=>tx===blocked.x&&ty===blocked.y?false:clear(x,y,tx,ty);const a=s.findReaverPursuitChoice(),g=s.findReaverPursuitChoice(true);s.navigation.clearLine=clear;return{actual:a?.target===w,guide:g?.target===w,waking:waking.isTargetable};});assert.deepEqual(r,{actual:true,guide:true,waking:false});return r;
 });
 await check('Retreat and sideways movement cannot spend an inherited debt',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.foe(105);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});const attempts=[];for(const [x,y]of [[-1,0],[0,1],[0,0]]){p.moveIntent.set(x,y);attempts.push(s.tryReaverPursuit());}return{attempts,mark:{...s.marks.get(e)},hp:e.hp};});assert.deepEqual(r.attempts,[false,false,false]);assert.equal(r.mark.relay,true);assert.equal(r.hp,200);return r;
 });
 await check('Held attack never auto-pays inherited debt',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(105);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});window.attack(true);return{pursuing:s.player.isPursuing,mark:{...s.marks.get(e)},hp:e.hp};});assert.equal(r.pursuing,false);assert.equal(r.mark.relay,true);assert.equal(r.hp,200);return r;
 });
 await check('Real commitment consumes origin once even when seeds retain the mark object',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(105);s.marks.set(e,{seeds:1,bleed:2100,tick:1000,relay:true});s.paused=false;const first=s.tryReaverPursuit(),second=s.tryReaverPursuit();s.paused=true;return{first,second,mark:{...s.marks.get(e)},paid:s.pursuitBrand?.pulses,hp:e.hp};});assert.equal(r.first,true);assert.equal(r.second,false);assert.deepEqual(r.mark,{seeds:1,bleed:0,tick:1000});assert.equal(r.paid,2);assert.equal(r.hp,200);return r;
 });
 await check('Next inherited target remains readable during old hit outcome, with honest recovery/release/ready stages',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.foe(105);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});s.bloodFocus.begin(2);s.bloodFocus.resolve('hit');const samples=[];for(const [timer,held,moving]of [[180,false,true],[180,true,true],[0,false,true],[0,false,false]]){p.attackTimer=timer;p.wantAttack=held;p.moveIntent.set(moving?1:0,0);s.updateHud();samples.push({stage:s.pursuitCue?.stage,text:s.pursuitText.text,target:s.pursuitCue?.target===e});}window.__seedDev.saveSystem.setLanguage('en');p.moveIntent.set(1,0);s.updateHud();return{samples,en:s.pursuitText.text};});assert.deepEqual(r.samples.map(s=>s.stage),['recover','release','ready','move']);for(const s of r.samples){assert.equal(s.target,true);assert.ok(s.text.includes('接力血债'));}assert.ok(r.en.includes('INHERITED DEBT'));return r;
 });
 await check('Hooked marker is persistent in comfort and motion modes with no per-frame object growth',async()=>{
  await setup({motion:false});const r=await page.evaluate(async()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(105),normal=window.brand(70);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});window.inheritedTarget=e;s.updateMutations(0);s.player.moveIntent.set(1,0);s.updateHud();const count=s.children.length,commands=s.marksInk.commandBuffer.length,mark=JSON.stringify(s.marks.get(e));for(let i=0;i<100;i++)s.updateMutations(0);return{count,after:s.children.length,commands,afterCommands:s.marksInk.commandBuffer.length,unchanged:mark===JSON.stringify(s.marks.get(e)),target:{x:e.x,y:e.y},normal:{x:normal.x,y:normal.y}};});assert.equal(r.count,r.after);assert.ok(r.commands>0);assert.equal(r.commands,r.afterCommands);assert.equal(r.unchanged,true);await page.screenshot({path:path.join(OUT,'relay-comfort.png')});await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');window.__seedDev.saveSystem.setFeedback({impactMotion:true});s.updateMutations(0);s.updateHud();});await page.screenshot({path:path.join(OUT,'relay-motion.png')});return r;
 });
 await check('Real paused frames freeze debt and keep the essential marker drawn',async()=>{
  const before=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{mark:{...s.marks.get(window.inheritedTarget)},commands:s.marksInk.commandBuffer.length};});await page.waitForTimeout(220);const after=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{mark:{...s.marks.get(window.inheritedTarget)},commands:s.marksInk.commandBuffer.length};});assert.deepEqual(after,before);return{before,after};
 });
 await check('Death removes inherited identity and its drawing',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(105);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});s.updateMutations(0);s.hitEnemy(e,500,1,0,false,0,0);s.updateMutations(0);return{alive:e.isAlive,marks:s.marks.size,commands:s.marksInk.commandBuffer.length};});assert.deepEqual(r,{alive:false,marks:0,commands:0});return r;
 });
 await check('Floor transition clears old inherited marks, ink, reservation and opportunity',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(105);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});s.updateMutations(0);s.updateHud();s.beginNextFloor();return{marks:s.marks.size,commands:s.marksInk.commandBuffer.length,cue:!!s.pursuitCue,paid:!!s.pursuitBrand};});assert.deepEqual(r,{marks:0,commands:0,cue:false,paid:false});return r;
 });
 await check('End of run clears inherited ink immediately, rejects subsequent grants',async()=>{
  await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.foe(105),source=window.foe(90);s.marks.set(e,{seeds:0,bleed:2100,tick:1000,relay:true});s.updateMutations(0);s.endRun(true);return{marks:s.marks.size,commands:s.marksInk.commandBuffer.length,grant:!!s.relayBloodbrand(source,2)};});assert.deepEqual(r,{marks:0,commands:0,grant:false});return r;
 });
 await check('Scene restart cannot retain a previous inherited target',async()=>{await setup();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{marks:s.marks.size,cue:!!s.pursuitCue,paid:!!s.pursuitBrand};});assert.deepEqual(r,{marks:0,cue:false,paid:false});return r;});
 await check('No unhandled runtime errors',()=>{assert.deepEqual(errors,[]);return{errors};});
 }finally{fs.writeFileSync(path.join(OUT,'identity-browser.json'),JSON.stringify({scope:'Explicit engine fixtures for identity/readability/lifecycle. Not natural input or human fun proof.',checks,errors},null,2));await ctx.close();await b.close();}
 console.log(`Relay identity browser: ${checks.length}/${checks.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
