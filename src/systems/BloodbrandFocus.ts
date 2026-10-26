/** Presentation-only record of an already paid wound. Never a damage/movement authorization. */
export const BLOODBRAND_FOCUS = { resultMs: 240 } as const;
export type WoundFocusStage = 'committed' | 'hit' | 'miss' | 'lost' | 'cancelled';
export interface WoundFocusState { pulses: number; stage: WoundFocusStage; remaining: number; }

export class BloodbrandFocus {
  private state?: WoundFocusState;
  /** A copied view; the gameplay reservation remains exclusively in RunScene.pursuitBrand. */
  get current(): WoundFocusState | undefined { return this.state ? { ...this.state } : undefined; }
  begin(pulses: number): void {
    this.clear();
    if (!Number.isFinite(pulses) || pulses < 1) return;
    this.state = { pulses: Math.floor(pulses), stage: 'committed', remaining: 0 };
  }
  resolve(stage: Exclude<WoundFocusStage, 'committed'>): void {
    if (this.state?.stage !== 'committed') return;
    this.state = { pulses: this.state.pulses, stage, remaining: BLOODBRAND_FOCUS.resultMs };
  }
  update(delta: number): void {
    if (!this.state || this.state.stage === 'committed' || !Number.isFinite(delta) || delta <= 0) return;
    this.state.remaining = Math.max(0, this.state.remaining - delta);
    if (this.state.remaining === 0) this.clear();
  }
  clear(): void { this.state = undefined; }
}
