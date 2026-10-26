/** Reuse the existing bleed clock: a refresh preserves the next pulse's phase. */
export const BLOODBRAND = { duration: 3100, interval: 1000, ratio: 0.3 } as const;

/** Pulses remaining under the actual inclusive bleed deadline, not a new damage multiplier. */
export function remainingBleedPulses(bleedMs: number, nextPulseMs: number): number {
  if (!Number.isFinite(bleedMs) || !Number.isFinite(nextPulseMs) || bleedMs <= 0) return 0;
  return Math.max(0, Math.floor((bleedMs-Math.max(0,nextPulseMs))/BLOODBRAND.interval)+1);
}

/** Round each pulse exactly as a normal hit would, before summing. Bleed never crits. */
export function cashedBleedDamage(baseDamage: number, pulses: number, incomingMultiplier: number): number {
  if (![baseDamage,pulses,incomingMultiplier].every(Number.isFinite) || baseDamage < 0 || incomingMultiplier < 0 || pulses <= 0) return 0;
  return Math.floor(pulses)*Math.max(1,Math.floor(baseDamage*BLOODBRAND.ratio*incomingMultiplier));
}
