import type { PixelCanvas } from './PixelFactory';
import { line, polygon, type Point } from './PixelPrimitives';
import { combatStance, wardenReleaseStance } from './CombatStance';

const C = {
  ink: '#10131c', dark: '#282a35', steel: '#666e70', edge: '#a5ada4',
  bone: '#e8e0c9', boneShade: '#a9ad99', cloth: '#30273f', fold: '#4b3c59',
  wood: '#414337', bark: '#77765a', root: '#94916b', teal: '#3ecfbf',
  tealDark: '#245a55', core: '#b6f0d5',
};

/** 0–13 original cells; 14–17 paid reprisal release for its independent atlas. */
export function drawParasiticWarden(pc: PixelCanvas, frame: number): void {
  const release = frame >= 14 && frame <= 17;
  const {attack,dash,bob,lean,step,phase} = release ? wardenReleaseStance(frame-14) : combatStance('warden',frame);
  const poly = (color: string, ...points: Point[]) => polygon(pc, color, points.map(([x,y]) => [x + lean, y + bob]));
  // Short divided cloth stays behind the legs; soles stay anchored while breathing.
  poly(C.ink, [10,10], [23,11], [24,25], [19,24], [17,26], [8,25]);
  poly(C.cloth, [10,12], [15,13], [13,23], [9,24]);
  poly(C.fold, [10,14], [12,14], [11,22], [10,23]);
  poly(C.cloth, [19,14], [22,13], [23,24], [20,23]);
  pc.rect(11 + step, 21, 4, 6, C.ink);
  pc.rect(17 - step, 21, 4, 6, C.ink);
  pc.rect(12 + step, 22, 2, 4, C.steel);
  pc.rect(18 - step, 22, 2, 4, C.dark);
  pc.rect(10 + step, 27, 5, 2, C.ink);
  pc.rect(17 - step, 27, 5, 2, C.ink);
  pc.rect(11 + step, 27, 3, 1, C.edge);
  pc.rect(18 - step, 27, 3, 1, C.steel);
  // Broken breastplate and overlapping lower plates.
  poly(C.ink, [10,11], [21,11], [24,15], [21,22], [11,22], [8,16]);
  poly(C.steel, [11,12], [17,12], [20,16], [17,20], [11,19], [10,15]);
  poly(C.edge, [11,12], [16,12], [14,14], [10,15]);
  poly(C.dark, [18,12], [22,14], [21,19], [17,20]);
  poly(C.ink, [11,20], [21,20], [21,22], [11,23]);
  poly(C.steel, [12,20], [20,20], [19,21], [12,21]);
  // Compact dry wood shoulder; irregular bark, not leafy druid armor.
  poly(C.ink, [5,11], [8,8], [12,9], [14,13], [12,18], [6,19], [4,16]);
  poly(C.wood, [6,12], [9,10], [11,11], [12,14], [10,17], [6,17]);
  poly(C.bark, [6,12], [8,10], [9,12], [7,16], [6,16]);
  poly(C.root, [9,11], [11,12], [10,15], [8,17], [8,15]);
  poly(C.wood, [6,17], [10,17], [9,21], [7,22], [5,20]);
  poly(C.bark, [6,18], [8,18], [7,20], [6,20]);
  poly(C.steel, [21,12], [24,13], [25,18], [23,20], [21,17]);
  poly(C.edge, [22,13], [24,14], [24,16], [22,15]);
  // Helmet top plane and dark eye slit read from overhead.
  poly(C.ink, [12,3], [18,3], [21,6], [20,11], [16,13], [11,10], [10,6]);
  poly(C.boneShade, [12,4], [17,4], [19,6], [19,10], [16,11], [12,10], [11,7]);
  poly(C.bone, [12,4], [16,4], [15,7], [11,7]);
  poly(C.edge, [17,5], [19,6], [19,9], [17,10]);
  poly(C.ink, [11,8], [19,7], [19,9], [12,10]);
  poly(C.bone, [15,8], [16,8], [16,11], [15,10]);
  // Root stitches lead to a small breathing seed, not a luminous shield.
  const coreX = 16 + lean, coreY = 16 + bob;
  line(pc, [8 + lean,12 + bob], [14 + lean,15 + bob], C.root);
  line(pc, [14 + lean,15 + bob], [13 + lean,19 + bob], C.tealDark);
  line(pc, [18 + lean,17 + bob], [21 + lean,19 + bob], C.tealDark);
  pc.rect(coreX - 2, coreY - 2, 4, 5, C.tealDark);
  pc.rect(coreX - 1, coreY - 1, 2, 3, frame === 4 || frame === 7 ? C.teal : C.core);
  pc.p(coreX, coreY - 1, C.bone);
  if (release) {
    // The committed contact cell is already driving the blade through, never winding up.
    const gx=[17,18,21,24][phase]+lean, gy=[17,18,19,19][phase]+bob;
    const angle=[0.2,0.85,-0.85,-1.4][phase];
    // Dry-root forearm braces the grip; both hands stay attached to the torso.
    poly(C.ink,[6,17],[9,17],[14,20],[gx-lean,gy-bob-1],[gx-lean+1,gy-bob+2],[14,23],[9,21]);
    poly(C.wood,[8,18],[10,18],[14,21],[gx-lean,gy-bob],[gx-lean,gy-bob+1],[14,22],[10,20]);
    line(pc,[10+lean,19+bob],[14+lean,21+bob],C.bark);
    line(pc,[23+lean,15+bob],[gx,gy],C.ink);
    line(pc,[23+lean,16+bob],[gx,gy+1],C.steel);
    const blade=(c:string,...points:Point[])=>polygon(pc,c,points.map(([u,v])=>[
      Math.round(gx+Math.cos(angle)*u-Math.sin(angle)*v),
      Math.round(gy+Math.sin(angle)*u+Math.cos(angle)*v),
    ]));
    blade(C.ink,[-2,-3],[6,-3],[10,-1],[11,0],[7,3],[-1,2]);
    blade(C.boneShade,[0,-2],[6,-2],[9,0],[6,2],[0,1]);
    blade(C.bone,[1,-2],[6,-2],[9,0],[7,0]);
    blade(C.edge,[1,1],[7,1],[9,0],[6,2]);
    blade(C.bark,[-1,-4],[0,-4],[0,4],[-1,4]);
    pc.rect(gx-2,gy,3,2,C.dark);pc.p(gx-1,gy,C.edge);
    return;
  }
  if (attack) {
    // Contact comes first, with a braced stance and an attached sword arm.
    const angle=[-0.35,0.6,-0.95,-1.3][phase];
    const gx=[18,19,22,24][phase]+lean,gy=[18,19,19,19][phase]+bob;
    line(pc,[23+lean,15+bob],[gx,gy],C.ink);
    line(pc,[23+lean,16+bob],[gx,gy+1],C.steel);
    const blade=(c:string,...points:Point[])=>polygon(pc,c,points.map(([u,v])=>[
      Math.round(gx+Math.cos(angle)*u-Math.sin(angle)*v),
      Math.round(gy+Math.sin(angle)*u+Math.cos(angle)*v),
    ]));
    blade(C.ink,[-2,-2],[8,-2],[11,0],[8,2],[-1,2]);
    blade(C.boneShade,[1,-1],[8,-1],[10,0],[8,1],[1,1]);
    blade(C.edge,[1,1],[9,0],[7,1]);
    blade(C.bark,[-1,-3],[0,-3],[0,3],[-1,3]);
    pc.rect(gx-2,gy,3,2,C.dark);pc.p(gx-1,gy,C.edge);
    return;
  }
  const angle = dash ? -0.25 : -1.4;
  const gripX = 24 + lean, gripY = 19 + bob;
  const tip: Point = [Math.round(gripX + Math.cos(angle) * 9), Math.round(gripY + Math.sin(angle) * 9)];
  line(pc, [gripX - 1, gripY], [tip[0] - 1, tip[1]], C.ink);
  line(pc, [gripX + 1, gripY], [tip[0] + 1, tip[1]], C.ink);
  line(pc, [gripX, gripY], tip, C.edge);
  line(pc, [gripX, gripY - 1], [tip[0], tip[1] - 1], C.boneShade);
  pc.rect(gripX - 2, gripY, 5, 1, C.bark);
  pc.rect(gripX - 1, gripY + 1, 2, 2, C.dark);
  pc.p(gripX, gripY + 1, C.edge);
}

// Preserve the public drawer name while keeping display art separate from combat art.
export { drawWardenPortrait as drawParasiticWardenPortrait } from './HeroPortraits';
