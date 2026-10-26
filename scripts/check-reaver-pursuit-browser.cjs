'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = path.resolve(process.env.SEED_REAVER_OUTPUT || 'output/reaver-pursuit-v1/checks');
fs.mkdirSync(OUT, { recursive: true });
let page;
const checks = [], errors = [];
async function check(name, fn) {
  if (process.env.SEED_REAVER_FILTER && !name.includes(process.env.SEED_REAVER_FILTER)) return;
  try {
    const detail = await fn(); checks.push({ name, passed: true, detail }); console.log('PASS', name);
  } catch (e) {
    const state = await page.evaluate(() => {
      const s = window.__seedGame.scene.getScene('Run'), p = s.player;
      return { hp:p.stats.hp, position:[p.x,p.y], pursuit:p.pursuit, attacks:s.attackCount, paused:s.paused, trace:window.trace };
    }).catch(() => null);
    checks.push({ name, passed:false, error:String(e.stack), state });
    await page.screenshot({ path:path.join(OUT,'failure.png') }).catch(() => {});
    throw e;
  }
}
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
    window.finish=()=>{const direction=p.consumePursuitStrike();if(direction)window.attack(false,direction);return direction;};
  }, live);
  await page.mouse.move(800,360);
}
(async()=>{
  const b=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-dev-shm-usage']});
  const ctx=await b.newContext({viewport:{width:1280,height:720}});
  page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.stack));
  try {
    await page.goto('http://127.0.0.1:5173');
    await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());
    await check('真实击杀授予一次追斩，普通命中不授予，四职业隔离',async()=>{
      const rows=[];
      for(const id of ['reaver','warden','shade','thorn']){
        await start(id);rows.push(await page.evaluate(()=>{
          const s=window.__seedGame.scene.getScene('Run'),p=s.player,e=window.foe(45);
          s.hitEnemy(e,1,1,0,false,0,0,true);const hit=p.pursuitAvailable;
          window.earn();return{id:p.classId,hit,kill:p.pursuitAvailable,window:p.pursuitRemaining};
        }));
      }
      assert.ok(rows.every(r=>!r.hit&&r.kill===(r.id==='reaver')&&r.window===(r.id==='reaver'?1200:0)));return rows;
    });
    await check('新按键才追步，完成前无伤害，完成后只打一记原19伤害普攻',async()=>{
      await start();const r=await page.evaluate(()=>{
        const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe(110);
        const stats={...p.stats};window.attack();const during={moving:p.isPursuing,hp:e.hp,attacks:s.attackCount,invuln:p.isInvulnerable};
        window.step();const direction=window.finish();window.finish();
        return{during,after:{hp:e.hp,attacks:s.attackCount,active:p.isPursuing,x:p.x},direction,statsUnchanged:JSON.stringify(stats)===JSON.stringify(p.stats),trace:window.trace};
      });assert.deepEqual(r.during,{moving:true,hp:200,attacks:0,invuln:false});assert.equal(r.after.hp,181);assert.equal(r.after.attacks,1);assert.equal(r.after.active,false);assert.ok(r.statsUnchanged);assert.deepEqual(r.direction,{x:1,y:0});return r;
    });
    await check('持续长按只普通出刀，不消费机会或自动移动',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe();window.attack(true);return{active:p.isPursuing,available:p.pursuitAvailable,hp:e.hp,attacks:s.attackCount};});
      assert.deepEqual(r,{active:false,available:true,hp:200,attacks:1});return r;
    });
    await check('刀内有敌人优先普通斩，不越过它追后排',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const near=window.foe(45),far=window.foe(110);window.attack();return{active:p.isPursuing,available:p.pursuitAvailable,hp:[near.hp,far.hp],attacks:s.attackCount};});
      assert.deepEqual(r,{active:false,available:true,hp:[181,200],attacks:1});return r;
    });
    await check('站定/后退/横移/无目标/出场预警不会拉人',async()=>{
      const rows=[];for(const test of ['stand','retreat','side','empty','wake']){await start();rows.push(await page.evaluate(test=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();if(test!=='empty')window.foe(110,0,200,test==='wake'?450:0);p.moveIntent.set(test==='stand'?0:test==='retreat'?-1:test==='side'?0:1,test==='side'?1:0);window.attack();return{test,active:p.isPursuing,available:p.pursuitAvailable};},test));}assert.ok(rows.every(r=>!r.active&&r.available));return rows;
    });
    await check('墙后目标不会触发追步，也不消耗机会',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();const clear=s.navigation.clearLine;s.navigation.clearLine=()=>false;window.attack();s.navigation.clearLine=clear;return{active:p.isPursuing,available:p.pursuitAvailable};});assert.deepEqual(r,{active:false,available:true});return r;
    });
    await check('攻击冷却未好不抢跑，过期不能追步',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();p.attackTimer=100;window.attack();const cooling={active:p.isPursuing,remaining:p.pursuitRemaining,attacks:s.attackCount};p.moveIntent.set(0,0);p.updateEntity(1200);p.moveIntent.set(1,0);window.attack();return{cooling,expired:{active:p.isPursuing,available:p.pursuitAvailable,attacks:s.attackCount}};});assert.deepEqual(r,{cooling:{active:false,remaining:1200,attacks:0},expired:{active:false,available:false,attacks:1}});return r;
    });
    await check('原生600ms物理追帧最多64像素，不跳步、不多刀',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe(124);window.attack();p.body.updateFromGameObject();const x=p.x;s.physics.world.resume();s.physics.world.update(performance.now(),600);s.physics.world.postUpdate();s.physics.world.pause();const before={travel:p.x-x,hp:e.hp,velocity:p.body.velocity.x};window.finish();window.finish();return{before,hp:e.hp,attacks:s.attackCount};});assert.ok(Math.abs(r.before.travel-64)<1e-6,JSON.stringify(r));assert.equal(r.before.hp,200);assert.equal(r.before.velocity,0);assert.equal(r.hp,181);assert.equal(r.attacks,1);return r;
    });
    await check('斜向距离同样封顶，途中改瞄准不拐弯追踪',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();p.moveIntent.set(1,1);p.aimIntent.set(1,1);p.updateEntity(1);const e=window.foe(110/Math.SQRT2,110/Math.SQRT2);window.attack();const x=p.x,y=p.y;p.aimIntent.set(-1,0);p.updateEntity(1);window.step();window.finish();return{distance:Math.hypot(p.x-x,p.y-y),dx:p.x-x,dy:p.y-y,hp:e.hp,trace:window.trace};});assert.ok(Math.abs(r.distance-50)<1e-6,JSON.stringify(r));assert.ok(Math.abs(r.dx-r.dy)<1e-6);assert.equal(r.hp,181);return r;
    });
    await check('发动后遇墙受原生碰撞阻挡，墙后目标不凭追步受伤',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe(124);window.attack();const wall=s.add.rectangle(p.x+35,p.y,16,120);s.physics.add.existing(wall,true);s.walls.add(wall);const edge=wall.body.left;window.step(20);window.finish();return{right:p.body.right,edge,hp:e.hp};});assert.ok(r.right<=r.edge+.01,JSON.stringify(r));assert.equal(r.hp,200);return r;
    });
    await check('追步没有无敌，真实受击会打断，不会迟到补刀',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe();window.attack();const invulnerable=p.isInvulnerable,lost=p.applyDamage(8);window.step(20);window.finish();return{invulnerable,lost,active:p.isPursuing,available:p.pursuitAvailable,attacks:s.attackCount,hp:e.hp};});assert.deepEqual(r,{invulnerable:false,lost:8,active:false,available:false,attacks:0,hp:200});return r;
    });
    await check('闪避/血涌优先取消追斩，不把它当作普通闪避触发突变',async()=>{
      const rows=[];for(const action of ['dash','skill']){await start();rows.push(await page.evaluate(action=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();window.attack();p.drainCombatEvents();p[action==='dash'?'wantDash':'wantSkill']=true;p.updateEntity(1);p[action==='dash'?'wantDash':'wantSkill']=false;return{action,active:p.isPursuing,events:p.drainCombatEvents().map(e=>e.type),available:p.pursuitAvailable,dash:p.isDashing,skill:p.skillIsActive};},action));}assert.deepEqual(rows.map(r=>[r.active,r.available,r.events]),[[false,false,['dash']],[false,false,['skill']]]);return rows;
    });
    await check('追步事件不会触发蜕壳爆裂、破城骨槌或血涌范围伤害',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe();s.build.acquire('shared_dash');p.drainCombatEvents();window.attack();s.consumeCombatEvents();return{burst:s.dashBurstPending,ram:s.ramReady,skill:p.skillIsActive,hp:e.hp,dashCooldown:p.cooldownRemaining('dash')};});assert.deepEqual(r,{burst:false,ram:false,skill:false,hp:200,dashCooldown:0});return r;
    });
    await check('第三次葬礼仍只在实际第三刀触发，不在踏步时提前爆发',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();const e=window.foe(110);s.build.acquire('reaver_cleave');s.attackCount=2;window.attack();const before={hp:e.hp,count:s.attackCount};window.step();window.finish();return{before,after:{hp:e.hp,count:s.attackCount}};});assert.deepEqual(r,{before:{hp:200,count:2},after:{hp:164,count:3}});return r;
    });
    await check('暂停冻结机会和已承诺追步，恢复后继续而不是偷跑',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();window.attack();const before=JSON.stringify(p.pursuit),x=p.x;s.update(0,600);const frozen=before===JSON.stringify(p.pursuit)&&x===p.x;window.step();window.finish();return{frozen,attacks:s.attackCount};});assert.deepEqual(r,{frozen:true,attacks:1});return r;
    });
    await check('实际暂停菜单冻结追步，恢复物理的第一步不丢失距离预算',async()=>{
      await start();
      const before=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe(124);window.attack();s.paused=false;s.togglePause();return{state:JSON.stringify(p.pursuit),x:p.x,y:p.y};});
      await page.waitForTimeout(180);
      const r=await page.evaluate(before=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;const frozen=s.paused&&s.physics.world.isPaused&&JSON.stringify(p.pursuit)===before.state&&p.x===before.x&&p.y===before.y;s.togglePause();s.physics.world.update(performance.now(),600);s.physics.world.postUpdate();s.physics.world.pause();s.paused=true;window.finish();return{frozen,distance:p.x-before.x,hp:window.target.hp,attacks:s.attackCount};},before);
      assert.ok(r.frozen);assert.ok(Math.abs(r.distance-64)<1e-6,JSON.stringify(r));assert.equal(r.hp,181);assert.equal(r.attacks,1);return r;
    });
    await check('系统repeat和旧事件重放不把长按伪装成新追斩指令',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();const old=new KeyboardEvent('keydown',{key:' ',code:'Space'});s.onAttackKey(old);s.pendingAttack=false;s.onAttackKey(old);const replay=s.pendingAttack;s.onAttackKey(new KeyboardEvent('keydown',{key:' ',code:'Space',repeat:true}));return{replay,repeat:s.pendingAttack,active:p.isPursuing};});assert.deepEqual(r,{replay:false,repeat:false,active:false});return r;
    });
    await check('追步中死亡立即解除监听，旧方向不会在死亡过渡复活',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();window.attack();const before=s.physics.world.listenerCount('worldstep');p.applyDamage(999);const x=p.x;window.step(20);window.finish();return{dead:p.dead,active:p.isPursuing,available:p.pursuitAvailable,travel:p.x-x,removed:before-s.physics.world.listenerCount('worldstep'),attacks:s.attackCount};});assert.deepEqual(r,{dead:true,active:false,available:false,travel:0,removed:1,attacks:0});return r;
    });
    await check('三选一/换层取消追步，不带着旧敌人方向穿过新房间',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.earn();window.foe();window.attack();s.openMutationChoice();const choice={active:p.isPursuing,available:p.pursuitAvailable,velocity:p.body.velocity.length()};s.closeMutationChoice();s.beginNextFloor();return{choice,next:{active:p.isPursuing,available:p.pursuitAvailable},floor:s.floor};});assert.deepEqual(r,{choice:{active:false,available:false,velocity:0},next:{active:false,available:false},floor:2});return r;
    });
    await check('真实键鼠：击杀、松开、朝下个敌人再按，实际命中并保留原伤害',async()=>{
      await start('reaver',true);
      await page.evaluate(()=>{
        window.demoChunks=[];window.demoRecorder=new MediaRecorder(document.querySelector('canvas').captureStream(30),{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
        window.demoRecorder.ondataavailable=e=>{if(e.data.size)window.demoChunks.push(e.data);};window.demoRecorder.start();window.foe(42,0,1);
      });
      await page.keyboard.press('Space');
      await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').kills===1);
      await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').player.attackReady);
      await page.evaluate(()=>{window.foe(115,0,200);});
      await page.keyboard.down('d');await page.keyboard.press('Space');
      await page.waitForFunction(()=>window.trace.some(t=>t.event==='strike'));
      await page.keyboard.up('d');
      const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run');s.paused=true;s.physics.world.pause();s.combat.update(0,s.player,false);s.updateHud();return{hp:window.target.hp,attacks:s.attackCount,trace:window.trace,damage:s.player.stats.damage};});
      assert.equal(r.hp,181);assert.equal(r.attacks,2);assert.equal(r.damage,19);assert.deepEqual(r.trace.map(t=>t.event),['start','strike']);
      await page.screenshot({path:path.join(OUT,'keyboard-pursuit.png')});
      const video=await page.evaluate(()=>new Promise(resolve=>{window.demoRecorder.onstop=async()=>{const blob=new Blob(window.demoChunks,{type:'video/webm'}),reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);};window.demoRecorder.stop();}));
      fs.writeFileSync(path.join(OUT,'keyboard-pursuit.webm'),Buffer.from(video,'base64'));return r;
    });
    await check('真实长按击杀后不自动追步，松开再按才可选择追击',async()=>{
      await start('reaver',true);await page.evaluate(()=>{window.foe(42,0,1);});await page.keyboard.down('Space');
      await page.waitForFunction(()=>window.__seedGame.scene.getScene('Run').kills===1);
      await page.evaluate(()=>{window.foe(115,0,200);});await page.keyboard.down('d');await page.waitForTimeout(100);await page.keyboard.up('d');
      const r=await page.evaluate(()=>({trace:window.trace,active:window.__seedGame.scene.getScene('Run').player.isPursuing}));await page.keyboard.up('Space');assert.deepEqual(r,{trace:[],active:false});return r;
    });
    await check('追斩提示双语可见，地面标记有上限，四倍率不改物理体积',async()=>{
      const rows=[];for(const scale of [.75,1,1.5,2]){await start();rows.push(await page.evaluate(scale=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player;window.__seedDev.applyRenderScale(scale);window.earn();s.updateHud();s.combat.update(0,p,false);const commands=s.combat.pursuitBlades.commandBuffer.length,count=s.children.length;for(let i=0;i<500;i++)s.combat.update(0,p,false);const zh=s.pursuitText.text;window.__seedDev.i18n.setLang('en');s.updateHud();const en=s.pursuitText.text;return{scale,body:[p.body.width,p.body.height],commands,growth:s.children.length-count,zh,en,textWidth:s.pursuitText.width,region:460};},scale));}assert.ok(rows.every(r=>r.commands>0&&r.growth===0&&r.zh.includes('追斩')&&r.en.includes('PURSUIT')&&r.textWidth<=r.region));assert.ok(rows.every(r=>JSON.stringify(r.body)===JSON.stringify(rows[0].body)));await page.evaluate(()=>window.__seedDev.applyRenderScale(1));await page.screenshot({path:path.join(OUT,'ready-en.png')});return rows;
    });
    await check('结束恢复物理不复活追步，重开/销毁不积累WorldStep监听',async()=>{
      await start();const r=await page.evaluate(()=>{const s=window.__seedGame.scene.getScene('Run'),p=s.player,w=s.physics.world;window.earn();window.foe();window.attack();const before=w.listenerCount('worldstep');s.endRun(true);const after=w.listenerCount('worldstep'),x=p.x;window.step(20);return{active:p.isPursuing,available:p.pursuitAvailable,velocity:p.body.velocity.length(),travel:p.x-x,before,after,text:s.pursuitText.text};});assert.equal(r.active,false);assert.equal(r.available,false);assert.equal(r.velocity,0);assert.equal(r.travel,0);assert.equal(r.after,0);assert.equal(r.text,'');
      const counts=[];for(let i=0;i<3;i++){await start();counts.push(await page.evaluate(()=>window.__seedGame.scene.getScene('Run').physics.world.listenerCount('worldstep')));}assert.deepEqual(counts,[1,1,1]);return{...r,restarts:counts};
    });
    await check('模拟触屏：摇杆朝敌移动 + 新点攻击，同样完成追斩',async()=>{
      const desktop=page,touchCtx=await b.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
      page=await touchCtx.newPage();page.on('pageerror',e=>errors.push(e.stack));
      try{
        await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__seedGame?.scene.getScene('Menu')?.sys.isActive());await start('reaver',true);
        await page.evaluate(()=>{window.earn();window.foe(115);const s=window.__seedGame.scene.getScene('Run');s.physics.world.resume();s.virtual.show();});
        const box=await page.locator('canvas').boundingBox(),cdp=await touchCtx.newCDPSession(page);
        const point=(id,x,y)=>({id,x:box.x+x/1280*box.width,y:box.y+y/720*box.height});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,100,620)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,156,620)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,156,620),point(2,1160,610)]});
        await page.waitForFunction(()=>window.trace.some(t=>t.event==='strike'));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        const r=await page.evaluate(()=>({hp:window.target.hp,trace:window.trace}));assert.equal(r.hp,181);assert.deepEqual(r.trace.map(t=>t.event),['start','strike']);await page.screenshot({path:path.join(OUT,'touch-pursuit.png')});return r;
      }finally{await touchCtx.close();page=desktop;}
    });
    await check('浏览器没有未处理异常或缺失动画',()=>assert.deepEqual(errors,[]));
  } finally {
    fs.writeFileSync(path.join(OUT,'browser-checks.json'),JSON.stringify({date:new Date().toISOString(),checks,errors,scope:'Isolated engine checks plus actual keyboard and emulated touch. Not natural play or subjective fun acceptance.'},null,2));
    await ctx.close();await b.close();
  }
  console.log(`Reaver pursuit browser: ${checks.length}/${checks.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
