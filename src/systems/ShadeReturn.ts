/** One hit-confirmed direction fallback for the next ordinary dash, not another dash charge. */
export const SHADE_RETURN = { window: 650 } as const;
type Direction = { x: number; y: number };
export class ShadeReturn {
  private pending?: Direction;
  private back?: Direction;
  private time = 0;
  get remaining(): number { return this.time; }
  get available(): boolean { return this.time > 0 && !!this.back; }
  get direction(): Direction | undefined { return this.available ? { ...this.back! } : undefined; }
  /** Only the actual stealth-consuming strike opens confirmation, never a keypress or ordinary hit. */
  beginStrike(dx: number, dy: number): void {
    this.clear();
    const length = Math.hypot(dx, dy);
    if (![dx, dy, length].every(Number.isFinite) || length < 0.1) return;
    this.pending = { x: -dx / length, y: -dy / length };
  }
  confirmHit(): boolean {
    if (!this.pending) return false;
    this.back = this.pending; this.pending = undefined; this.time = SHADE_RETURN.window;
    return true;
  }
  closeStrike(): void { this.pending = undefined; }
  update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.closeStrike();
    this.time = Math.max(0, this.time - delta);
    if (this.time === 0) this.back = undefined;
  }
  /** Called only when the ordinary dash really executes, even if movement overrides this direction. */
  consume(): Direction | undefined {
    const direction = this.direction;
    this.clear();
    return direction;
  }
  clear(): void { this.pending = this.back = undefined; this.time = 0; }
}
