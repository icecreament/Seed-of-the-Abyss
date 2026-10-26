/** Existing Parasite Bloom rules; cues never plant, consume or deal damage. */
export const THORN_BLOOM = { maxSeeds: 3, damageRatio: 0.9 } as const;

export function seedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0,Math.min(THORN_BLOOM.maxSeeds,Math.floor(value))) : 0;
}

/** Actual eligible marked targets, not a proximity/LOS/range promise. Nova's existing global detonation is unchanged. */
export function bloomSummary<T>(marks: ReadonlyMap<T,{seeds:number}>, eligible: (target:T)=>boolean): {targets:number;seeds:number;ripe:number} {
  let targets=0,seeds=0,ripe=0;
  for (const [target,mark] of marks) {
    const count=seedCount(mark.seeds);
    if (!count || !eligible(target)) continue;
    targets++;seeds+=count;if(count===THORN_BLOOM.maxSeeds)ripe++;
  }
  return {targets,seeds,ripe};
}

/** Pods sit to the right of the existing HP bar, below the elite label; no extra GameObjects. */
export function seedMarkLayout(x:number,y:number,radius:number,count:number) {
  if (![x,y,radius].every(Number.isFinite) || radius<0 || !seedCount(count)) return undefined;
  const left=x+Math.max(14,radius)+9;
  return {full:seedCount(count)===THORN_BLOOM.maxSeeds,count:seedCount(count),
    slots:[0,1,2].map(i=>({x:left+i*8,y:y-28})),
    bounds:{left:left-4,right:left+20,top:y-35,bottom:y-23}};
}
