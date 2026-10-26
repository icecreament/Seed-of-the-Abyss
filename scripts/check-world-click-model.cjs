"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const moduleBox={exports:{}};
new Function('exports','require','module',ts.transpileModule(fs.readFileSync('src/input/WorldPointerAttack.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText)(moduleBox.exports,require,moduleBox);
const {WorldPointerAttack}=moduleBox.exports,checks=[],OUT=path.resolve(process.env.SEED_WORLD_CLICK_OUTPUT||'output/world-click-ownership-v1/model');
fs.mkdirSync(OUT,{recursive:true});
function check(name,f){try{const detail=f();checks.push({name,passed:true,detail});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:String(e.stack)});throw e;}}
try{
 check('Unowned/UI-origin held polling cannot authorize an attack',()=>{const g=new WorldPointerAttack();for(let n=0;n<100;n++)assert.equal(g.held(0,true),false);assert.equal(g.held(1,true),false);});
 check('Accepted world press authorizes repeated hold until matching release',()=>{const g=new WorldPointerAttack();g.press(0);assert.equal(g.held(0,true),true);assert.equal(g.held(0,true),true);g.release(0);assert.equal(g.held(0,true),false);});
 check('Other pointer polling or release does not cancel the owner',()=>{const g=new WorldPointerAttack();g.press(0);g.release(1);assert.equal(g.held(1,false),false);assert.equal(g.held(0,true),true);});
 check('Physical up recovers a missed release; polling a new down cannot reclaim ownership',()=>{const g=new WorldPointerAttack();g.press(0);assert.equal(g.held(0,false),false);assert.equal(g.held(0,true),false);g.press(0);assert.equal(g.held(0,true),true);});
 check('Lifecycle clear requires a fresh accepted press, not the old held state',()=>{const g=new WorldPointerAttack();g.press(0);g.clear();g.clear();assert.equal(g.held(0,true),false);g.press(0);assert.equal(g.held(0,true),true);});
 check('Invalid pointer IDs cannot claim or steal ownership',()=>{const g=new WorldPointerAttack();for(const id of [-1,0.5,NaN,Infinity,undefined,null,'0']){g.press(id);assert.equal(g.held(id,true),false);}g.press(0);for(const id of [-1,0.5,NaN,Infinity,undefined,null,'0'])g.press(id);assert.equal(g.held(0,true),true);});
 check('New accepted pointer replaces prior owner; separate instances are independent',()=>{const a=new WorldPointerAttack(),b=new WorldPointerAttack();a.press(0);a.press(2);assert.equal(a.held(0,true),false);assert.equal(a.held(2,true),true);assert.equal(b.held(2,true),false);b.press(0);a.clear();assert.equal(b.held(0,true),true);});
 check('10000 deterministic interleavings match an independent gesture ledger',()=>{const g=new WorldPointerAttack();let seed=20261023,accepted=[];for(let n=0;n<10000;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const op=seed%5,id=(seed>>>8)%3;if(op===0){g.press(id);accepted=[id];}else if(op===1){g.release(id);accepted=accepted.filter(x=>x!==id);}else if(op===2){g.clear();accepted=[];}else{const down=op===3,expected=down&&accepted.includes(id);assert.equal(g.held(id,down),expected);if(!down)accepted=accepted.filter(x=>x!==id);}}return{interleavings:10000,seed:20261023};});
}finally{fs.writeFileSync(path.join(OUT,'world-click-model-checks.json'),JSON.stringify({checks,scope:'Pure world-gesture ownership; UI propagation and real mouse/touch require browser evidence.'},null,2));}
console.log(`World click model: ${checks.length}/${checks.length}`);
