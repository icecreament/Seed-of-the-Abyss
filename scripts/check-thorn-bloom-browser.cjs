'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const OUT=path.resolve(process.env.SEED_BLOOM_OUTPUT||'output/thorn-bloom-v1/checks');fs.mkdirSync(OUT,{recursive:true});
let page,browser;const checks=[],errors=[];
async function check(name,fn){
 if(process.env.SEED_BLOOM_FILTER&&!name.includes(process.env.SEED_BLOOM_FILTER))return;
 try{const detail=await fn();checks.push({name,passed:true,detail});console.log('PASS',name);}
 catch(e){const state=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{paused:s.paused,ended:s.ended,hp:s.player?.stats.hp,text:s.pursuitText?.text,marks:[...s.marks].map(([e,m])=>({hp:e.hp,x:e.x,y:e.y,seeds:m.seeds,active:e.active,targetable:e.isTargetable})),hits:window.bloomHits,audio:window.bloomAudio,frames:window.bloomFrames?.map(({image,...v})=>v)};}).catch(()=>null);checks.push({name,passed:false,error:String(e.stack),state});await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw e;}
}
async function boot(p){p.on('pageerror',e=>errors.push(String(e.stack)));await p.goto(process.env.SEED_TEST_URL||'http://127.0.0.1:5173');await p.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());}
async function start(live=false,id='thorn'){
 for(const key of ['Space','q','Shift','w','a','s','d','Escape'])await page.keyboard.up(key);
 await page.evaluate(id=>{const g=window.__seedGame;window.previousBloom=g.scene.getScene('Run').player;window.__seedDev.saveSystem.setSelectedClass(id);window.__seedDev.saveSystem.setLanguage('zh');window.__seedDev.saveSystem.setFeedback({impactMotion:false,sfxVolume:.55});for(const key of ['Menu','Run','Death','ClassSelect','Settings'])g.scene.stop(key);g.scene.start('Run');},id);
 await page.waitForFunction(id=>{const s=window.__seedGame.scene.getScene('Run');return s?.player&&s.player!==window.previousBloom&&s.player.classId===id&&s.cameras.main.fadeEffect.alpha===0;},id);
 await page.evaluate(async live=>{
  const s=window.__seedGame.scene.getScene('Run'),p=s.player,{Enemy}=await import('/src/entities/Enemy.ts');
  s.enemies.clear(true,true);s.spawnTimer=s.floorTimer=-1e9;s.paused=!live;if(!live)s.physics.world.pause();
  p.setPosition(1100,950);p.body.reset(p.x,p.y);p.setVelocity(0,0);p.stats.critChance=0;p.moveIntent.set(0,0);p.aimIntent.set(1,0);p.updateEntity(1);
  s.cameras.main.stopFollow();s.cameras.main.centerOn(p.x,p.y);
  window.bloomHits=[];window.bloomAudio=[];window.bloomFrames=[];window.inBloom=false;
  const originals=s.__bloomOriginals||(s.__bloomOriginals={hit:s.hitEnemy,nova:s.fireNova});
  const hit=originals.hit.bind(s),nova=originals.nova.bind(s),play=s.audio.play.bind(s.audio);
  s.hitEnemy=(e,...a)=>{const hp=e.hp,result=hit(e,...a);window.bloomHits.push({damage:hp-e.hp,requested:a[0],basic:!!a[6],seed:window.inBloom&&a[4]===0&&a[5]===0&&!a[6],time:s.timeAlive,x:e.x,y:e.y});return result;};
  s.fireNova=(...a)=>{window.inBloom=true;try{return nova(...a);}finally{window.inBloom=false;}};
  s.audio.play=(...a)=>{window.bloomAudio.push(a[0]);return play(...a);};
  window.bloomTarget=(dx=180,dy=0,count=0,elite=false)=>{const e=new Enemy(s,p.x+dx,p.y+dy,elite?'brute':'crawler',1,elite);e.hp=e.maxHp=600;e.speed=0;s.enemies.add(e);for(let n=0;n<count;n++)s.hitEnemy(e,10,0,0,false,0,0,true);return e;};
 },live);
}
async function seeded(count=3,dx=220){return page.evaluate(({count,dx})=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('thorn_seeds');window.bloomEnemy=window.bloomTarget(dx,0,count);s.updateMutations(0);s.updateHud();return{hp:window.bloomEnemy.hp,damage:s.player.stats.damage};},{count,dx});}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  page=await browser.newPage({viewport:{width:1280,height:720},locale:'zh-CN'});await boot(page);
  await check('未选花冢不植种，技能/非普攻/致命命中不补种',async()=>{
   await start();return page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),a=window.bloomTarget();s.hitEnemy(a,10,0,0,false,0,0,true);if(s.marks.has(a))throw Error('planted without mutation');s.build.acquire('thorn_seeds');s.hitEnemy(a,10,0,0,false,0,0);if(s.marks.has(a))throw Error('non-basic planted');const b=window.bloomTarget();s.hitEnemy(b,9999,0,0,false,0,0,true);if(s.marks.has(b))throw Error('lethal planted');return{hp:a.hp,dead:!b.isAlive,marks:s.marks.size};});
  });
  await check('实际普攻最多3层，满种音和开芽只在过满阈值时一次触发',async()=>{
   await start();await seeded(1);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.bloomEnemy;for(let i=0;i<6;i++)s.hitEnemy(e,10,0,0,false,0,0,true);return{seeds:s.marks.get(e).seeds,sounds:window.bloomAudio.filter(x=>x==='seed').length,effects:s.combat.effects.filter(x=>x.kind==='ripe').length,hp:e.hp};});assert.deepEqual(r,{seeds:3,sounds:1,effects:1,hp:530});return r;
  });
  await check('种荚与真实血条/精英标签分开，1/2/3层具有固定槽位',async()=>{
   await start();const r=await page.evaluate(async()=>{const s=window.__seedGame.scene.getScene('Run'),{seedMarkLayout}=await import('/src/systems/ThornBloom.ts');s.build.acquire('thorn_seeds');const rows=[];for(const [i,n]of [1,2,3].entries()){const e=window.bloomTarget(70+i*110,i===1?-45:20,n,true);e.setTint(0xffc4a8);e.updateElitePresentation();const g=seedMarkLayout(e.x,e.y,e.hitRadius,n);const b=e.duelLabel.getBounds();rows.push({count:n,slots:g.slots.length,hpRight:e.x+14,podLeft:g.bounds.left,podTop:g.bounds.top,labelBottom:b.bottom,body:[e.body.width,e.body.height]});}s.updateMutations(0);s.updateHud();return rows;});for(const x of r){assert.ok(x.podLeft>x.hpRight);assert.ok(x.podTop>x.labelBottom);assert.equal(x.slots,3);}await page.screenshot({path:path.join(OUT,'seed-marks-after.png')});return r;
  });
  await check('真实已植种/满种数与Q冷却提示同步，不提前承诺可引爆',async()=>{
   await start();await seeded(3);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.bloomTarget(260,0,1);s.updateHud();const ready=s.pursuitText.text;p.wantSkill=true;p.updateEntity(1);p.wantSkill=false;s.updateHud();const cool=s.pursuitText.text;return{ready,cool,cooldown:p.cooldownRemaining('skill')};});assert.ok(r.ready.includes('植种 2')&&r.ready.includes('满种 1')&&r.ready.includes('Q 引爆'));assert.ok(!r.cool.includes('Q 引爆')&&r.cool.includes('6.0s'));assert.equal(r.cooldown,6000);return r;
  });
  await check('每层原9/18/27伤害，暴击不再乘；露核仍按原取整',async()=>{
   const rows=[];for(const [count,exposed]of [[1,false],[2,false],[3,false],[3,true]]){await start();await seeded(count);rows.push(await page.evaluate(exposed=>{const s=window.__seedGame.scene.getScene('Run'),e=window.bloomEnemy,before=e.hp;if(exposed)Object.defineProperty(e,'incomingDamageMultiplier',{value:1.25});s.player.stats.critChance=1;window.bloomHits=[];s.fireNova();return{damage:before-e.hp,seeds:s.marks.get(e)?.seeds||0,hits:window.bloomHits.filter(h=>h.seed).length};},exposed));}assert.deepEqual(rows.map(r=>r.damage),[9,18,27,33]);assert.ok(rows.every(r=>r.seeds===0&&r.hits===1));return rows;
  });
  await check('引爆不新增邻敌AOE、不重植种、不从标记本身回血',async()=>{
   await start();await seeded(3);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.bloomEnemy,n=window.bloomTarget(245,0,0);p.stats.hp=40;p.stats.lifesteal=.1;const hp=p.stats.hp,before=e.hp,other=n.hp;s.fireNova();const after=p.stats.hp;for(let i=0;i<30;i++)s.combat.update(16,p,false);return{damage:before-e.hp,other:other-n.hp,heal:after-hp,postEffectsHp:p.stats.hp,seeds:s.marks.get(e)?.seeds||0};});assert.equal(r.damage,27);assert.equal(r.other,0);assert.equal(r.heal,2);assert.equal(r.postEffectsHp,42);assert.equal(r.seeds,0);return r;
  });
  await check('原跨距离/隔墙引爆规则不改，纯提示不制造射程限制',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('thorn_seeds');const e=window.bloomTarget(600,0,3),hp=e.hp;const rect={x:s.player.x+280,y:s.player.y-50,w:32,h:100};s.wallRects.push(rect);s.updateHud();const label=s.pursuitText.text;s.fireNova();return{distance:e.x-s.player.x,damage:hp-e.hp,label};});assert.equal(r.damage,27);assert.ok(r.label.includes('植种 1'));return r;
  });
  await check('零种子时仍为原220%近身震退和8枚70%短种刺，无引爆成功反馈',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.bloomTarget(70),hp=e.hp;s.build.acquire('thorn_seeds');s.fireNova();return{damage:hp-e.hp,shots:s.projectiles.map(p=>({damage:p.damage,basic:p.basic,life:p.life})),bloomSounds:window.bloomAudio.filter(x=>x==='bloom').length,effects:s.combat.effects.filter(x=>x.kind==='podburst').length};});assert.equal(r.damage,22);assert.equal(r.shots.length,8);assert.ok(r.shots.every(x=>x.damage===7&&!x.basic&&Math.abs(x.life-160/480*1000)<1e-6));assert.equal(r.bloomSounds,0);assert.equal(r.effects,0);return r;
  });
  await check('不接受伤害的目标不播放虚构引爆命中，消费规则保持原样',async()=>{
   await start();await seeded(3);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),e=window.bloomEnemy;Object.defineProperty(e,'isTargetable',{value:false});s.updateHud();const label=s.pursuitText.text,hp=e.hp;s.fireNova();return{damage:hp-e.hp,seeds:s.marks.get(e).seeds,label,sounds:window.bloomAudio.filter(x=>x==='bloom').length,bursts:s.combat.effects.filter(x=>x.kind==='podburst').length};});assert.deepEqual(r,{damage:0,seeds:0,label:'',sounds:0,bursts:0});return r;
  });
  await check('三歧真实侧向种刺仍可植种，三弹不提高上限/倍率',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('thorn_seeds');s.build.acquire('thorn_fork');const e=window.bloomTarget(50),hp=e.hp;s.tryPlayerAttack(false);const shots=s.projectiles.map(p=>p.damage);s.updateProjectiles(180);return{shots,damage:hp-e.hp,seeds:s.marks.get(e)?.seeds,fullSounds:window.bloomAudio.filter(x=>x==='seed').length};});assert.deepEqual(r.shots,[10,5,5]);assert.equal(r.damage,20);assert.equal(r.seeds,3);assert.equal(r.fullSounds,1);return r;
  });
  await check('引爆立即清掉旧种荚，批量命中反馈一次且不叠加停顿',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('thorn_seeds');for(let i=0;i<5;i++)window.bloomTarget(200+i*25,0,3);s.updateMutations(0);const commands=s.marksInk.commandBuffer.length;s.paused=false;s.physics.world.resume();s.fireNova();return{commands,after:s.marksInk.commandBuffer.length,hitstop:s.hitStopMs,sounds:window.bloomAudio.filter(x=>x==='bloom').length,bursts:s.combat.effects.filter(x=>x.kind==='podburst').length};});assert.ok(r.commands>0);assert.equal(r.after,0);assert.equal(r.hitstop,36);assert.equal(r.sounds,1);assert.equal(r.bursts,5);return r;
  });
  await check('提示500次更新不增加对象，不改生命/冷却/位置；四倍率中英不溢出',async()=>{
   await start();await seeded(3);const rows=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,initial={hp:p.stats.hp,enemy:window.bloomEnemy.hp,skill:p.cooldownRemaining('skill'),x:p.x,y:p.y},children=s.children.length;for(let i=0;i<500;i++){s.updateMutations(0);s.updateHud(0);}const after={hp:p.stats.hp,enemy:window.bloomEnemy.hp,skill:p.cooldownRemaining('skill'),x:p.x,y:p.y};return{growth:s.children.length-children,initial,after,width:s.pursuitText.width};});assert.equal(rows.growth,0);assert.deepEqual(rows.initial,rows.after);assert.ok(rows.width<800);
   const layouts=[];for(const lang of ['zh','en']){await page.evaluate(async lang=>{const {i18n}=await import('/src/i18n/i18n.ts');i18n.setLang(lang);},lang);for(const scale of [.75,1,1.5,2]){layouts.push(await page.evaluate(async scale=>{const s=window.__seedGame.scene.getScene('Run'),{applyRenderScale}=await import('/src/game/config.ts');applyRenderScale(s.game,scale);s.updateHud(0);const b=s.pursuitText.getBounds(),c=s.cameras.main;return{scale,text:s.pursuitText.text,width:s.pursuitText.width,buffer:[s.game.canvas.width,s.game.canvas.height],x:(c.width/2+(b.x-c.width/2)*c.zoom)/scale,y:(c.height/2+(b.y-c.height/2)*c.zoom)/scale};},scale));}}assert.ok(layouts.every(x=>x.width<800&&x.x>=0&&x.x+x.width<=1280&&x.y>=0&&x.y<720));for(const x of layouts)assert.deepEqual(x.buffer,[1280*x.scale,720*x.scale]);await page.evaluate(async()=>{const {applyRenderScale}=await import('/src/game/config.ts');applyRenderScale(window.__seedGame,1);});return{...rows,layouts};
  });
  await check('暂停隐藏行动提示，恢复保留原种层；换层/死亡/重开不继承标记',async()=>{
   await start();await seeded(3);const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.paused=false;s.physics.world.resume();s.togglePause();const paused=s.pursuitText.text;s.togglePause();s.updateHud();const restored=s.pursuitText.text;s.beginNextFloor();s.updateHud();const floor={marks:s.marks.size,text:s.pursuitText.text};window.bloomEnemy=window.bloomTarget(220,0,3);s.updateHud();s.endRun(false);const ended=s.pursuitText.text;window.oldBloomInk=s.marksInk;return{paused,restored,floor,ended};});assert.equal(r.paused,'');assert.ok(r.restored.includes('植种 1'));assert.deepEqual(r.floor,{marks:0,text:''});assert.equal(r.ended,'');await start();const fresh=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{marks:s.marks.size,text:s.pursuitText.text,destroyed:!window.oldBloomInk.scene};});assert.deepEqual(fresh,{marks:0,text:'',destroyed:true});return{...r,fresh};
  });
  await check('舒适模式无额外震屏/闪白，局部特效80上限和战斗时钟清理有效',async()=>{
   await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;let shakes=0,flashes=0;s.cameras.main.shake=()=>shakes++;s.cameras.main.flash=()=>flashes++;s.build.acquire('thorn_seeds');for(let i=0;i<100;i++){s.combat.bloomRipe(p.x,p.y);s.combat.bloomDetonate(p.x,p.y,3,true);}const max=s.combat.effects.length;s.combat.update(500,p,false);return{max,left:s.combat.effects.length,shakes,flashes};});assert.deepEqual(r,{max:80,left:0,shakes:0,flashes:0});return r;
  });
  await check('觉醒花冠只叠加在真实引爆命中，未觉醒/拒伤不虚构花冠',async()=>{
   const rows=[];for(const [awake,blocked]of [[false,false],[true,false],[false,true],[true,true]]){
    await start();await seeded(3);rows.push(await page.evaluate(({awake,blocked})=>{const s=window.__seedGame.scene.getScene('Run'),e=window.bloomEnemy;s.player.setAwakened(awake);if(blocked)Object.defineProperty(e,'isTargetable',{value:false});const before=e.hp;s.fireNova();return{awake,blocked,damage:before-e.hp,flower:s.combat.effects.filter(e=>e.kind==='bloom').length,burst:s.combat.effects.filter(e=>e.kind==='podburst').length};},{awake,blocked}));
   }for(const x of rows){assert.equal(x.damage,x.blocked?0:27);assert.equal(x.flower,x.awake&&!x.blocked?1:0);assert.equal(x.burst,x.blocked?0:1);}return rows;
  });
  await check('真实键鼠普攻植满后按Q，仅实际引爆生成27点种子命中',async()=>{
   await start(true);await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.build.acquire('thorn_seeds');window.bloomEnemy=window.bloomTarget(145);window.bloomCapture=()=>{if(window.bloomFrames.length>=160)return;window.bloomFrames.push({time:performance.now(),hp:window.bloomEnemy.hp,seeds:s.marks.get(window.bloomEnemy)?.seeds||0,text:s.pursuitText.text,image:s.game.canvas.toDataURL('image/png')});};s.game.events.on('postrender',window.bloomCapture);});
   const aim=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),c=s.cameras.main,e=window.bloomEnemy,b=s.game.canvas.getBoundingClientRect();return{x:b.left+((e.x-c.scrollX)*c.zoom)*b.width/s.game.canvas.width,y:b.top+((e.y-c.scrollY)*c.zoom)*b.height/s.game.canvas.height};});await page.mouse.move(aim.x,aim.y);await page.keyboard.down('Space');await page.waitForFunction(()=>{const s=window.__seedGame.scene.getScene('Run');return s.marks.get(window.bloomEnemy)?.seeds===3;},{},{timeout:8000});await page.keyboard.up('Space');await page.waitForTimeout(450);
   await page.keyboard.press('q');await page.waitForFunction(()=>window.bloomHits.some(h=>h.seed&&h.damage===27),{},{timeout:3000});await page.waitForTimeout(450);
   const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.game.events.off('postrender',window.bloomCapture);return{hits:window.bloomHits.filter(h=>h.seed),fullSounds:window.bloomAudio.filter(x=>x==='seed').length,burstSounds:window.bloomAudio.filter(x=>x==='bloom').length,frames:window.bloomFrames,cooldown:s.player.cooldownRemaining('skill')};});assert.equal(r.hits.length,1);assert.equal(r.hits[0].damage,27);assert.equal(r.burstSounds,1);assert.ok(r.cooldown>5000);
   const dir=path.join(OUT,'frames');fs.mkdirSync(dir,{recursive:true});r.frames.forEach((f,i)=>fs.writeFileSync(path.join(dir,`${String(i).padStart(3,'0')}.png`),Buffer.from(f.image.split(',')[1],'base64')));fs.writeFileSync(path.join(OUT,'frame-times.json'),JSON.stringify(r.frames.map(({image,...x})=>x),null,2));delete r.frames;return r;
  });
  await check('模拟触屏技能键显示正确文案，并通过真实touch事件兑现已付种层',async()=>{
   const desktop=page,ctx=await browser.newContext({viewport:{width:960,height:540},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   try{page=await ctx.newPage();await boot(page);await start(true);await seeded(3,230);await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').pursuitText.text.includes('技能键 引爆'));const label=await page.evaluate(()=>window.__seedGame.scene.getScene('Run').pursuitText.text);const pt=await page.evaluate(()=>{const b=document.querySelector('canvas').getBoundingClientRect();return{x:b.left+b.width*1105/1280,y:b.top+b.height*665/720};});await page.touchscreen.tap(pt.x,pt.y);await page.waitForFunction(()=>window.bloomHits.some(h=>h.seed&&h.damage===27),{},{timeout:3000});await page.screenshot({path:path.join(OUT,'touch-bloom.png')});return{label,hits:await page.evaluate(()=>window.bloomHits.filter(h=>h.seed))};}
   catch(e){await page.screenshot({path:path.join(OUT,'touch-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(OUT,'touch-diagnostic.json'),JSON.stringify(await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');return{text:s.pursuitText.text,hits:window.bloomHits,skill:s.player.cooldownRemaining('skill'),virtual:s.virtual.skillPressed};}).catch(()=>null),null,2));throw e;}finally{await ctx.close();page=desktop;}
  });
  await check('其余职业原提示不被种子文案覆盖，重开没有遗留标记',async()=>{
   const rows=[];for(const id of ['warden','reaver','shade']){await start(false,id);rows.push(await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.updateHud();return{id:s.player.classId,text:s.pursuitText.text,marks:s.marks.size};}));}assert.ok(rows.every(x=>!x.text.includes('植种')&&x.marks===0));return rows;
  });
  await check('浏览器没有未处理异常或缺失动画',async()=>{assert.deepEqual(errors,[]);return{errors};});
 }finally{fs.writeFileSync(path.join(OUT,'bloom-browser.json'),JSON.stringify({checks,errors},null,2));await browser.close();}
 console.log(`Thorn bloom browser: ${checks.length}/${checks.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});



