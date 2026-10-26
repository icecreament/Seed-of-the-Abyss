import type { ClassId } from '../data/classes';
export type EnemyHitKind = ClassId | 'critical' | 'reprisal' | 'rip' | 'ambush' | 'bloom';
const DURATIONS:Record<EnemyHitKind,number>={warden:100,reaver:110,shade:75,thorn:65,critical:115,reprisal:140,rip:130,ambush:100,bloom:125};
export function enemyHitPriority(kind:EnemyHitKind):number { return kind==='reprisal'||kind==='rip'||kind==='ambush'||kind==='bloom'?3:kind==='critical'?2:1; }
/** Cosmetic cell selection only. No velocity, hitbox, action lock, timer or tween. */
export class EnemyHitReaction {
  private kind?:EnemyHitKind;
  private elapsed=0;
  get remaining():number {return this.kind?Math.max(0,DURATIONS[this.kind]-this.elapsed):0;}
  /** 0 = short brace, 1 = strong fold, 2 = settle. Same-size texture cells. */
  get pose():0|1|2|undefined {
    if(!this.kind)return undefined;
    if(this.elapsed>=DURATIONS[this.kind]*0.6)return 2;
    return enemyHitPriority(this.kind)>=2?1:0;
  }
  begin(kind:EnemyHitKind):boolean {
    // One finite response per contact burst. Ordinary follow-ups cannot flatten a payoff,
    // and equal-rank repeated pellets cannot extend a pose indefinitely.
    if(this.kind&&enemyHitPriority(kind)<=enemyHitPriority(this.kind))return false;
    this.kind=kind;this.elapsed=0;return true;
  }
  update(delta:number):void {
    if(!this.kind||!Number.isFinite(delta)||delta<=0)return;
    this.elapsed+=delta;if(this.elapsed>=DURATIONS[this.kind])this.clear();
  }
  clear():void {this.kind=undefined;this.elapsed=0;}
}
