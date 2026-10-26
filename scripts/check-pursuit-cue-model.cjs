'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/systems/ReaverPursuit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const m={exports:{}};vm.runInThisContext(`(function(module,exports){${code}\n})`)(m,m.exports);
const {pursuitCueStage:stage,ReaverPursuit:P}=m.exports,checks=[];
const OUT=path.resolve(process.env.SEED_PURSUIT_CUE_OUTPUT||'output/reaver-opportunity-v1/checks');fs.mkdirSync(OUT,{recursive:true});
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS',name);}
check('已有正确方向的新按键缓冲优先显示已接招，不诱导重复补按',()=>{assert.equal(stage(true,true,true,80),'buffered');assert.equal(stage(true,false,true,80),'buffered');});
check('长按必须先松开，冷却结束也不冒称一键就绪',()=>{for(const aligned of [true,false])for(const cooldown of [0,80])assert.equal(stage(aligned,true,false,cooldown),'release');});
check('没有正确移动方向时只提示移动，不把虚拟引导当成可追',()=>{for(const buffered of [true,false])for(const cooldown of [0,80])assert.equal(stage(false,false,buffered,cooldown),'move');});
check('已松开且方向正确仍要等原冷却，异常时钟不显示就绪',()=>{for(const cooldown of [0.1,80,300,NaN,Infinity])assert.equal(stage(true,false,false,cooldown),'recover');assert.equal(stage(true,false,false,0),'ready');});
check('完整布尔组合和固定冷却样本优先级一致，只有真就绪才显示ready',()=>{let total=0;for(const a of [false,true])for(const h of [false,true])for(const b of [false,true])for(const cd of [0,1,139,140,300]){const s=stage(a,h,b,cd);assert.equal(s==='ready',a&&!h&&!b&&cd===0);assert.equal(s==='buffered',a&&b);total++;}assert.equal(total,40);});
check('一万次纯提示调用不赚取/花掉追斩票、移动预算或出刀',()=>{const p=new P();p.earn();const before=JSON.stringify(p);for(let i=0;i<10000;i++)stage(!!(i%2),!!(i%3),!!(i%5),i%301);assert.equal(JSON.stringify(p),before);assert.equal(p.consumeStrike(),null);});
fs.writeFileSync(path.join(OUT,'cue-model.json'),JSON.stringify({checks},null,2));console.log(`Pursuit cue model: ${checks.length}/${checks.length}`);
