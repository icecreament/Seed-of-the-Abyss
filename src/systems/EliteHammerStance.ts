import { ELITE_DUEL, type EliteDuel } from './EliteDuel';
type HammerState=Pick<EliteDuel,'phase'|'remaining'|'pressure'|'threshold'|'windupProgress'>;
/** Read-only action silhouette from the REAL duel clock. No extra timing or gameplay state. */
export function eliteHammerFrame(duel:HammerState,motion=true):number|undefined {
  if(duel.phase==='windup')return motion&&duel.windupProgress<0.4?0:1;
  if(duel.phase!=='exposed')return undefined;
  if(!motion)return 3;
  if(duel.remaining<=180)return 5;
  const broken=duel.pressure>=duel.threshold;
  const elapsed=(broken?ELITE_DUEL.brokenRecovery:ELITE_DUEL.recovery)-duel.remaining;
  if(elapsed<120)return broken?4:2;
  return 3;
}
