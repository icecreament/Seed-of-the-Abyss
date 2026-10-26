import type { PixelCanvas } from './PixelFactory';
import { line, polygon, type Point } from './PixelPrimitives';

import { combatStance, reaverPounceStance, shadeActionStance } from './CombatStance';

const R = {
  ink: '#10131c', dark: '#2c2c35', steel: '#50555b', edge: '#818783', bone: '#b8b7a5',
  blood: '#702833', red: '#ac3b43', ember: '#e36959', leather: '#59483f',
};
const S = {
  ink: '#10131c', dark: '#211c36', cloth: '#383052', fold: '#55456e',
  seam: '#79648f', edge: '#aaa0ba', violet: '#9278c3', eye: '#7bbbbd',
};
const T = {
  ink: '#10131c', dark: '#1b2a20', cloth: '#2f4a35', bark: '#4d6e4a',
  root: '#87a86e', bone: '#c3d6a3', vine: '#94a779', vineDark: '#465941',
  gold: '#c7aa63', goldDark: '#77623c', seed: '#e8dfb1',
};

function boots(pc: PixelCanvas, step: number, dark: string, edge: string): void {
  for (const [x, offset] of [[11, step], [18, -step]]) {
    pc.rect(x + offset, 21, 4, 8, '#10131c');
    pc.rect(x + offset + 1, 22, 2, 5, dark);
    pc.p(x + offset + 1, 24, edge);
    pc.rect(x + offset - 1, 27, 5, 2, '#10131c');
    pc.rect(x + offset, 27, 3, 1, dark);
  }
}

/** Blood Reaver: broken iron mask, infected left pauldron, single hooked cleaver. */
export function drawReaver(pc: PixelCanvas, frame: number): void {
  const pounce = frame >= 14 && frame <= 19, cell = frame - 14;
  const f = pounce ? reaverPounceStance(cell) : combatStance('reaver', frame);
  const q = (c: string, ...points: Point[]) => polygon(pc, c, points.map(([x,y]) => [x + f.lean, y + f.bob]));
  q(R.ink, [9,13], [22,13], [24,25], [19,24], [17,26], [13,24], [8,25]);
  q(R.blood, [10,16], [15,17], [13,23], [9,24]);
  q(R.blood, [19,17], [21,17], [23,24], [19,22]);
  boots(pc, f.step, R.steel, R.edge);
  q(R.ink, [10,11], [20,10], [24,14], [21,21], [12,22], [8,16]);
  q(R.steel, [11,12], [17,11], [20,14], [17,18], [12,18], [10,15]);
  q(R.edge, [12,12], [16,12], [14,14], [10,15]);
  q(R.dark, [18,12], [22,14], [20,19], [16,19]);
  q(R.blood, [13,15], [16,16], [16,18], [18,19], [17,21], [14,19]);
  pc.p(15 + f.lean, 17 + f.bob, frame === 4 || frame === 6 ? R.red : R.ember);
  q(R.ink, [5,12], [7,8], [10,10], [13,9], [15,13], [12,17], [6,17], [4,15]);
  q(R.blood, [6,12], [8,10], [11,11], [13,13], [11,15], [6,15]);
  q(R.red, [7,12], [10,11], [12,12], [8,13]);
  q(R.edge, [6,11], [7,9], [9,13], [8,14]);
  q(R.dark, [6,17], [10,17], [10,21], [7,22], [5,20]);
  q(R.blood, [6,19], [9,19], [9,21], [7,21]);
  q(R.dark, [21,13], [24,14], [25,19], [22,21], [20,17]);
  q(R.edge, [21,14], [23,15], [23,17], [22,16]);
  q(R.ink, [11,7], [10,3], [13,4], [15,1], [17,4], [20,3], [20,6], [22,8], [20,12], [12,12]);
  q(R.blood, [12,5], [14,6], [15,3], [17,6], [19,5], [20,8], [13,9]);
  q(R.red, [13,6], [16,5], [18,7], [15,8]);
  q(R.ink, [13,7], [19,6], [21,8], [20,12], [17,14], [12,11]);
  q(R.steel, [14,8], [18,7], [20,9], [18,12], [16,12], [13,10]);
  q(R.edge, [14,8], [17,8], [16,9], [13,10]);
  q(R.dark, [19,8], [20,9], [18,12], [17,11]);
  pc.rect(14 + f.lean, 10 + f.bob, 5, 1, R.ink);
  pc.p(15 + f.lean, 10 + f.bob, R.ember);
  pc.p(18 + f.lean, 10 + f.bob, R.red);
  pc.rect(12 + f.lean, 21 + f.bob, 9, 1, R.leather);
  // Local sword geometry rotates around the hand; the full sweep fits the cell.
  const angle = pounce ? [-1.3,-1.15,-0.22,0.85,-0.85,-1.15][cell] : f.attack ? [-0.28, 0.72, -0.72, -1.15][f.phase] : f.dash ? -0.2 : -1.15;
  const gx = (pounce ? [19,19,17,18,20,22][cell] : f.attack ? [17, 17, 20, 22][f.phase] : f.dash ? 17 : 23) + f.lean;
  const gy = (pounce ? [18,17,17,17,18,20][cell] : f.attack ? [17, 17, 18, 20][f.phase] : 20) + f.bob;
  if (pounce) {
    // Shoulder tucked into the approach, then both arms carry the low hooked cut.
    q(R.ink,[7,14],[10,15],[12,19],[10,22],[6,20]);
    q(R.blood,[8,15],[10,17],[10,20],[7,19]);
    line(pc,[7+f.lean,19+f.bob],[gx-2,gy+1],R.ink);
    line(pc,[8+f.lean,19+f.bob],[gx-2,gy],R.red);
  }
  if (f.attack) {
    // The infected arm actually drives the cleaver, not a floating blade turn.
    line(pc,[8+f.lean,18+f.bob],[gx-2,gy],R.ink);
    line(pc,[9+f.lean,18+f.bob],[gx-2,gy-1],R.blood);
  }
  line(pc, [22 + f.lean, 16 + f.bob], [gx, gy], R.ink);
  line(pc, [22 + f.lean, 17 + f.bob], [gx, gy + 1], R.steel);
  const sword = (c: string, ...points: Point[]) => polygon(pc, c, points.map(([u,v]) => [
    Math.round(gx + Math.cos(angle)*u - Math.sin(angle)*v),
    Math.round(gy + Math.sin(angle)*u + Math.cos(angle)*v),
  ]));
  if (f.attack) {
    sword(R.ink, [-2,-2], [7,-3], [11,-2], [11,1], [8,4], [1,3], [0,1]);
    sword(R.steel, [1,-1], [8,-2], [10,-1], [10,1], [7,3], [2,2]);
    sword(R.edge, [3,1], [10,0], [9,2], [7,3], [2,2]);
    sword(R.blood, [2,-1], [7,-2], [5,0], [2,0]);
  } else {
    sword(R.ink, [-2,-2], [9,-2], [12,-1], [10,3], [2,3], [0,1]);
    sword(R.steel, [1,-1], [9,-1], [11,0], [9,2], [2,2]);
    sword(R.edge, [3,1], [10,0], [9,2], [3,2]);
    sword(R.blood, [2,-1], [7,-1], [5,0], [2,0]);
  }
  sword(R.leather, [-3,0], [0,0], [0,1], [-3,1]);
  pc.rect(gx-1, gy, 2, 2, R.dark);
}

/** Veil Shade: pointed hood, two reverse daggers and a connected split scarf. */
export function drawShade(pc: PixelCanvas, frame: number): void {
  const action=frame>=14&&frame<=19,cell=frame-14,backstep=action&&cell>=4;
  const f = action ? shadeActionStance(cell) : combatStance('shade', frame);
  const q = (c: string, ...points: Point[]) => polygon(pc, c, points.map(([x,y]) => [x + f.lean, y + f.bob]));
  q(S.ink, [11,10], [20,10], [22,19], [25+f.flutter,25], [20,24], [19,26], [15,24], [8,26], [10,19]);
  q(S.dark, [12,12], [19,12], [20,20], [23+f.flutter,23], [18,23], [16,21], [10,24]);
  q(S.cloth, [11,14], [13,14], [12,20], [9,24], [10,19]);
  q(S.fold, [12,15], [13,14], [11,21], [10,22]);
  boots(pc, f.step, S.cloth, S.fold);
  q(S.ink, [11,11], [19,11], [22,15], [19,20], [20,23], [12,24], [12,20], [9,15]);
  q(S.cloth, [12,12], [17,12], [19,15], [17,19], [13,19], [11,15]);
  q(S.fold, [12,13], [15,13], [13,16], [11,15]);
  q(S.dark, [17,13], [20,15], [18,19], [16,19]);
  q(S.seam, [12,14], [13,13], [18,17], [17,18]);
  pc.rect(13 + f.lean, 20 + f.bob, 6, 1, S.fold);
  pc.p(16 + f.lean, 20 + f.bob, frame === 4 || frame === 6 ? S.seam : S.violet);
  if(backstep){
    // Moving away while watching the target: the scarf carries forward, not behind the retreat.
    q(S.ink,[18,10],[23,9],[28,7+f.flutter],[27,12],[23,14],[18,12]);
    q(S.fold,[19,11],[23,11],[26,9+f.flutter],[25,12],[22,12]);
  } else if (f.attack) {
    // Scarf trails behind the forward lunge; the silhouette is not another knight.
    q(S.ink,[15,10],[10,8],[7,10],[2,8+f.flutter],[4,13],[10,13],[16,12]);
    q(S.fold,[14,10],[10,10],[7,12],[4,10+f.flutter],[5,12],[11,12]);
  } else {
    q(S.ink, [18,9], [22,8], [25,11+f.flutter], [29,10+f.flutter], [27,14+f.flutter], [23,13], [18,12]);
    q(S.fold, [19,10], [22,10], [25,12+f.flutter], [28,11+f.flutter], [26,13+f.flutter], [22,12]);
  }
  q(S.ink, [15,1], [19,5], [21,10], [19,14], [14,15], [10,12], [10,7]);
  q(S.cloth, [15,3], [18,6], [19,10], [18,12], [14,13], [11,11], [12,7]);
  q(S.fold, [15,3], [16,5], [13,9], [12,11], [11,10], [12,7]);
  q(S.seam, [14,5], [15,4], [14,7], [13,8]);
  q(S.ink, [14,7], [17,7], [19,10], [17,12], [13,12], [12,10]);
  pc.p(13 + f.lean, 10 + f.bob, S.eye);
  pc.p(17 + f.lean, 10 + f.bob, S.violet);
  q(S.fold, [11,12], [15,14], [19,12], [18,15], [14,16], [11,14]);
  // Arms follow each blade rather than leaving floating weapons at the edge.
  const swings: readonly (readonly Point[])[] = [
    [[10,18],[22,14]], [[22,16],[20,19]], [[10,20],[21,19]], [[8,19],[22,20]],
  ];
  const actionHands: readonly (readonly Point[])[] = [
    [[17,15],[21,17]],[[22,16],[13,19]],[[12,18],[20,19]],[[9,18],[21,19]],
    [[12,16],[20,15]],[[10,18],[21,17]],
  ];
  if(action){q(S.dark,[9,13],[12,14],[14,18],[11,20],[9,17]);q(S.fold,[10,14],[12,15],[12,18],[10,17]);}
  const hands: readonly Point[] = action ? actionHands[cell] : f.attack ? swings[f.phase] : f.dash ? [[10,19],[23,19]] : [[7,19],[22,20]];
  for (let i=0; i<2; i++) {
    const [hx,hy] = hands[i];
    const shoulder: Point = [i ? 20 : 10, 14];
    line(pc, [shoulder[0]+f.lean, shoulder[1]+f.bob], [hx+f.lean,hy+f.bob], S.ink);
    line(pc, [shoulder[0]+f.lean, shoulder[1]+f.bob+1], [hx+f.lean,hy+f.bob+1], S.cloth);
    const direction = action ? [[0.12,-0.2],[-0.75,2.5],[2.65,1.1],[2.2,1.2],[-0.25,-0.8],[2.25,-0.6]][cell][i] : f.attack ? [[2.4,-0.12],[-0.22,0.9],[2.1,1.15],[2.2,1.2]][f.phase][i] : i ? 1.2 : 2.2;
    const tip: Point = [Math.round(hx+f.lean+Math.cos(direction)*6),Math.round(hy+f.bob+Math.sin(direction)*6)];
    line(pc, [hx+f.lean,hy+f.bob], tip, S.ink);
    line(pc, [hx+f.lean+1,hy+f.bob], [tip[0]+1,tip[1]], S.edge);
    pc.rect(hx+f.lean-1,hy+f.bob-1,3,2,S.ink);
    pc.p(hx+f.lean,hy+f.bob-1,S.seam);
  }
}

/** Thorn Whisperer: vine hood, bark armor and a cracked seed staff (not a bow). */
export function drawThorn(pc: PixelCanvas, frame: number): void {
  const bloom=frame>=14&&frame<=17,phase=bloom?frame-14:0;
  const stance=combatStance('thorn',bloom?8+phase:frame);
  const f=bloom?{...stance,step:0}:stance;
  const q = (c: string, ...points: Point[]) => polygon(pc, c, points.map(([x,y]) => [x + f.lean, y + f.bob]));
  q(T.ink, [9,11], [20,11], [23,24], [20,26], [16,24], [11,26], [7,24]);
  q(T.dark, [10,13], [18,13], [20,24], [16,22], [11,24], [9,22]);
  q(T.cloth, [9,16], [12,15], [11,22], [8,24]);
  boots(pc, f.step, T.cloth, T.bark);
  q(T.ink, [11,11], [19,11], [22,15], [20,21], [12,23], [9,17]);
  q(T.cloth, [12,12], [18,12], [20,15], [18,20], [13,20], [10,16]);
  q(T.bark, [12,13], [15,12], [14,17], [11,17]);
  q(T.dark, [17,13], [20,15], [18,20], [15,20]);
  q(T.ink, [6,13], [9,10], [12,12], [12,16], [8,19], [5,17]);
  q(T.bark, [7,13], [9,12], [11,13], [10,16], [7,17]);
  line(pc, [8+f.lean,13+f.bob], [7+f.lean,16+f.bob], T.root);
  q(T.ink, [12,4], [17,3], [21,7], [20,12], [16,15], [11,12], [9,8]);
  q(T.cloth, [12,5], [16,4], [19,7], [19,11], [16,13], [12,11], [10,8]);
  q(T.bark, [12,5], [15,5], [13,8], [11,9], [10,8]);
  q(T.ink, [13,7], [17,6], [19,8], [18,11], [15,12], [12,10]);
  q(T.bone, [14,7], [17,7], [18,8], [17,11], [14,11], [13,9]);
  pc.p(14+f.lean,9+f.bob,T.dark); pc.p(17+f.lean,9+f.bob,T.dark);
  // Three dry crown shoots are continuous with the hood, not floating leaves.
  q(T.vineDark, [11,6], [9,2], [11,3], [13,6], [16,5], [18,2], [18,5], [20,3], [19,7]);
  pc.p(10+f.lean,3+f.bob,T.vine); pc.p(18+f.lean,3+f.bob,T.root);
  line(pc,[12+f.lean,13+f.bob],[17+f.lean,16+f.bob],T.vineDark);
  line(pc,[17+f.lean,16+f.bob],[14+f.lean,20+f.bob],T.vine);
  pc.rect(15+f.lean,15+f.bob,3,4,T.goldDark);
  pc.rect(16+f.lean,16+f.bob,1,2,frame === 4 || frame === 6 ? T.gold : T.seed);
  if (bloom) {
    // Hit-confirmed seed crush starts in the release pose, never a fake wind-up.
    // The staff plants while the off-hand closes across the core and opens out.
    const [tipX,tipY,baseX]=[[23,10,27],[24,8,26],[25,6,25],[25,5,25]][phase];
    const handX=Math.round(baseX+(tipX-baseX)*10/(27-tipY));
    line(pc,[20+f.lean,15],[handX,17],T.ink);
    line(pc,[20+f.lean,16],[handX,18],T.bark);
    const [px,py]=[[15,16],[13,17],[9,16],[7,17]][phase];
    line(pc,[8+f.lean,15],[px,py],T.ink);
    line(pc,[9+f.lean,15],[px,py+1],T.cloth);
    pc.rect(px-2,py-1,4,4,T.ink);pc.rect(px-1,py,2,2,T.bark);
    if(phase===0){pc.p(px,py-1,T.root);pc.p(px+1,py,T.gold);}
    else {line(pc,[px-1,py],[px-3,py-2],T.root);line(pc,[px+1,py],[px+2,py-2],T.bark);}
    line(pc,[baseX-1,28],[tipX-1,tipY],T.ink);
    line(pc,[baseX+1,28],[tipX+1,tipY],T.ink);
    line(pc,[baseX,27],[tipX,tipY],T.bark);
    for(let y=tipY+4;y<27;y+=4){const x=Math.round(baseX+(tipX-baseX)*(27-y)/(27-tipY));pc.p(x,y,T.root);}
    polygon(pc,T.ink,[[tipX-3,tipY-3],[tipX,tipY-5],[tipX+3,tipY-3],[tipX+3,tipY+1],[tipX,tipY+4],[tipX-3,tipY+1]]);
    polygon(pc,T.goldDark,[[tipX-2,tipY-2],[tipX,tipY-4],[tipX+2,tipY-2],[tipX+2,tipY+1],[tipX,tipY+3],[tipX-2,tipY+1]]);
    pc.rect(tipX-1,tipY-2,2,3,T.gold);pc.p(tipX-1,tipY-2,T.seed);
    line(pc,[tipX,tipY-3],[tipX-1,tipY+1],T.ink);
  } else if (f.attack) {
    // Planted cast: off-hand opens, staff levers forward, then settles upright.
    // It releases in cell 8, matching the actual projectile's immediate spawn.
    const [tipX,tipY,baseX] = [[28,7,21],[27,6,22],[26,5,23],[25,5,24]][f.phase];
    const staffAt=(y:number)=>baseX+(tipX-baseX)*(27-y)/(27-tipY);
    const handX=Math.round(staffAt(18));
    line(pc,[20+f.lean,15+f.bob],[handX,18],T.ink);
    line(pc,[20+f.lean,16+f.bob],[handX,19],T.bark);
    const palms:readonly Point[] = [[19,13],[18,14],[15,17],[11,18]];
    const palm=palms[f.phase];
    line(pc,[8+f.lean,15+f.bob],palm,T.ink);
    line(pc,[9+f.lean,15+f.bob],[palm[0],palm[1]+1],T.cloth);
    pc.rect(palm[0]-1,palm[1],3,2,T.bark);
    line(pc,[palm[0]-1,palm[1]],[palm[0]-1,palm[1]-2],T.root);
    line(pc,[baseX-1,27],[tipX-1,tipY],T.ink);
    line(pc,[baseX+1,27],[tipX+1,tipY],T.ink);
    line(pc,[baseX,26],[tipX,tipY],T.bark);
    for (let y=13;y<26;y+=4) {const x=Math.round(staffAt(y));pc.rect(x-1,y,3,1,T.vineDark);pc.p(x,y,T.root);}
    polygon(pc,T.ink,[[tipX-3,tipY-2],[tipX,tipY-4],[tipX+3,tipY-2],[tipX+3,tipY+2],[tipX,tipY+5],[tipX-3,tipY+2]]);
    polygon(pc,T.goldDark,[[tipX-2,tipY-1],[tipX,tipY-3],[tipX+2,tipY-1],[tipX+2,tipY+2],[tipX,tipY+4],[tipX-2,tipY+2]]);
    pc.rect(tipX-1,tipY-1,2,3,T.gold);
    pc.p(tipX-1,tipY-1,T.seed);
    line(pc,[tipX,tipY-2],[tipX-1,tipY+2],T.ink);
    if (f.phase===0) {pc.p(tipX+1,tipY,T.seed);pc.p(tipX+1,tipY+1,T.seed);}
  } else {
    const offset = f.dash ? -2 : 0;
    const staffX = 25 + f.lean + offset;
    const staffY = f.bob;
    line(pc,[20+f.lean,15+f.bob],[staffX,18+f.bob],T.ink);
    line(pc,[20+f.lean,16+f.bob],[staffX,19+f.bob],T.bark);
    pc.rect(staffX-1,8+staffY,3,19,T.ink);
    pc.rect(staffX,9+staffY,1,17,T.bark);
    for (let y=12;y<26;y+=4) {
      pc.rect(staffX-1,y+staffY,3,1,T.vineDark); pc.p(staffX,y+staffY,T.root);
    }
    polygon(pc,T.ink,[[staffX-3,4+staffY],[staffX,2+staffY],[staffX+3,4+staffY],[staffX+3,8+staffY],[staffX,11+staffY],[staffX-3,8+staffY]]);
    polygon(pc,T.goldDark,[[staffX-2,5+staffY],[staffX,3+staffY],[staffX+2,5+staffY],[staffX+2,8+staffY],[staffX,10+staffY],[staffX-2,8+staffY]]);
    pc.rect(staffX-1,5+staffY,2,3,T.gold);
    pc.p(staffX-1,5+staffY,T.seed);
    line(pc,[staffX,4+staffY],[staffX-1,8+staffY],T.ink);
  }
}

// Display art has an independent resolution and never changes the combat cells.
export { drawReaverPortrait, drawShadePortrait, drawThornPortrait } from './HeroPortraits';
