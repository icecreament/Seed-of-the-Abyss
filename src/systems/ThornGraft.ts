import { THORN_BLOOM, seedCount } from './ThornBloom';

/** One actual basic hit on an already-ripe target may plant ONE new seed. No damage or recursion. */
export const THORN_GRAFT = { range: 130 } as const;

/** Read-only nearest eligible center inside the radius AND actual wall line of sight.
 * Stable iterable order breaks exact-distance ties. The struck source can have died;
 * only the recipient must still be eligible. Merely querying never plants seeds.
 */
export function findGraftTarget<T extends { x: number; y: number }>(
  source: T, candidates: Iterable<T>, seeds: (target: T) => number,
  eligible: (target: T) => boolean, clearLine: (sx: number, sy: number, tx: number, ty: number) => boolean,
): T | undefined {
  if (![source.x, source.y].every(Number.isFinite)) return undefined;
  let choice: T | undefined, nearest = THORN_GRAFT.range ** 2;
  for (const target of candidates) {
    if (target === source || ![target.x, target.y].every(Number.isFinite) || !eligible(target) || seedCount(seeds(target)) >= THORN_BLOOM.maxSeeds) continue;
    const distance = (target.x-source.x)**2 + (target.y-source.y)**2;
    if (distance > nearest || choice && distance === nearest || !clearLine(source.x, source.y, target.x, target.y)) continue;
    choice = target; nearest = distance;
  }
  return choice;
}
