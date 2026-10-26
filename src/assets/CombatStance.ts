import type { ClassId } from '../data/classes';

// Rendering only. Frame 8 is already the committed contact/release pose: damage
// and projectiles resolve immediately, so artwork must not add a fake wind-up.
// The four existing cells read contact -> carry-through -> gather -> guard.
const ATTACK: Record<ClassId, readonly (readonly [number, number, number])[]> = {
  warden: [[2, 0, -2], [2, 1, -2], [1, 0, -1], [0, 0, 0]],
  reaver: [[2, 1, -3], [3, 2, -3], [1, 1, -2], [0, 0, -1]],
  shade: [[2, 2, -3], [2, 1, -3], [1, 1, -2], [0, 0, -1]],
  thorn: [[1, 0, -1], [1, 0, -1], [0, 0, 0], [0, 0, 0]],
};

export function combatStance(id: ClassId, frame: number) {
  const attack = frame >= 8 && frame <= 11;
  const dash = frame === 12, hurt = frame === 13;
  const phase = attack ? frame - 8 : 0;
  const pose = attack ? ATTACK[id][phase] : undefined;
  return {
    attack, dash, hurt, phase,
    lean: pose?.[0] ?? (hurt ? -1 : dash && id !== 'warden' ? 1 : 0),
    bob: pose?.[1] ?? (dash ? 2 : [1, 3, 5, 6].includes(frame) ? 1 : 0),
    step: pose?.[2] ?? (frame === 1 ? 1 : frame === 3 ? -1 : 0),
    flutter: attack ? [-3, -2, -1, 0][phase] : frame < 8 ? [0, -1, 0, 1][frame % 4] : dash ? -2 : 0,
  };
}

/** Paid heavy cut: a wider planted stance, not a bigger physics body. */
export function wardenReleaseStance(phase: number) {
  return { attack: true, dash: false, hurt: false, phase,
    lean: [3,3,1,0][phase], bob: [1,2,1,0][phase],
    step: [-3,-3,-1,0][phase], flutter: 0 };
}

/** Two committed approach cells, then contact / low carry / gather / guard.
 * Only sprite geometry changes. The boot soles remain on the original y28 anchor.
 */
export function reaverPounceStance(cell: number) {
  const phase = cell < 2 ? 0 : cell - 2;
  return {
    ...combatStance('reaver',8 + phase),
    lean: [2,3,3,3,1,0][cell], bob: [2,1,1,2,1,0][cell],
    step: [-4,-4,-4,-4,-3,-1][cell],
  };
}

/** Committed ambush: paired blades through contact, crossing carry, gather, guard.
 * The last two cells are the ORIGINAL zero-input return dash, not a new dodge.
 */
export function shadeActionStance(cell: number) {
  const phase=cell<4?cell:0;
  return { ...combatStance('shade',8+phase),
    lean:[3,3,1,0,-1,0][cell], bob:[2,1,1,0,2,1][cell],
    step:[-4,-4,-2,-1,-3,-1][cell], flutter:[-4,-3,-2,-1,2,1][cell] };
}
