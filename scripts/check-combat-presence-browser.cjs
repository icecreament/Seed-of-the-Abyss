"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const OUT=path.resolve(process.env.SEED_COMBAT_PRESENCE_OUTPUT||'output/combat-presence-v1/checks');fs.mkdirSync(OUT,{recursive:true});
const BEFORE=require('./fixtures/combat-presence-before.json'),GOLDEN=require('./fixtures/combat-presence-rgba.json').hashes,IDS=['warden','reaver','shade','thorn'],checks=[],errors=[];
const APPROVED_PORTRAITS=require('./fixtures/portrait-silhouette-v1-approved-rgba.json').hashes;
const sha=a=>crypto.createHash('sha256').update(Buffer.from(a)).digest('hex');let page;
async function check(name,f){try{const detail=await f();checks.push({name,passed:true,detail});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:String(e.stack)});await page.screenshot({path:path.join(OUT,`failure-${checks.length}.png`)}).catch(()=>{});throw e;}}
async function start(id,awake){
 await page.mouse.up();await page.keyboard.up('Space');
 await page.evaluate(id=>{window.restorePresenceObservation?.();const g=window.__seedGame;window.previousPlayer=g.scene.getScene('Run').player;window.__seedDev.saveSystem.setSelectedClass(id);for(const k of ['Menu','Run','Death'])g.scene.stop(k);g.scene.start('Run');},id);
 await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s.sys.isActive()&&s.player!==window.previousPlayer&&s.player.classId===id&&s.cameras.main.fadeEffect.alpha===0;},id);
 await page.evaluate(async awake=>{
  const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;p.stats.critChance=0;p.setPosition(1100,950);p.body.reset(p.x,p.y);s.cameras.main.stopFollow();s.cameras.main.centerOn(p.x,p.y);
  // Explicit cosmetic fixture: awaken just the renderer, not a combat mutation.
  p.setAwakened(awake);
  const {Enemy}=await import('/src/entities/Enemy.ts'),e=window.presenceEnemy=new Enemy(s,p.x+42,p.y,'crawler',1,false,0);e.hp=e.maxHp=1000;e.speed=0;e.updateAI=()=>null;s.enemies.add(e);e.body.reset(e.x,e.y);
  window.presenceFrames=[];window.presenceStrikes=[];window.presenceHits=[];
  const attack=s.tryPlayerAttack,hit=s.hitEnemy;
  s.tryPlayerAttack=function(...args){const count=s.attackCount,shots=s.projectiles.length;const result=attack.apply(this,args);if(s.attackCount>count)window.presenceStrikes.push({frame:p.frame.name,shots:s.projectiles.length-shots,cooldown:p.cooldownRemaining('attack'),attackPose:p.attackPoseTimer,attackAnim:p.anims.currentAnim.key,texture:p.texture.key});return result;};
  s.hitEnemy=function(...args){const before=args[0].hp,result=hit.apply(this,args);if(args[0]===e&&e.hp<before)window.presenceHits.push({damage:before-e.hp,frame:p.frame.name});return result;};
  window.restorePresenceObservation=()=>{s.tryPlayerAttack=attack;s.hitEnemy=hit;};
  const surface=document.createElement('canvas');surface.width=300;surface.height=220;const ctx=surface.getContext('2d');
  window.presenceCollector=()=>{if(window.presenceFrames.length>=80)return;const cam=s.cameras.main,sx=(p.x-cam.worldView.x)*cam.zoom,sy=(p.y-cam.worldView.y)*cam.zoom;ctx.drawImage(s.game.canvas,Math.round(sx-135),Math.round(sy-120),300,220,0,0,300,220);window.presenceFrames.push({time:performance.now(),frame:p.frame.name,anim:p.anims.currentAnim?.key,hp:e.hp,attacks:s.attackCount,x:p.x,y:p.y,png:surface.toDataURL('image/png').split(',')[1]});};
  s.game.events.on('postrender',window.presenceCollector);
 },awake);
}
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 page=await b.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(String(e.stack)));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
 await check('Actual eight atlases: only attack cells change, with real body-pose differences; other 80 cells are exact',async()=>{
  const rows=await page.evaluate(async old=>{const g=window.__seedGame,rows=[];for(const entry of old.assets.filter(a=>a.key.startsWith('hero_'))){const current=g.textures.get(entry.key).getSourceImage(),ctx=current.getContext('2d'),im=new Image();im.src='data:image/png;base64,'+entry.png;await im.decode();const c=document.createElement('canvas');c.width=448;c.height=32;const b=c.getContext('2d');b.drawImage(im,0,0);const frames=[];for(let frame=0;frame<14;frame++){const a=Array.from(ctx.getImageData(frame*32,0,32,32).data),before=b.getImageData(frame*32,0,32,32).data;let changed=0,bodyChanged=0;for(let n=0;n<1024;n++){if(a.slice(n*4,n*4+4).some((v,k)=>v!==before[n*4+k])){changed++;const x=n%32,y=Math.floor(n/32);if(x>=5&&x<=23&&y<=22)bodyChanged++;}}frames.push({frame,rgba:a,changed,bodyChanged});}rows.push({key:entry.key,size:[current.width,current.height],frames});}return rows;},BEFORE);
  const details=[];for(const row of rows){assert.deepEqual(row.size,[448,32]);const old=BEFORE.assets.find(a=>a.key===row.key);for(const f of row.frames){const hash=sha(f.rgba);if(f.frame>=8&&f.frame<=11){assert.notEqual(hash,old.frameSha256[f.frame]);assert.ok(f.changed>=25,`${row.key}/${f.frame}: not a substantive pose change`);if(f.frame<=10)assert.ok(f.bodyChanged>=20,`${row.key}/${f.frame}: body stayed static`);}else{assert.equal(hash,old.frameSha256[f.frame]);assert.equal(f.changed,0);}delete f.rgba;}details.push(row);}return details;
 });
 await check('Actual atlases retain registered combat RGBA; eight portraits match the explicitly approved silhouette-v1 revision',async()=>{
  const rows=await page.evaluate(keys=>keys.map(key=>{const c=window.__seedGame.textures.get(key).getSourceImage();return{key,rgba:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)};}),BEFORE.assets.map(a=>a.key));
  const details=[];for(const row of rows){const hash=sha(row.rgba),old=BEFORE.assets.find(a=>a.key===row.key);assert.equal(hash,row.key.startsWith('hero_')?GOLDEN[row.key]:APPROVED_PORTRAITS[row.key],row.key);details.push({key:row.key,rgbaSha256:hash});}return details;
 });
 await check('All 32 contact/carry/recovery cells keep both soles anchored and no forward/bottom geometry outside the cell',async()=>{
  const r=await page.evaluate(async()=>{const [{drawParasiticWarden},{drawReaver,drawShade,drawThorn},{drawAwakenedHero},{combatStance}]=await Promise.all([import('/src/assets/ParasiticWarden.ts'),import('/src/assets/AbyssHeroes.ts'),import('/src/assets/HeroAwakening.ts'),import('/src/assets/CombatStance.ts')]);const drawers={warden:drawParasiticWarden,reaver:drawReaver,shade:drawShade,thorn:drawThorn},rows=[];
   for(const id of ['warden','reaver','shade','thorn'])for(const awake of [false,true])for(let frame=8;frame<=11;frame++){
    // Wider draw domain prevents the normal 32px right/bottom clamp hiding clipped geometry.
    const outside=[],pc={w:64,h:64,p(x,y){if(x<0||y<0||x>=32||y>=32)outside.push([x,y]);},rect(x,y,w,h){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)this.p(xx,yy);}};
    if(awake)drawAwakenedHero(pc,id,frame,false);drawers[id](pc,frame);if(awake)drawAwakenedHero(pc,id,frame,true);
    const c=window.__seedGame.textures.get(`hero_${id}${awake?'_awakened':''}`).getSourceImage(),ctx=c.getContext('2d'),pose=combatStance(id,frame),left=11+pose.step,right=18-pose.step;
    rows.push({id,awake,frame,outside,sole:[ctx.getImageData(frame*32+left,28,1,1).data[3],ctx.getImageData(frame*32+right,28,1,1).data[3]],step:pose.step});
   }return rows;});for(const row of r){assert.deepEqual(row.outside,[],JSON.stringify(row));assert.deepEqual(row.sole,[255,255],JSON.stringify(row));}return r;
 });
 await check('Existing animation contract remains four ordered cells, native shot/swing cadence, nearest filtering and 32px body cells',async()=>{
  const rows=await page.evaluate(()=>{const g=window.__seedGame,ids=['warden','reaver','shade','thorn'];return ids.flatMap(id=>['','_awakened'].map(suffix=>{const key=`hero_${id}${suffix}`,a=g.anims.get(key+'_attack'),t=g.textures.get(key);return{id,key,frames:a.frames.map(f=>f.textureFrame),frameRate:a.frameRate,repeat:a.repeat,filter:t.source[0].scaleMode,size:[t.get(8).width,t.get(8).height]};}));});for(const r of rows){assert.deepEqual(r.frames,[8,9,10,11]);assert.equal(r.repeat,0);assert.equal(r.filter,1);assert.deepEqual(r.size,[32,32]);assert.ok(Math.abs(r.frameRate-4000/({warden:250,reaver:250,shade:240,thorn:210}[r.id]))<1e-8);}return rows;
 });
 for(const id of IDS)for(const awake of [false,true])await check(`${id}${awake?' awakened':''}: actual world click renders all four poses; damage/projectile starts in contact cell 8 without added delay`,async()=>{
  await start(id,awake);await page.waitForTimeout(100);const target=await page.evaluate(()=>{const c=window.__seedGame.scene.getScene('Run').cameras.main,e=window.presenceEnemy;return{x:(e.x-c.worldView.x)*c.zoom,y:(e.y-c.worldView.y)*c.zoom};});await page.mouse.move(target.x,target.y);const before=await page.evaluate(()=>{const p=window.__seedGame.scene.getScene('Run').player;return{stats:{...p.stats},body:[p.body.width,p.body.height,p.body.offset.x,p.body.offset.y],origin:[p.originX,p.originY],scale:[p.scaleX,p.scaleY]};});await page.mouse.down();await page.mouse.up();
  await page.waitForFunction(()=>{const s=window.__seedGame.scene.getScene('Run');return s.attackCount===1&&s.player.anims.currentAnim.key.endsWith('_idle')&&window.presenceHits.length===1;});await page.waitForTimeout(100);
  const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;s.game.events.off('postrender',window.presenceCollector);window.restorePresenceObservation();return{stats:{...p.stats},body:[p.body.width,p.body.height,p.body.offset.x,p.body.offset.y],origin:[p.originX,p.originY],scale:[p.scaleX,p.scaleY],strikes:window.presenceStrikes,hits:window.presenceHits,hp:window.presenceEnemy.hp,attacks:s.attackCount,frames:window.presenceFrames};});
  assert.deepEqual(r.stats,before.stats);assert.deepEqual(r.body,before.body);assert.deepEqual(r.origin,before.origin);assert.deepEqual(r.scale,before.scale);assert.equal(r.attacks,1);assert.equal(r.strikes.length,1);assert.equal(r.strikes[0].frame,8);assert.equal(r.strikes[0].texture,`hero_${id}${awake?'_awakened':''}`);assert.equal(r.hits.length,1);assert.equal(r.hits[0].damage,{warden:16,reaver:19,shade:15,thorn:10}[id]);if(id==='thorn')assert.equal(r.strikes[0].shots,1);else assert.equal(r.hits[0].frame,8);
  assert.deepEqual([...new Set(r.frames.filter(f=>f.anim.endsWith('_attack')).map(f=>f.frame))],[8,9,10,11]);const folder=path.join(OUT,'frames',id+(awake?'-awakened':''));fs.mkdirSync(folder,{recursive:true});for(let n=0;n<r.frames.length;n++){fs.writeFileSync(path.join(folder,String(n).padStart(3,'0')+'.png'),Buffer.from(r.frames[n].png,'base64'));delete r.frames[n].png;}fs.writeFileSync(path.join(folder,'timing.json'),JSON.stringify(r.frames,null,2));const count=r.frames.length;delete r.frames;return{...r,renderFrames:count,fixture:'Controlled non-attacking 1000HP foe (AI disabled only in this fixture); true mouse input and immediate original damage. Awakened is cosmetic-only, not an awakening mutation balance sample.'};
 });
 await check('No browser runtime exceptions',async()=>assert.deepEqual(errors,[]));
}finally{fs.writeFileSync(path.join(OUT,'combat-presence-browser-checks.json'),JSON.stringify({checks,errors,scope:'Actual atlas RGBA plus explicitly isolated geometry, non-attacking test target, cosmetic form, real mouse input and POST_RENDER combat frames. Does not prove natural balance, subjective appeal or physical touch devices.'},null,2));await b.close();console.log(`Combat presence browser: ${checks.filter(c=>c.passed).length}/${checks.length}`);}
})().catch(e=>{console.error(e);process.exitCode=1;});
