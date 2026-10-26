export type AmbushAction = 'attack' | 'dash' | 'skill';

/** Only preserves deliberate physical edge ordering inside ONE input sample.
 * DOM timestamps share a clock across the keyboard and pointer pipelines, whose
 * Phaser callbacks can be delivered in a different order. Ties favor the dodge.
 * This does not buffer an action, choose a target, authorize a hit or add a dash.
 */
export class AmbushInputOrder {
  private attackAt?: number;
  private dashAt?: number;
  private skill = false;

  record(action: AmbushAction, timeStamp: number): void {
    if (!Number.isFinite(timeStamp) || timeStamp < 0) return;
    if (action === 'attack') this.attackAt = Math.min(this.attackAt ?? Infinity, timeStamp);
    else if (action === 'dash') this.dashAt = Math.min(this.dashAt ?? Infinity, timeStamp);
    else if (action === 'skill') this.skill = true;
  }

  consume(): boolean {
    const ordered = !this.skill && this.attackAt !== undefined && this.dashAt !== undefined &&
      this.attackAt < this.dashAt;
    this.clear();
    return ordered;
  }

  clear(): void { this.attackAt = this.dashAt = undefined; this.skill = false; }
}
