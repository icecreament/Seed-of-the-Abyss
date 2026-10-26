/** Rendering-only mapping from the original committed attack and ordinary dash clocks.
 * An ambush pose is a committed stealth break, not hit confirmation. A backstep
 * pose is only an actually consumed return used with no movement override.
 */
export function shadeAmbushFrame(remaining: number, duration: number): number | undefined {
  if (![remaining,duration].every(Number.isFinite) || duration <= 0 || remaining <= 0 || remaining > duration) return undefined;
  return Math.min(3,Math.floor((duration-remaining)*4/duration));
}
export function shadeBackstepFrame(remaining: number, duration: number): number | undefined {
  if (![remaining,duration].every(Number.isFinite) || duration <= 0 || remaining <= 0 || remaining > duration) return undefined;
  return Math.min(1,Math.floor((duration-remaining)*2/duration));
}
