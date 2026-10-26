import type { ClassId } from '../data/classes';

export type ContactStrength = 'normal' | 'critical' | 'payoff';
export interface ContactStroke {
  points: readonly (readonly [number, number])[];
  width: number;
  color: number;
  alpha: number;
}
const MATERIALS: Record<ClassId, readonly [number, number, number]> = {
  warden: [0xe0e8ca, 0x769f95, 135],
  reaver: [0xe6b99d, 0xad5e58, 140],
  shade: [0xe2d9f4, 0xa18abf, 95],
  thorn: [0xe6dca1, 0x90b172, 125],
};

/** A replacement for the generic hit spark, not an extra emitter or hit authority. */
export function contactStrikeDuration(id: ClassId, strength: ContactStrength): number {
  return MATERIALS[id][2] + (strength === 'payoff' ? 35 : strength === 'critical' ? 25 : 0);
}

/** Tiny outlined material cuts in attack-local coordinates. Pure, bounded and deterministic.
 * Motion-off keeps the contact silhouette, but removes shell spread / carried splinters.
 * Positions are rounded only after rotation, retaining the game's nearest/pixel language.
 */
export function contactStrikeFrame(
  id: ClassId, strength: ContactStrength, age: number, angle: number, motion = true,
): ContactStroke[] {
  const duration = contactStrikeDuration(id, strength);
  if (!Number.isFinite(age) || age < 0 || age >= duration || !Number.isFinite(angle)) return [];
  const t = age / duration, scale = strength === 'payoff' ? 1.22 : strength === 'critical' ? 1.12 : 1;
  const carry = motion ? (1 - (1 - t) ** 2) * 3 : 0;
  const alpha = Math.min(1, (1 - t) / 0.8);
  const [light, material] = MATERIALS[id], dx = Math.cos(angle), dy = Math.sin(angle);
  const strokes: ContactStroke[] = [];
  const stroke = (points: readonly (readonly [number, number])[], width: number, color = light) => {
    strokes.push({ points: points.map(([x, y]) => [
      Math.round((x * dx - y * dy) * scale), Math.round((x * dy + y * dx) * scale),
    ] as const), width, color, alpha });
  };
  if (id === 'warden') {
    // A broad notched edge and two short chips: pressure, not a radial star.
    stroke([[-6, -12], [3, 0], [8, 11]], 3);
    stroke([[-1, -11], [8, -1], [4, 5]], 1, material);
    stroke([[9 + carry, -6], [13 + carry, -9]], 2, material);
    stroke([[-6, 10 + carry], [-9, 13 + carry]], 1, material);
  } else if (id === 'reaver') {
    // Unequal hooked rakes follow the real cut. No additional blood-particle spray.
    stroke([[-11, -9], [1, -5], [9 + carry, -8]], 2, material);
    stroke([[-14, -1], [3, 2], [12 + carry, -1]], 2);
    stroke([[-9, 8], [1, 10], [8 + carry, 6]], 1, material);
  } else if (id === 'shade') {
    // A narrow blade entry, deliberately quieter and shorter than the heavy cut.
    stroke([[-14, 3], [2, -2], [15 + carry, -5]], 1);
    stroke([[2, -7], [6, -1], [5, 3]], 1, material);
  } else {
    // Two connected shell lips open locally; no fake area-of-effect circle.
    for (const side of [-1, 1]) {
      stroke([[-5, side * (3 + carry)], [1, side * (8 + carry)], [7, side * (4 + carry)]], 2,
        side === -1 ? light : material);
    }
    stroke([[-8, 0], [5, 0], [9, -2]], 1);
  }
  return strokes;
}
