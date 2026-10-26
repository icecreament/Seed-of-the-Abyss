/** Grounded bite / shove commitment. Combat time only; no target tracking after the tell. */
export const MELEE_ATTACKS = {
  crawler: { engage: 78, windup: 360, strike: 160, speed: 320 },
  spitter: { engage: 64, windup: 400, strike: 120, speed: 200 },
  brute: { engage: 90, windup: 560, strike: 180, speed: 220 },
} as const;
export const MELEE_MISS_RECOVERY_MS = 450;
export type MeleeAttackKind = keyof typeof MELEE_ATTACKS;
export type MeleePhase = 'ready' | 'windup' | 'strike' | 'recovery' | 'cancelled';

export class MeleeTell {
  phase: MeleePhase = 'ready';
  remaining = 0;
  private dx = 1;
  private dy = 0;
  private physicsRemaining = 0;
  readonly tuning: (typeof MELEE_ATTACKS)[MeleeAttackKind];
  constructor(kind: MeleeAttackKind) { this.tuning = MELEE_ATTACKS[kind]; }
  get active(): boolean { return this.phase === 'windup' || this.phase === 'strike' || this.phase === 'recovery'; }
  get striking(): boolean { return this.phase === 'strike' && this.physicsRemaining > 0; }
  get direction(): {x:number;y:number} { return { x:this.dx, y:this.dy }; }
  get windupProgress(): number { return this.phase === 'windup' ? 1-this.remaining/this.tuning.windup : 0; }
  get recoveryProgress(): number { return this.phase === 'recovery' ? this.remaining/MELEE_MISS_RECOVERY_MS : 0; }

  update(delta:number, targetDx:number, targetDy:number, canStart:boolean): void {
    if (this.phase === 'cancelled' || !Number.isFinite(delta) || delta <= 0) return;
    if (this.phase === 'ready') {
      const distance = Math.hypot(targetDx,targetDy);
      if (!canStart || !Number.isFinite(distance) || distance > this.tuning.engage) return;
      this.dx = distance > 0 ? targetDx/distance : 1;
      this.dy = distance > 0 ? targetDy/distance : 0;
      this.phase = 'windup'; this.remaining = this.tuning.windup;
      // Never consume the frame that first revealed a tell.
      return;
    }
    this.remaining = Math.max(0,this.remaining-delta);
    if (this.remaining > 0) return;
    if (this.phase === 'windup') {
      this.phase = 'strike'; this.remaining = this.physicsRemaining = this.tuning.strike;
    } else if (this.phase === 'strike') this.miss();
    else this.phase = 'ready';
    // Only one transition: a hitch never skips a newly revealed strike / recovery.
  }
  /** Applied before the NEXT native fixed step, never as a teleport. */
  velocityForStep(stepMs:number): {x:number;y:number} {
    if (!this.striking || !Number.isFinite(stepMs) || stepMs <= 0) return {x:0,y:0};
    const speed=this.tuning.speed*Math.min(1,this.physicsRemaining/stepMs);
    return {x:this.dx*speed,y:this.dy*speed};
  }
  /** Arcade may catch up several fixed steps before the next Scene.update on a hitch. */
  advancePhysics(stepMs:number): void {
    if (this.phase==='strike' && Number.isFinite(stepMs) && stepMs>0)
      this.physicsRemaining=Math.max(0,this.physicsRemaining-stepMs);
  }
  /** Actual damage hands recovery to ContactRecovery, so its 450ms is not doubled. */
  landed(): void { if (this.striking) { this.phase = 'ready'; this.remaining = this.physicsRemaining = 0; } }
  /** A real knockback wins over an already launched bite; the old lunge never resumes. */
  miss(): void {
    if (this.phase !== 'strike') return;
    this.phase = 'recovery'; this.remaining = MELEE_MISS_RECOVERY_MS; this.physicsRemaining = 0;
  }
  facing(x:number,y:number): boolean { return Math.hypot(x,y) < 1 || x*this.dx+y*this.dy >= 0; }
  cancel(): void { this.phase = 'cancelled'; this.remaining = this.physicsRemaining = 0; }
}
