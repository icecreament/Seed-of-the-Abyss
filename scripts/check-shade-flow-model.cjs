'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript');
const source=fs.readFileSync(path.resolve('src/systems/CombatFeel.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const m={exports:{}}; vm.runInThisContext(`(function(module,exports){${code}\n})`)(m,m.exports);
const {meleeArcContains:inside}=m.exports;
const OUT=path.resolve(process.env.SEED_SHADE_OUTPUT||'output/shade-flow-v1/final'); fs.mkdirSync(OUT,{recursive:true});
const checks=[];
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS',name);}
check('刀距边界包含敌人真实半径，超出0.001即不命中',()=>{
 assert.equal(inside(66,0,1,0,52,14),true); assert.equal(inside(66.001,0,1,0,52,14),false);
 assert.equal(inside(96,0,1,0,52,44),true); assert.equal(inside(96.001,0,1,0,52,44),false);
});
check('原攻击前方扇区保持不变：背面/正侧/完全重心不算命中',()=>{
 for(const [dx,dy,expected]of [[30,0,true],[-30,0,false],[0,30,false],[0,0,false],[10,30,true],[1,30,false]])assert.equal(inside(dx,dy,1,0,52,14),expected);
});
check('10000个固定随机样本与旧实际命中判定逐项一致，不扩大范围或角度',()=>{
 let seed=0x716231; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<10000;i++){
  const dx=random()*500-250,dy=random()*500-250,a=random()*Math.PI*2,dirX=Math.cos(a),dirY=Math.sin(a),reach=30+random()*100,radius=14+random()*30;
  const d=Math.hypot(dx,dy),old=d<=reach+radius&&(dx/(d||1))*dirX+(dy/(d||1))*dirY>=.15;
  assert.equal(inside(dx,dy,dirX,dirY,reach,radius),old,`sample ${i}`);
 }
});
fs.writeFileSync(path.join(OUT,'model-checks.json'),JSON.stringify({date:new Date().toISOString(),checks,samples:10000},null,2));
console.log(`Shade flow model: ${checks.length}/${checks.length}`);
