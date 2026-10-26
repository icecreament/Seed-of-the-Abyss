/** A successful body strike has a short, visible follow-through. Combat time only. */
export const CONTACT_RECOVERY = { duration: 450, recoil: 120 } as const;
export class ContactRecovery {
  remaining = 0;
  private recoilRemaining = 0;
  private dx = 1;
  private dy = 0;
  private cancelled = false;
  get active(): boolean { return this.remaining > 0; }
  get progress(): number { return this.active ? this.remaining / CONTACT_RECOVERY.duration : 0; }
  /** The caller supplies the direction AWAY from the player; zero has a stable fallback. */
  begin(dx: number, dy: number): boolean {
    if (this.cancelled || this.active || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const length = Math.hypot(dx, dy);
    this.dx = length > 0 ? dx / length : 1;
    this.dy = length > 0 ? dy / length : 0;
    this.remaining = CONTACT_RECOVERY.duration;
    this.recoilRemaining = CONTACT_RECOVERY.recoil;
    return true;
  }
  /** Average recoil velocity fraction, so a long frame cannot multiply the step-back. */
  update(delta: number): { x: number; y: number } {
    if (!this.active || !Number.isFinite(delta) || delta <= 0) return { x: 0, y: 0 };
    const consumed = Math.min(delta, this.recoilRemaining);
    this.recoilRemaining -= consumed;
    this.remaining = Math.max(0, this.remaining - delta);
    return consumed > 0 ? { x: this.dx * consumed / delta, y: this.dy * consumed / delta } : { x: 0, y: 0 };
  }
  /** A real player knockback owns the velocity; don't resurrect the old recoil afterward. */
  stopRecoil(): void { this.recoilRemaining = 0; }
  cancel(): void { this.remaining = 0; this.recoilRemaining = 0; this.cancelled = true; }
}
