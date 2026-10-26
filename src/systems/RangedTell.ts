/** A committed, combat-time tell. The displayed origin/direction is the actual shot. */
export const RANGED_WINDUP_MS = 420;
export const RANGED_SHOT_SPEED = 220;
export const RANGED_SHOT_LIFETIME = 2200;
export type RangedShot = { x: number; y: number; origin: {x:number;y:number} };
export type RangedEvent = {type:'start'|'fire'|'interrupt'|'cancel';shot:RangedShot};
export class RangedTell {
  phase: 'ready'|'windup'|'cooldown'|'cancelled' = 'ready';
  remaining = 0;
  private shot: RangedShot = {x:1,y:0,origin:{x:0,y:0}};
  private events: RangedEvent[] = [];
  constructor(readonly interval = 1400) {}
  get winding(): boolean { return this.phase === 'windup'; }
  get progress(): number { return this.winding ? 1-this.remaining/RANGED_WINDUP_MS : 0; }
  get telegraph(): (RangedShot & {progress:number}) | undefined {
    return this.winding ? {...this.shot,origin:{...this.shot.origin},progress:this.progress} : undefined;
  }
  update(delta: number, origin: {x:number;y:number}, target: {x:number;y:number}, canStart: boolean, canContinue: boolean): RangedShot | null {
    if(this.phase==='cancelled' || !Number.isFinite(delta) || delta<0)return null;
    if(this.winding){
      if(!canContinue){this.withdraw();return null;}
      this.remaining=Math.max(0,this.remaining-delta);
      if(this.remaining>0)return null;
      this.cooldown(Math.max(0,this.interval-RANGED_WINDUP_MS));
      this.emit('fire');
      return {...this.shot,origin:{...this.shot.origin}};
    }
    this.remaining=Math.max(0,this.remaining-delta);
    if(this.remaining>0 || !canStart)return null;
    const dx=target.x-origin.x,dy=target.y-origin.y,len=Math.hypot(dx,dy);
    if(!Number.isFinite(len))return null;
    this.shot={x:len>0?dx/len:1,y:len>0?dy/len:0,origin:{...origin}};
    this.phase='windup';this.remaining=RANGED_WINDUP_MS;this.emit('start');
    // Starting a new tell never consumes the frame that first revealed it.
    return null;
  }
  /** Cancel a committed shot without claiming a player-earned interrupt. */
  withdraw(): boolean {
    if(!this.winding)return false;
    this.cooldown(180);this.emit('cancel');return true;
  }
  interrupt(): boolean {
    if(!this.winding)return false;
    this.cooldown(RANGED_WINDUP_MS);this.emit('interrupt');return true;
  }
  drainEvents(): RangedEvent[] { const events=this.events;this.events=[];return events; }
  cancel(): void {this.phase='cancelled';this.remaining=0;this.events=[];}
  private cooldown(duration: number): void {this.phase='cooldown';this.remaining=duration;}
  private emit(type: RangedEvent['type']): void {
    if(this.events.length>=4)this.events.shift();
    this.events.push({type,shot:{...this.shot,origin:{...this.shot.origin}}});
  }
}
