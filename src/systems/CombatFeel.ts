/** Gameplay time only: pause / choices / hit-stop never eat the combo window. */
export class KillChain {
  count = 0;
  best = 0;
  remaining = 0;
  readonly duration = 3800;
  kill(): number {
    this.count = this.remaining > 0 ? this.count + 1 : 1;
    this.remaining = this.duration;
    this.best = Math.max(this.best, this.count);
    return this.count;
  }
  update(delta: number): void {
    this.remaining = Math.max(0, this.remaining - delta);
    if (!this.remaining) this.count = 0;
  }
}

export const PLAYER_PROJECTILE_RADIUS = 18;

/** Earliest continuous collision, normalized 0..1. No tunneling at low frame rates. */
export function segmentCircleEntry(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,r:number):number|null {
  const dx=bx-ax,dy=by-ay,ox=ax-cx,oy=ay-cy,c=ox*ox+oy*oy-r*r;
  if(c<=0)return 0;
  const a=dx*dx+dy*dy;if(a<1e-10)return null;
  const b=2*(ox*dx+oy*dy),disc=b*b-4*a*c;if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
export function segmentRectEntry(ax:number,ay:number,bx:number,by:number,rect:{x:number;y:number;width:number;height:number}):number|null {
  let enter=0,exit=1;
  for(const [start,delta,min,max] of [[ax,bx-ax,rect.x,rect.x+rect.width],[ay,by-ay,rect.y,rect.y+rect.height]]) {
    if(Math.abs(delta)<1e-10){if(start<min||start>max)return null;continue;}
    const a=(min-start)/delta,b=(max-start)/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    if(enter>exit)return null;
  }
  return enter;
}

/** Shared by melee resolution and held-ambush readiness. Facing is already normalized. */
export function meleeArcContains(dx:number,dy:number,dirX:number,dirY:number,reach:number,hitRadius:number):boolean {
  const distance = Math.hypot(dx,dy);
  return distance <= reach+hitRadius && (dx/(distance||1))*dirX + (dy/(distance||1))*dirY >= 0.15;
}
