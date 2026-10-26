'use strict';
// Pure production modules, no Phaser/entity stubs. Run with the project's Node 18+.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'); const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);return m.exports;}
const store=new Map();global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
const {RunBuild,MUTATIONS,mutationName,mutationDescription}=load('src/systems/RunBuild.ts');
const {i18n}=load('src/i18n/i18n.ts');const {SaveSystem}=load('src/systems/SaveSystem.ts');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
check('15种突变都有独立ID、双语名称与机制描述',()=>{assert.equal(MUTATIONS.length,15);assert.equal(new Set(MUTATIONS.map(m=>m.id)).size,15);for(const m of MUTATIONS)for(const lang of ['zh','en']){i18n.setLang(lang);assert.ok(mutationName(m).length>2);assert.ok(mutationDescription(m).length>12);}});
for(const id of ['warden','reaver','shade','thorn']){
 check(`${id}: 1000组种子，连续三次候选唯一、不含已拥有或其他职业；职业项优先`,()=>{
  for(let seed=1;seed<=1000;seed++){let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};const b=new RunBuild(id);
   for(let round=0;round<3;round++){const offer=b.offer(random);assert.equal(offer.length,3);assert.equal(new Set(offer.map(m=>m.id)).size,3);for(const m of offer){assert.ok(!b.has(m.id));assert.ok(m.owner==='shared'||m.owner===id);}
    if(MUTATIONS.some(m=>m.owner===id&&!b.has(m.id)))assert.ok(offer.some(m=>m.owner===id));assert.ok(b.acquire(offer[Math.floor(random()*3)].id));}
   assert.equal(b.owned.length,3);assert.equal(new RunBuild(id).owned.length,0);
  }
 });
 check(`${id}: 拒绝重复/非法/跨职业突变，池耗尽后安全返回空`,()=>{const b=new RunBuild(id);assert.equal(b.acquire('missing'),false);assert.equal(b.acquire(MUTATIONS.find(m=>m.owner!=='shared'&&m.owner!==id).id),false);for(const m of MUTATIONS.filter(m=>m.owner===id||m.owner==='shared')){assert.ok(b.acquire(m.id));assert.equal(b.acquire(m.id),false);}assert.deepEqual(b.offer(),[]);});
}
check('胜利额外100基础精华；不增加死亡次数；旧调用仍按死亡结算',()=>{
 store.clear();const s=new SaveSystem();const metrics={floor:4,kills:73,timeAliveSec:150,damageDealt:2500};
 const base=73*2+4*8+15+Math.floor(2500/80);
 const r=s.settleDeath({...metrics,outcome:'victory'});assert.equal(r.gained,base+100);assert.equal(s.totalDeaths,0);
 s.settleDeath({...metrics,outcome:'abandoned'});assert.equal(s.totalDeaths,0);
 s.settleDeath(metrics);assert.equal(s.totalDeaths,1);s.settleDeath({...metrics,outcome:'death'});assert.equal(s.totalDeaths,2);
 assert.equal(new SaveSystem().essence,s.essence);
});
console.log(`Chapter model: ${count}/${count}; 4000 seeded builds / 12000 mutation offers.`);
