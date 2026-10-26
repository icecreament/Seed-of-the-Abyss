/** Read-only cells from the existing physical travel and ordinary attack clock.
 * No second timer, extra movement, damage, wind-up or invulnerability.
 */
export function reaverPounceFrame(left: number, travel: number): number | undefined {
  if (![left,travel].every(Number.isFinite) || travel <= 0 || travel > 64 || left < 0 || left > travel) return undefined;
  return left > travel / 2 ? 0 : 1;
}
export function reaverCutFrame(remaining: number, duration: number): number | undefined {
  if (![remaining,duration].every(Number.isFinite) || duration <= 0 || remaining <= 0 || remaining > duration) return undefined;
  return 2 + Math.min(3,Math.floor((duration-remaining)*4/duration));
}
