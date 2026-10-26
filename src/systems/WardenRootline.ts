import { segmentCircleEntry, segmentRectEntry } from './CombatFeel';

/** This projectile carries the ALREADY paid counter's snapshotted damage; it grants no charge or basic hit. */
export const WARDEN_ROOTLINE = { range: 280, speed: 560, radius: 8, max: 4 } as const;
export interface RootlineTarget { x: number; y: number; hitRadius: number; active: boolean; isTargetable: boolean }
export interface RootlineView { readonly id: number; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number; readonly travelled: number; readonly damage: number }
export interface RootlineWave<T> extends RootlineView {
  x: number; y: number; travelled: number;
  readonly ox: number; readonly oy: number; readonly hit: Set<T>;
}
type Wall = { x: number; y: number; width: number; height: number };

/** Scene-owned bounded flight, advanced only with original combat delta. No Phaser/timers/HP writes. */
export class WardenRootlines<T extends RootlineTarget> {
  private nextId = 0;
  private readonly waves: RootlineWave<T>[] = [];
  get active(): readonly RootlineWave<T>[] { return this.waves; }
  clear(): void { this.waves.length = 0; }
  launch(x: number, y: number, dx: number, dy: number, damage: number, skipped: Iterable<T> = [], capacity: number = WARDEN_ROOTLINE.max): RootlineWave<T> | undefined {
    if (![x,y,dx,dy,damage,capacity].every(Number.isFinite) || damage<1 || this.waves.length>=Math.min(WARDEN_ROOTLINE.max,Math.floor(capacity))) return;
    const length=Math.hypot(dx,dy); if (!Number.isFinite(length) || length<1e-9) return;
    const wave: RootlineWave<T>={id:++this.nextId,x,y,ox:x,oy:y,dx:dx/length,dy:dy/length,damage:Math.floor(damage),travelled:0,hit:new Set(skipped)};
    this.waves.push(wave); return wave;
  }
  step(delta: number, walls: readonly Wall[], targets: readonly T[], onHit: (target:T,wave:RootlineWave<T>)=>boolean | void): void {
    if (!Number.isFinite(delta) || delta<=0) return;
    for (const wave of [...this.waves]) {
      if (!this.waves.includes(wave)) continue;
      const before=wave.travelled,distance=Math.min(WARDEN_ROOTLINE.range-before,WARDEN_ROOTLINE.speed*delta/1000),ax=wave.x,ay=wave.y,bx=ax+wave.dx*distance,by=ay+wave.dy*distance;
      let wallEntry=Infinity;
      for (const w of walls) {
        const r=WARDEN_ROOTLINE.radius,t=segmentRectEntry(ax,ay,bx,by,{x:w.x-r,y:w.y-r,width:w.width+2*r,height:w.height+2*r});
        if(t!==null && t<wallEntry)wallEntry=t;
      }
      const contacts: {target:T;t:number}[]=[];
      for (const target of targets) {
        if (!target.active || !target.isTargetable || wave.hit.has(target) || ![target.x,target.y,target.hitRadius].every(Number.isFinite) || target.hitRadius<0 || (target.x-wave.ox)*wave.dx+(target.y-wave.oy)*wave.dy<=0) continue;
        const t=segmentCircleEntry(ax,ay,bx,by,target.x,target.y,target.hitRadius+WARDEN_ROOTLINE.radius);
        if(t!==null && t<wallEntry)contacts.push({target,t});
      }
      contacts.sort((a,b)=>a.t-b.t);
      for(const {target,t} of contacts) {
        // A previous contact may have killed/disabled another target or ended the scene.
        if(!target.active || !target.isTargetable || wave.hit.has(target))continue;
        wave.x=ax+(bx-ax)*t;wave.y=ay+(by-ay)*t;wave.travelled=before+distance*t;
        wave.hit.add(target);
        if(onHit(target,wave)===false){this.clear();return;}
        if(!this.waves.includes(wave))return;
      }
      const t=Math.min(1,wallEntry);
      wave.x=ax+(bx-ax)*t;wave.y=ay+(by-ay)*t;wave.travelled=before+distance*t;
      if(wallEntry<=1 || wave.travelled>=WARDEN_ROOTLINE.range-1e-9)this.waves.splice(this.waves.indexOf(wave),1);
    }
  }
}
