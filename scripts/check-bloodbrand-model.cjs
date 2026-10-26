'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};vm.runInThisContext(`(function(module,exports){${ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText}\n})`)(m,m.exports);return m.exports;}
const {BLOODBRAND:T,remainingBleedPulses:pulses,cashedBleedDamage:damage}=load('src/systems/Bloodbrand.ts');
const {ReaverPursuit:P}=load('src/systems/ReaverPursuit.ts');
const OUT=path.resolve(process.env.SEED_BLOODBRAND_OUTPUT||'output/reaver-bloodbrand-v1/checks');fs.mkdirSync(OUT,{recursive:true});const checks=[];
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS',name);}
check('沿用3100ms/1000ms/30%流血，不偷加持续或倍率',()=>assert.deepEqual(T,{duration:3100,interval:1000,ratio:.3}));
check('刷新保留脉冲相位：3个常规脉冲，临界刷新可有4个',()=>{assert.equal(pulses(3100,1000),3);assert.equal(pulses(3100,100),4);assert.equal(pulses(3100,100.001),3);assert.equal(pulses(100,100),1);assert.equal(pulses(99.999,100),0);assert.equal(pulses(0,0),0);});
check('非有限/过期状态不产生伤害预算',()=>{for(const a of [[NaN,1000],[3100,Infinity],[0,1000],[-1,1000]])assert.equal(pulses(...a),0);for(const a of [[NaN,3,1],[19,0,1],[19,NaN,1],[19,3,Infinity],[-1,3,1]])assert.equal(damage(...a),0);});
check('每个流血脉冲单独取整，不让批量结算变相加伤',()=>{assert.equal(damage(19,3,1),15);assert.equal(damage(19,4,1),20);assert.equal(damage(19,3,1.25),21);assert.equal(damage(19,3,0),3);assert.equal(damage(19,2.9,1),10);});
check('没有击杀机会不能白追，只有已支付伤口授权才能发动',()=>{const p=new P();assert.equal(p.start(1,0,50),false);assert.equal(p.start(1,0,50,true),true);assert.ok(p.active&&!p.available);});
check('伤口支付不吞已有击杀票，不在追步中堆出额外动作',()=>{const p=new P();p.earn();p.update(200);assert.ok(p.start(1,0,50,true));assert.equal(p.remaining,1000);assert.equal(p.start(1,0,50,true),false);p.advancePhysics(200);p.consumeStrike();assert.ok(p.available);});
check('伤口追斩仍有64px上限，无效参数不消费状态',()=>{const p=new P();for(const a of [[1,0,65],[0,0,50],[1,0,NaN]])assert.equal(p.start(...a,true),false);assert.ok(!p.active);assert.ok(p.start(1,0,64,true));let x=0;for(let i=0;i<36;i++){x+=p.velocityForStep(1000/60).x/60;p.advancePhysics(1000/60);}assert.ok(Math.abs(x-64)<1e-8);});
check('伤口追斩取消后没有迟到斩击或额外机会',()=>{const p=new P();p.start(1,0,50,true);p.cancel();p.advancePhysics(600);assert.equal(p.consumeStrike(),null);assert.ok(!p.active&&!p.available);});
check('10000个固定时钟样本，剩余预算与逐脉冲枚举严格相等',()=>{let seed=0xab15;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};for(let i=0;i<10000;i++){const left=random()*3100,next=random()*1000,dmg=1+random()*99,mul=.1+random()*2;let n=0;for(let t=next;t<=left;t+=1000)n++;assert.equal(pulses(left,next),n);assert.equal(damage(dmg,n,mul),n*Math.max(1,Math.floor(dmg*.3*mul)));}});
fs.writeFileSync(path.join(OUT,'model-checks.json'),JSON.stringify({checks,randomSamples:10000},null,2));console.log(`Bloodbrand model: ${checks.length}/${checks.length}`);
