'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const m={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync('src/input/InputEdgeGuard.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,require,m);
const {InputEdgeGuard}=m.exports,checks=[],OUT=path.resolve(process.env.SEED_CONTACT_OUTPUT||'output/contact-v1');
fs.mkdirSync(OUT,{recursive:true});
function check(name,f){const detail=f();checks.push({name,passed:true,detail});console.log('PASS',name);}
check('同一物理事件仅处理一次',()=>{const g=new InputEdgeGuard(),e={repeat:false};assert.equal(g.accept(e),true);assert.equal(g.accept(e),false);});
check('非相邻队列重放也去重，不只检查上一个按键',()=>{const g=new InputEdgeGuard(),escape={key:'Escape'},space={key:' '};assert.equal(g.accept(escape),true);assert.equal(g.accept(space),true);assert.equal(g.accept(escape),false);});
check('真正两次快按即使键码/时间戳相同也都接受，无时间防抖',()=>{const g=new InputEdgeGuard();for(let n=0;n<50;n++)assert.equal(g.accept({key:'Escape',timeStamp:42}),true);});
check('系统自动repeat不触发，重放也不触发',()=>{const g=new InputEdgeGuard(),e={repeat:true};assert.equal(g.accept(e),false);assert.equal(g.accept(e),false);assert.equal(g.accept({repeat:false}),true);});
check('暂停/选择期间拒绝的事件也已消费，恢复后不偷偷执行',()=>{const g=new InputEdgeGuard(),e={};let paused=true,count=0;if(g.accept(e)&&!paused)count++;paused=false;if(g.accept(e)&&!paused)count++;assert.equal(count,0);if(g.accept({})&&!paused)count++;assert.equal(count,1);});
check('同一守卫跨局保留已消费身份，不吞其他场景自己的输入',()=>{const g=new InputEdgeGuard(),other=new InputEdgeGuard(),e={};assert.equal(g.accept(e),true);assert.equal(g.accept(e),false);assert.equal(other.accept(e),true);assert.equal(g.accept({}),true);});
check('冻结的DOM型事件不被修改，不依赖时钟/帧率',()=>{const g=new InputEdgeGuard(),e=Object.freeze({repeat:false,key:'q'});assert.equal(g.accept(e),true);assert.equal(g.accept(e),false);assert.deepEqual(e,{repeat:false,key:'q'});});
check('10000个事件随机交错重放，恰好10000次接受',()=>{const g=new InputEdgeGuard(),events=Array.from({length:10000},()=>({repeat:false}));let accepted=0;for(const e of events)accepted+=Number(g.accept(e));let seed=42;for(let n=0;n<30000;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;accepted+=Number(g.accept(events[seed%events.length]));}assert.equal(accepted,10000);return{unique:10000,replayed:30000};});
fs.writeFileSync(path.join(OUT,'input-model-checks.json'),JSON.stringify({checks,scope:'Physical event identity guard; actual engine replay and native key input need browser checks.'},null,2));console.log(`Input edge model: ${checks.length}/${checks.length}`);
