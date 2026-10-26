'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const file='src/ui/CombatHudFocus.ts',moduleBox={exports:{}};
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInThisContext(`(function(module,exports){${code}\n})`,{filename:file})(moduleBox,moduleBox.exports);
const{HudPeek,CombatHudFocus,focusOverlaps,projectCombatRect}=moduleBox.exports;
let passed=0;function check(name,f){f();console.log('PASS',name);passed++;}
check('设计坐标投影：四倍率/1000个相机与世界矩形，缩放不改变HUD相对位置',()=>{
 let seed=1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<1000;i++){const x=random()*1700,y=random()*1200,rect={x:x-30,y:y-48,width:60,height:64};let reference;
  for(const scale of [.75,1,1.5,2]){const camera={scrollX:x-1280*scale/2,scrollY:y-720*scale/2,width:1280*scale,height:720*scale,zoom:scale};const p=projectCombatRect(rect,camera,scale,18);assert.ok(Math.abs(p.x-592)<1e-8);assert.ok(Math.abs(p.y-294)<1e-8);assert.equal(p.width,96);assert.equal(p.height,100);if(reference)for(const key of ['x','y','width','height'])assert.ok(Math.abs(p[key]-reference[key])<1e-8);reference=p;}
 }
});
check('矩形相交：覆盖/部分/边界/远离，不因只接触边界而闪烁',()=>{const box={x:490,y:595,width:300,height:105};assert.ok(focusOverlaps(box,{x:630,y:630,width:64,height:64}));assert.ok(focusOverlaps(box,{x:480,y:590,width:20,height:20}));assert.ok(!focusOverlaps(box,{x:426,y:600,width:64,height:64}));assert.ok(!focusOverlaps(box,{x:100,y:100,width:64,height:64}));});
check('65ms让位、240ms防抖、220ms恢复；零/负/NaN delta不跳变',()=>{const p=new HudPeek();p.update(true,65);assert.equal(p.value,1);assert.ok(Math.abs(p.alpha(.05)-.05)<1e-12);p.update(false,239);assert.equal(p.value,1);p.update(false,1);assert.equal(p.value,1);p.update(false,220);assert.equal(p.value,0);p.update(true,0);p.update(false,-1);p.update(false,NaN);assert.equal(p.value,0);p.update(true,65);p.update(true,220,false);assert.equal(p.value,0);});
check('长帧也先消费防抖时间，等长总时长不因拆帧方式改变恢复进度',()=>{for(const total of [120,239,240,250,300,460,500]){const one=new HudPeek(),split=new HudPeek();one.update(true,65);split.update(true,65);one.update(false,total);let left=total;while(left>0){const dt=Math.min(16,left);split.update(false,dt);left-=dt;}assert.ok(Math.abs(one.value-split.value)<1e-10);const expected=total<=240?1:Math.max(0,1-(total-240)/220);assert.ok(Math.abs(one.value-expected)<1e-10);}});
check('随机高低帧率/反复进入退出：10000步始终0..1，持续抖动不会闪回实心',()=>{const p=new HudPeek();for(let i=0;i<10000;i++){const overlap=i%3!==0;p.update(overlap,[0,8,16,33,120,250][i%6]);assert.ok(p.value>=0&&p.value<=1);assert.ok(p.alpha(.06)>=.06-1e-12&&p.alpha(.06)<=1);}p.reset();for(let i=0;i<20;i++)p.update(i%2===0,50);assert.equal(p.value,1);});
check('分层只改alpha：保留原alpha/几何/命中区，恢复、暂停和清理不会泄漏',()=>{const target={alpha:.6,x:10,y:20,width:88,input:{radius:48},setAlpha(v){this.alpha=v;}};const manager=new CombatHudFocus();manager.register({x:0,y:0,width:100,height:100},[{target,minimum:.1}]);manager.update([{x:30,y:20,width:10,height:10}],65);assert.ok(Math.abs(target.alpha-.06)<1e-10);assert.deepEqual([target.x,target.y,target.width,target.input.radius],[10,20,88,48]);manager.update([],220,false);assert.equal(target.alpha,.6);manager.update([{x:30,y:20,width:10,height:10}],65);manager.clear();assert.equal(target.alpha,.6);manager.update([{x:30,y:20,width:10,height:10}],1000);assert.equal(target.alpha,.6);});
fs.mkdirSync('output/hud-focus-v1',{recursive:true});fs.writeFileSync('output/hud-focus-v1/model-checks.json',JSON.stringify({passed,projectionSamples:4000,fadeSamples:10000},null,2));console.log(`HUD model: ${passed}/${passed}`);
