/** Four visual cells owned by the already-committed ordinary attack clock.
 * No extra timer, wind-up, damage, cooldown or input ownership.
 */
export function wardenReleaseFrame(remaining: number, duration: number): number | undefined {
  if (![remaining,duration].every(Number.isFinite) || duration <= 0 || remaining <= 0 || remaining > duration) return undefined;
  return Math.min(3, Math.floor((duration-remaining)*4/duration));
}
