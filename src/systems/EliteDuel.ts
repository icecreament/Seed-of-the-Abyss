/** Combat-time state machine for the third-floor root hammer. No timers or Phaser. */
export const ELITE_DUEL = {
  windup: 1050,
  recovery: 900,
  brokenRecovery: 1250,
  cooldown: 2400,
  introduction: 700,
  radius: 94,
  engageRange: 130,
  exposedMultiplier: 1.25,
} as const;
export type ElitePhase = 'ready' | 'windup' | 'exposed' | 'cancelled';
export type EliteEvent = { type: 'windup' | 'slam' | 'break'; x: number; y: number; radius: number };

export class EliteDuel {
  phase: ElitePhase = 'ready';
  remaining = 0;
  cooldown = ELITE_DUEL.introduction as number;
  pressure = 0;
  readonly threshold: number;
  x = 0;
  y = 0;
  private exposureDuration = 1;
  private events: EliteEvent[] = [];
  constructor(maxHp: number) {
    this.threshold = Math.max(20, Math.ceil(maxHp * 0.16));
  }
  get windupProgress(): number { return this.phase === 'windup' ? 1 - this.remaining / ELITE_DUEL.windup : 0; }
  get exposureProgress(): number { return this.phase === 'exposed' ? this.remaining / this.exposureDuration : 0; }
  get anchored(): boolean { return this.phase === 'windup' || this.phase === 'exposed'; }
  get exposed(): boolean { return this.phase === 'exposed'; }
  get multiplier(): number { return this.exposed ? ELITE_DUEL.exposedMultiplier : 1; }

  update(delta: number, x: number, y: number, canEngage: boolean): void {
    if (this.phase === 'cancelled' || !Number.isFinite(delta) || delta < 0) return;
    // Never skip a fresh tell/recovery on a long frame. One phase transition per tick.
    // In particular, starting a windup does NOT consume the frame that revealed it.
    if (this.phase === 'ready') {
      this.cooldown = Math.max(0, this.cooldown - delta);
      if (this.cooldown === 0 && canEngage) {
        this.phase = 'windup';
        this.remaining = ELITE_DUEL.windup;
        this.pressure = 0;
        this.x = x; this.y = y;
        this.emit('windup');
      }
      return;
    }
    this.remaining = Math.max(0, this.remaining - delta);
    if (this.remaining > 0) return;
    if (this.phase === 'windup') {
      this.recover(ELITE_DUEL.recovery);
      this.emit('slam');
    } else {
      this.phase = 'ready';
      this.cooldown = ELITE_DUEL.cooldown;
      this.pressure = 0;
    }
  }
  /** Receives effective damage once. A lethal hit is cancelled by the entity instead. */
  hit(amount: number): boolean {
    if (this.phase !== 'windup' || !Number.isFinite(amount) || amount <= 0) return false;
    this.pressure = Math.min(this.threshold, this.pressure + amount);
    if (this.pressure < this.threshold) return false;
    this.recover(ELITE_DUEL.brokenRecovery);
    this.emit('break');
    return true;
  }
  drainEvents(): EliteEvent[] { const events = this.events; this.events = []; return events; }
  cancel(): void {
    this.phase = 'cancelled'; this.remaining = 0; this.pressure = 0; this.events = [];
  }
  private recover(duration: number): void {
    this.phase = 'exposed'; this.remaining = this.exposureDuration = duration;
  }
  private emit(type: EliteEvent['type']): void {
    // At most one active enemy produces these events, and the scene drains every frame.
    if (this.events.length >= 4) this.events.shift();
    this.events.push({type,x:this.x,y:this.y,radius:ELITE_DUEL.radius});
  }
}
