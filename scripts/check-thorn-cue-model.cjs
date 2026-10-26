'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};vm.runInThisContext(`(function(module,exports){${ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText}\n})`)(m,m.exports);return m.exports;}
const {thornBloomCue}=load('src/systems/ThornBloomCue.ts'),{bloomSummary}=load('src/systems/ThornBloom.ts');
const OUT=path.resolve(process.env.SEED_THORN_CUE_OUTPUT||'output/thorn-cue-v1/checks');fs.mkdirSync(OUT,{recursive:true});const checks=[];
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS',name);}
function cue(overrides={}){return thornBloomCue({active:true,unlocked:true,summary:{targets:1,ripe:1},remaining:0,...overrides});}
check('未取得花冢、空种和非战斗角色回归新星，无虚构引爆',()=>{for(const input of [{unlocked:false},{summary:{targets:0,ripe:0}},{active:false}]){const r=cue(input);assert.equal(r.stage,'nova');assert.equal(r.detonate,false);assert.equal(r.emphasis,false);}assert.equal(cue({active:false}).ready,false);});
check('有种就能引爆，不把满三层当作技能门槛',()=>{assert.deepEqual(cue({summary:{targets:2,ripe:0}}),{active:true,stage:'growing',targets:2,ripe:0,detonate:true,ready:true,emphasis:false});});
check('满种只在真实冷却结束时金色强调',()=>{assert.equal(cue().stage,'ripe');assert.equal(cue().emphasis,true);for(const ms of [.001,100,6000]){const r=cue({remaining:ms});assert.equal(r.stage,'cooldown');assert.equal(r.ready,false);assert.equal(r.emphasis,false);assert.equal(r.detonate,true);}});
check('非法冷却不误报就绪，负冷却按已结束处理',()=>{for(const remaining of [NaN,Infinity,-Infinity]){assert.equal(cue({remaining}).ready,false);assert.equal(cue({remaining}).emphasis,false);}assert.equal(cue({remaining:-1}).ready,true);});
check('三只各一层不等于一只满种',()=>{const marks=new Map(Array.from({length:3},()=>[{active:true},{seeds:1}]));const r=cue({summary:bloomSummary(marks,e=>e.active)});assert.equal(r.targets,3);assert.equal(r.ripe,0);assert.equal(r.stage,'growing');});
check('远处、墙后种子同样可兑现，失活目标不计数',()=>{const a={active:true,x:2000,wall:true},b={active:false,x:100},marks=new Map([[a,{seeds:3}],[b,{seeds:3}]]);const r=cue({summary:bloomSummary(marks,e=>e.active)});assert.equal(r.targets,1);assert.equal(r.ripe,1);assert.equal(r.stage,'ripe');});
check('非法汇总不会产生满种提示',()=>{for(const targets of [NaN,Infinity,-1,.5]){const r=cue({summary:{targets,ripe:3}});assert.equal(r.detonate,false);}for(const ripe of [NaN,Infinity,-1])assert.equal(cue({summary:{targets:1,ripe}}).ripe,0);assert.equal(cue({summary:{targets:1,ripe:99}}).ripe,1);});
check('一万次推导只读输入，冷却和种层不改变',()=>{const input=Object.freeze({active:true,unlocked:true,summary:Object.freeze({targets:2,ripe:1}),remaining:1000});for(let i=0;i<10000;i++)assert.equal(thornBloomCue(input).stage,'cooldown');assert.equal(input.remaining,1000);assert.deepEqual(input.summary,{targets:2,ripe:1});});
fs.writeFileSync(path.join(OUT,'thorn-cue-model.json'),JSON.stringify({checks},null,2));console.log(`Thorn cue model: ${checks.length}/${checks.length}`);
