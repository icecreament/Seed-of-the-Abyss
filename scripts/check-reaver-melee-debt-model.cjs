'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const OUT=path.resolve(process.env.SEED_MELEE_DEBT_OUTPUT||'output/reaver-melee-debt-v1/model-exploration');fs.mkdirSync(OUT,{recursive:true});
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInThisContext(`(function(module,exports,require){${code}\n})`)(m,m.exports,id=>load(path.resolve(path.dirname(file),id+'.ts')));return m.exports;}

const {findMeleeDebtTarget}=load('src/systems/ReaverRelay.ts'),checks=[];
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS',name);}
const mark=(relay=false,bleed=3100,tick=1000)=>({bleed,tick,...(relay?{relay:true}:{})});
const foe=(x,y=0,debt=mark())=>({x,y,hitRadius:14,active:true,isTargetable:true,debt});
const pick=(list,clear=()=>true,aim={x:1,y:0})=>findMeleeDebtTarget({x:0,y:0},aim,48,list,e=>e.debt,clear);
check('Original aimed melee arc/radius only, no forward movement required',()=>{const hit=foe(45),far=foe(63),back=foe(-45),side=foe(0,45);assert.equal(pick([far,back,side,hit]).target,hit);assert.equal(pick([far,back,side]),undefined);});
check('Inherited > ordinary debt; one stable nearest target among equal priorities',()=>{const a=foe(35),b=foe(55,0,mark(true)),c=foe(50,0,mark(true));assert.equal(pick([a,b,c]).target,c);assert.equal(pick([b,foe(55,0,mark(true))]).target,b);assert.equal(pick([b,c,a]).pulses,3);});
check('No remaining real pulse, dead/wake or blocked sight never ranks as debt',()=>{const good=foe(55),expired=foe(30,0,mark(true,100,1000)),dead={...foe(35,0,mark(true)),active:false},wake={...foe(40,0,mark(true)),isTargetable:false},blocked=foe(45,0,mark(true));assert.equal(pick([expired,dead,wake,blocked,good],(x,y,tx)=>tx!==45).target,good);});
check('Full real inclusive bleed phase is payable, even four pulses; transfer cap remains separate',()=>{assert.equal(pick([foe(45,0,mark(false,3100,50))]).pulses,4);assert.equal(pick([foe(45,0,mark(false,100,100))]).pulses,1);});
check('Nonfinite positions/radius/origin/aim and negative radius never authorize a target',()=>{for(const f of [{...foe(45),x:NaN},{...foe(45),hitRadius:Infinity},{...foe(45),hitRadius:-1}])assert.equal(pick([f]),undefined);assert.equal(findMeleeDebtTarget({x:NaN,y:0},{x:1,y:0},48,[foe(45)],e=>e.debt,()=>true),undefined);assert.equal(pick([foe(45)],()=>true,{x:0,y:0}),undefined);});
check('Repeated guide reads leave original marks, HP and player data untouched',()=>{const f=Object.freeze({...foe(45,0,Object.freeze(mark(true))),hp:200}),list=Object.freeze([f]);for(let i=0;i<1000;i++)assert.equal(pick(list).target,f);assert.equal(f.hp,200);assert.deepEqual(f.debt,{bleed:3100,tick:1000,relay:true});});
fs.writeFileSync(path.join(OUT,'melee-debt-model.json'),JSON.stringify({checks,scope:'Pure selection only; runtime acceptance and inputs tested separately.'},null,2));console.log(`Melee debt model: ${checks.length}/${checks.length}`);
