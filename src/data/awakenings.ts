import type { ClassId } from './classes';

/** An awakening is a visual expression of an existing mutation, not another stat bonus. */
export interface Awakening {
  readonly mutation: string;
  readonly name: readonly [string, string];
}
export const AWAKENINGS: Readonly<Record<ClassId, Awakening>> = {
  warden: { mutation: 'warden_thorns', name: ['荆冠守誓', 'Thornsworn'] },
  reaver: { mutation: 'reaver_cleave', name: ['赤刃葬礼', 'Crimson Requiem'] },
  shade: { mutation: 'shade_ambush', name: ['无声王刃', 'Silent Sovereign'] },
  thorn: { mutation: 'thorn_seeds', name: ['寄生花冕', 'Gravebloom'] },
};
export function isAwakened(classId: ClassId, owned: readonly string[]): boolean {
  return owned.includes(AWAKENINGS[classId].mutation);
}
export function awakenedHeroKey(classId: ClassId): string { return `hero_${classId}_awakened`; }
export function portraitKey(classId: ClassId, awakened = false): string {
  return `portrait_${classId}${awakened ? '_awakened' : ''}`;
}
