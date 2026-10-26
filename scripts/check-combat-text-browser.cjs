'use strict';
// Real mouse/Q combat in labelled stationary-target fixtures. Not natural balance/human fun.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{chromium}=require('playwright');
const OUT=path.resolve(process.env.SEED_COMBAT_TEXT_OUTPUT||'output/combat-text-v1/browser');fs.mkdirSync(OUT,{recursive:true});
const checks=[],errors=[];let page;
async function check(name,fn){try{const details=await fn();checks.push({name,passed:true,details});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:e.stack});await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw e;}}
async function start(id){
 await page.mouse.up();for(const k of ['Space','q','Shift','Escape'])await page.keyboard.up(k);
 await page.evaluate(id=>{const g=window.__seedGame;window.__seedDev.saveSystem.setSelectedClass(id);window.__seedDev.saveSystem.setFeedback({sfxVolume:0,impactMotion:true});for(const k of ['Menu','Run','Death','ClassSelect'])g.scene.stop(k);g.scene.start('Run');},id);
 await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player.classId===id&&s.cameras.main.fadeEffect.alpha===0;},id);
 await page.evaluate(async()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,{Enemy}=await import('/src/entities/Enemy.ts');s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;p.setPosition(1100,950);p.body.reset(p.x,p.y);p.setVelocity(0,0);p.stats.critChance=0;s.cameras.main.stopFollow();s.cameras.main.removeBounds();s.cameras.main.centerOn(1100,950);const e=window.textTarget=new Enemy(s,1144,950,'brute',1,false);e.hp=e.maxHp=500;e.speed=0;e.updateAI=()=>null;s.enemies.add(e);e.body.reset(e.x,e.y);e.body.moves=false;s.combatText.clear();window.textStartStats={...p.stats};});
 await page.waitForTimeout(35);
}
async function state(){return page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.textTarget;return{hp:e.hp,playerHp:p.stats.hp,attack:p.cooldownRemaining('attack'),damage:s.damageDealt,stats:{...p.stats},entries:s.combatText.pool.entries.map(o=>({id:o.id,text:o.text,kind:o.kind,age:o.age,x:o.x,y:o.y,target:o.owner===e,player:o.owner===p,font:s.combatText.labels.get(o.id)?.style.fontSize,stroke:s.combatText.labels.get(o.id)?.style.stroke,strokeThickness:s.combatText.labels.get(o.id)?.style.strokeThickness})),seeds:s.marks.get(e)?.seeds??0};});}
async function aim(){const pt=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),c=s.cameras.main,e=window.textTarget;return{x:(e.x-c.worldView.x)*c.zoom+c.x,y:(e.y-c.worldView.y)*c.zoom+c.y};});await page.mouse.move(pt.x,pt.y);return pt;}
async function attack(){await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').player.attackReady);const before=await state(),pt=await aim();await page.mouse.click(pt.x,pt.y);await page.waitForFunction(hp=>window.textTarget.hp<hp,before.hp);return {before,after:await state()};}
function exactEntry(result,kind){const lost=result.before.hp-result.after.hp;const e=result.after.entries.find(e=>e.target&&e.kind===kind&&e.text.replace('!','')===String(lost));assert.ok(e,JSON.stringify(result));assert.equal(e.stroke,'#070a10');assert.equal(e.strokeThickness,3);return{lost,entry:e};}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 page=await browser.newPage({viewport:{width:1280,height:720},locale:'zh-CN'});page.on('pageerror',e=>errors.push(e.stack));await page.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 for(const id of ['warden','reaver','shade','thorn']){
  await start(id);
  await check(id+': real mouse ordinary hit shows original HP loss at 12px',async()=>{const r=await attack(),entry=exactEntry(r,'normal');assert.equal(entry.entry.font,'12px');assert.equal(r.after.stats.damage,r.before.stats.damage);return entry;});
  await check(id+': real forced-critical fixture preserves crit damage and uses 16px',async()=>{await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.stats.critChance=1;s.combatText.clear();});const r=await attack(),entry=exactEntry(r,'critical');assert.equal(entry.entry.font,'16px');assert.ok(entry.entry.text.endsWith('!'));return entry;});
  await start(id);
  await check(id+': actual signature chain produces an 18px payoff only on real HP loss',async()=>{
   if(id==='warden'){
    await aim();await page.keyboard.press('q');await page.waitForFunction(()=>{const p=window.__seedGame.scene.getScene('Run').player;return p.hasBulwark&&!p.isInvulnerable;});
    await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.textTarget;e.damage=20;e.canDealContactDamageTo=()=>true;s.onPlayerTouchEnemy(e);});
    await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').player.hitFlashTimer<=0);
    const r=await attack(),e=exactEntry(r,'payoff');assert.equal(e.entry.font,'18px');assert.ok(r.after.entries.some(e=>e.player&&e.kind==='hurt'&&e.font==='14px'));return e;
   }
   if(id==='reaver'){
    await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('reaver_bleed');s.build.acquire('reaver_relay');});
    await attack();const r=await attack(),e=exactEntry(r,'payoff');assert.equal(e.entry.font,'18px');return e;
   }
   if(id==='shade'){
    await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.textTarget;e.setPosition(s.player.x+128,s.player.y);e.body.reset(e.x,e.y);});
    await aim();await page.keyboard.press('q');await page.waitForFunction(()=>{const p=window.__seedGame.scene.getScene('Run').player;return p.isStealthed&&!p.isDashing;});
    const r=await attack(),e=exactEntry(r,'payoff');assert.equal(e.entry.font,'18px');assert.ok(e.lost>15);return e;
   }
   await page.evaluate(()=>window.__seedGame.scene.getScene('Run').build.acquire('thorn_seeds'));
   for(let i=0;i<3;i++)await attack();await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').marks.get(window.textTarget)?.seeds===3);
   const before=await state();await aim();await page.keyboard.press('q');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').marks.get(window.textTarget)?.seeds===0);
   const after=await state(),e=after.entries.find(e=>e.target&&e.kind==='payoff');assert.ok(e,JSON.stringify(after));assert.equal(e.font,'18px');assert.equal(Number(e.text),27);assert.ok(before.hp-after.hp>=27);return {before:before.hp,after:after.hp,payoff:e};
  });
  await page.screenshot({path:path.join(OUT,id+'-signature.png')});
 }
 await check('Actual Escape pause preserves labels; resume expires them on combat time',async()=>{
  await start('warden');await attack();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').paused);const before=await state();assert.ok(before.entries.length);await page.waitForTimeout(750);const during=await state();assert.deepEqual(during.entries,before.entries);await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').paused);await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').combatText.pool.entries.length===0);return {pausedLabels:before.entries.length,preservedMs:750};
 });
 await check('A real critical hit freezes text on the original hit-stop, then resumes aging',async()=>{
  await start('warden');await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.player.stats.critChance=1;window.textFreezeFrames=[];window.textFreezeCollector=()=>{const e=s.combatText.pool.entries.find(e=>e.kind==='critical');if(e)window.textFreezeFrames.push({age:e.age,stop:s.hitStopMs});};s.game.events.on('postrender',window.textFreezeCollector);});
  await attack();await page.waitForTimeout(120);const rows=await page.evaluate(()=>{window.__seedGame.events.off('postrender',window.textFreezeCollector);return window.textFreezeFrames;});
  const frozen=rows.filter(r=>r.stop>0);assert.ok(frozen.length>0,JSON.stringify(rows));assert.ok(frozen.every(r=>r.age===0),JSON.stringify(rows));assert.ok(rows.some(r=>r.stop===0&&r.age>0));return {frozenFrames:frozen.length,samples:rows};
 });
 await check('Mutation choice freezes text and actual option input clears it on the next floor',async()=>{
  await start('warden');await attack();await page.evaluate(()=>window.__seedGame.scene.getScene('Run').openMutationChoice());await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').choosing);const before=await state();assert.ok(before.entries.length);await page.waitForTimeout(750);const during=await state();assert.deepEqual(during.entries,before.entries);await page.keyboard.press('1');await page.waitForFunction(()=>!window.__seedGame.scene.getScene('Run').choosing);const count=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').combatText.pool.entries.length);assert.equal(count,0);return {frozenLabels:before.entries.length,clearedOnAdvance:count};
 });
 await check('Synthetic display stress is capped at 32 actual Text objects, protects hurt, never changes HP',async()=>{
  await start('thorn');return page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),v=s.combatText,hp=s.player.stats.hp;for(let i=0;i<100;i++)v.show({x:i*250,y:950,text:'1',color:'#fff',kind:'normal'});const count=v.labels.size;v.show({x:30000,y:950,text:'-5',color:'#f99',kind:'hurt',owner:s.player});if(count!==32||v.labels.size!==32||v.pool.entries.length!==32||!v.pool.entries.some(e=>e.kind==='hurt'))throw Error('Unbounded text or rejected hurt');if(s.player.stats.hp!==hp)throw Error('Display mutated HP');return{count,hp,synthetic:true};});
 });
 await check('Floor transitions and scene shutdown destroy all pooled Text objects and owner references',async()=>{
  const floor=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),v=s.combatText,labels=[...v.labels.values()];s.beginNextFloor();return{count:v.pool.entries.length,map:v.labels.size,aliveOld:labels.filter(o=>!!o.scene).length};});assert.deepEqual(floor,{count:0,map:0,aliveOld:0});
  const stop=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),v=s.combatText;v.show({x:1000,y:950,text:'8',color:'#fff',kind:'normal',owner:s.player});const labels=[...v.labels.values()];window.__seedGame.scene.stop('Run');return{count:v.pool.entries.length,map:v.labels.size,aliveOld:labels.filter(o=>!!o.scene).length};});assert.deepEqual(stop,{count:0,map:0,aliveOld:0});return{floor,stop};
 });
 await check('Comfort and OS reduced-motion keep feedback visible with no rise; display fixture only',async()=>{
  await start('warden');const rows=[];for(const mode of ['os','setting']){
   await page.emulateMedia({reducedMotion:mode==='os'?'reduce':'no-preference'});
   const r=await page.evaluate(mode=>{const s=window.__seedGame.scene.getScene('Run');window.__seedDev.saveSystem.setFeedback({impactMotion:mode!=='setting'});s.paused=true;s.physics.world.pause();const v=s.combatText;v.clear();v.show({x:1100,y:920,text:'16',color:'#fff',kind:'critical'});const e=v.pool.entries[0],label=v.labels.get(e.id),y=label.y;v.update(200);return{mode,y,afterY:label.y,alpha:label.alpha,age:e.age,size:label.style.fontSize};},mode);assert.equal(r.afterY,r.y);assert.equal(r.age,200);assert.equal(r.size,'16px');assert.ok(r.alpha>0);rows.push(r);
  }await page.emulateMedia({reducedMotion:'no-preference'});return rows;
 });
 await check('All 44 static non-portrait textures and eight approved portraits remain exact RGBA',async()=>{
  const expected=require('./fixtures/portrait-silhouette-v1.json').nonPortraitTextures,portraits=require('./fixtures/portrait-silhouette-v1-approved-rgba.json').hashes;
  const rows=await page.evaluate(keys=>keys.map(key=>{const c=window.__seedGame.textures.get(key).getSourceImage();return{key,width:c.width,height:c.height,rgba:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)};}),[...Object.keys(expected),...Object.keys(portraits)]);
  for(const r of rows){const h=crypto.createHash('sha256').update(Buffer.from(r.rgba)).digest('hex');if(expected[r.key]){assert.equal(h,expected[r.key].sha256,r.key);assert.equal(r.width,expected[r.key].width);assert.equal(r.height,expected[r.key].height);}else assert.equal(h,portraits[r.key],r.key);}return{nonPortraits:Object.keys(expected).length,portraits:Object.keys(portraits).length};
 });
 await check('No unhandled browser errors',()=>assert.deepEqual(errors,[]));
 }finally{fs.writeFileSync(path.join(OUT,'combat-text-browser.json'),JSON.stringify({checks,errors,scope:'Real mouse/Q signature chains with explicitly edited stationary targets/build/crit probability; display-only stress/lifecycle/comfort fixtures. Not human fun, natural balance or physical-device acceptance.'},null,2));await browser.close();}
 console.log('Combat text browser: '+checks.length+'/'+checks.length);
})().catch(e=>{console.error(e);process.exitCode=1;});
