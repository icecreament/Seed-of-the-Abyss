/** A held mouse attack belongs to the press that began in the world, not UI polling. */
export class WorldPointerAttack {
  private owner: number | null = null;

  /** Call only for an accepted scene/world left-button press (after UI propagation). */
  press(pointerId: number): void {
    if (Number.isInteger(pointerId) && pointerId >= 0) this.owner = pointerId;
  }

  release(pointerId: number): void {
    if (this.owner === pointerId) this.clear();
  }

  held(pointerId: number, leftDown: boolean): boolean {
    if (this.owner === null || this.owner !== pointerId) return false;
    // Also recover if the release occurred outside the canvas / between scene frames.
    if (!leftDown) { this.clear(); return false; }
    return true;
  }

  clear(): void { this.owner = null; }
}
