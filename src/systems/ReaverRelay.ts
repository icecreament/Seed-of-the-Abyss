import { BLOODBRAND, remainingBleedPulses } from './Bloodbrand';
import { meleeArcContains } from './CombatFeel';

/** An actual paid wound hit seeds the next hunt; it never deals damage or authorizes input. */
export const REAVER_RELAY = { range: 160, maxPulses: 3 } as const;
/** Keep the original 100ms tail: exact n*1000 can lose the final tick to fractional frame error. */
export function relayDuration(paid: number): number {
  const pulses=relayPulses(paid);
  return pulses ? pulses*BLOODBRAND.interval+(BLOODBRAND.duration-3*BLOODBRAND.interval) : 0;
}
export interface RelayTarget { x: number; y: number; active: boolean; isTargetable: boolean }
export function relayPulses(paid: number): number {
  return Number.isFinite(paid) ? Math.min(REAVER_RELAY.maxPulses,Math.max(0,Math.floor(paid))) : 0;
}
/** Source may survive or die. Stable nearest-first; never overwrite an existing debt. */
export function findRelayTarget<T extends RelayTarget>(
  source: {x:number;y:number}, targets: readonly T[],
  debt: (target:T)=>number, clear: (sx:number,sy:number,tx:number,ty:number)=>boolean,
): T | undefined {
  if (![source.x,source.y].every(Number.isFinite)) return;
  let result:T|undefined,best=Infinity;
  for(const target of targets){
    if(target===source || !target.active || !target.isTargetable || ![target.x,target.y].every(Number.isFinite))continue;
    const pulses=debt(target);if(!Number.isFinite(pulses) || pulses!==0)continue;
    const distance=Math.hypot(target.x-source.x,target.y-source.y);
    if(distance>REAVER_RELAY.range || distance>=best || !clear(source.x,source.y,target.x,target.y))continue;
    result=target;best=distance;
  }
  return result;
}

/** Ranking only, after the original movement/aim/LOS/range predicates pass. */
export function relayDebtPriority(pulses: number, inherited: boolean): number {
  return relayPulses(pulses) ? (inherited ? 2 : 1) : 0;
}

/** A static hooked diamond and remaining-debt pips, separate from the HP/bleed bars.
 * The caller must own an inherited mark; layout never creates debt or another clock.
 */
export function relayMarkLayout(x: number, y: number, radius: number, pulses: number) {
  const count=relayPulses(pulses);
  if (!count || ![x,y,radius].every(Number.isFinite) || radius<0) return;
  const cx=Math.round(x),cy=Math.round(y-radius-26);
  return { x:cx, y:cy, pips:Array.from({length:count},(_,i)=>({x:cx-(count-1)*3+i*6-1,y:cy+8})) };
}

export interface MeleeDebtTarget extends RelayTarget { hitRadius: number }
export interface MeleeDebtMark { bleed: number; tick: number; relay?: true }

/** Read-only choice inside the already aimed ordinary swing, never a new range or aim assist. */
export function findMeleeDebtTarget<T extends MeleeDebtTarget>(
  origin: {x:number;y:number}, aim: {x:number;y:number}, reach: number, targets: readonly T[],
  mark: (target:T)=>MeleeDebtMark|undefined, clear: (sx:number,sy:number,tx:number,ty:number)=>boolean,
): {target:T;pulses:number} | undefined {
  if (![origin.x,origin.y,aim.x,aim.y,reach].every(Number.isFinite) || reach<0 || Math.hypot(aim.x,aim.y)<0.1) return;
  let result:{target:T;pulses:number}|undefined,rank=-1,closest=Infinity;
  for (const target of targets) {
    if (!target.active || !target.isTargetable || ![target.x,target.y,target.hitRadius].every(Number.isFinite) || target.hitRadius<0 || !meleeArcContains(target.x-origin.x,target.y-origin.y,aim.x,aim.y,reach,target.hitRadius) ||
        !clear(origin.x,origin.y,target.x,target.y)) continue;
    const debt=mark(target),pulses=debt ? remainingBleedPulses(debt.bleed,debt.tick) : 0;
    if (!pulses) continue;
    const priority=relayDebtPriority(pulses,debt?.relay===true),distance=Math.hypot(target.x-origin.x,target.y-origin.y);
    if (priority>rank || priority===rank && distance<closest) { result={target,pulses};rank=priority;closest=distance; }
  }
  return result;
}
