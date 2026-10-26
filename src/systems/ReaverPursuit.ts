/** Movement only: an earned kill ticket or an externally paid wound. No invulnerability or tracking. */
export const REAVER_PURSUIT = { window: 1200, speed: 480, maxTravel: 64, landingMargin: 10 } as const;

/** Target selection is read-only. Movement follows the player's committed movement direction. */
export function pursuitTravel(
  dx: number, dy: number, moveX: number, moveY: number,
  aimX: number, aimY: number, reach: number, radius: number,
): number | null {
  if (![dx,dy,moveX,moveY,aimX,aimY,reach,radius].every(Number.isFinite) || reach < 0 || radius < 0) return null;
  const distance = Math.hypot(dx,dy), movement = Math.hypot(moveX,moveY), aim = Math.hypot(aimX,aimY);
  if (movement < 0.1 || aim < 0.1 || distance <= reach+radius ||
      distance > reach+radius+REAVER_PURSUIT.maxTravel-REAVER_PURSUIT.landingMargin) return null;
  const nx=moveX/movement, ny=moveY/movement;
  // Do not turn a retreat or a sideways swing into an unwanted approach.
  if ((nx*aimX+ny*aimY)/aim < 0.75 || (nx*dx+ny*dy)/distance < 0.94) return null;
  return Math.min(REAVER_PURSUIT.maxTravel, distance-(reach+radius-REAVER_PURSUIT.landingMargin));
}

export class ReaverPursuit {
  remaining = 0;
  private travelLeft = 0;
  private committed = false;
  private dx = 1;
  private dy = 0;
  get available(): boolean { return this.remaining > 0 && !this.committed; }
  get active(): boolean { return this.committed; }
  /** Rendering only: the actual fixed-step distance budget, never another clock. */
  get travelRemaining(): number { return this.committed ? this.travelLeft : 0; }
  get moving(): boolean { return this.committed && this.travelLeft > 0; }
  get strikeReady(): boolean { return this.committed && this.travelLeft <= 0; }
  get direction(): {x:number;y:number} { return {x:this.dx,y:this.dy}; }
  earn(): void { this.remaining = REAVER_PURSUIT.window; }
  update(delta: number): void {
    if (Number.isFinite(delta) && delta > 0) this.remaining = Math.max(0,this.remaining-delta);
  }
  start(x: number, y: number, travel: number, paidWound = false): boolean {
    const length=Math.hypot(x,y);
    if (this.active || (!this.available && !paidWound) || !Number.isFinite(length) || length < 0.1 || !Number.isFinite(travel) || travel <= 0 || travel > REAVER_PURSUIT.maxTravel) return false;
    if (!paidWound) this.remaining=0;
    this.committed=true; this.travelLeft=travel;
    this.dx=x/length; this.dy=y/length;
    return true;
  }
  /** Budget every native fixed step, including physics catch-up before Scene.update. */
  velocityForStep(stepMs: number): {x:number;y:number} {
    if (!this.moving || !Number.isFinite(stepMs) || stepMs <= 0) return {x:0,y:0};
    const speed=Math.min(REAVER_PURSUIT.speed,this.travelLeft/(stepMs/1000));
    return {x:this.dx*speed,y:this.dy*speed};
  }
  advancePhysics(stepMs: number): void {
    if (this.moving && Number.isFinite(stepMs) && stepMs > 0)
      this.travelLeft=Math.max(0,this.travelLeft-REAVER_PURSUIT.speed*stepMs/1000);
  }
  consumeStrike(): {x:number;y:number} | null {
    if (!this.strikeReady) return null;
    this.committed=false;
    return this.direction;
  }
  cancel(): void { this.remaining=0; this.travelLeft=0; this.committed=false; }
}

/** A read-only instruction, never an authorization to move, attack or spend a wound. */
export type PursuitCueStage = 'move' | 'release' | 'recover' | 'buffered' | 'ready';
export function pursuitCueStage(aligned: boolean, held: boolean, buffered: boolean, attackRemaining: number): PursuitCueStage {
  if (aligned && buffered) return 'buffered';
  if (held) return 'release';
  if (!aligned) return 'move';
  return !Number.isFinite(attackRemaining) || attackRemaining > 0 ? 'recover' : 'ready';
}
