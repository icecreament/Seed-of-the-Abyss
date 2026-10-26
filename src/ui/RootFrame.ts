import Phaser from 'phaser';
import { UI } from './theme';

/** Clipped stone plate with restrained dry-root corner inlays; never interactive. */
export function drawRootFrame(
  g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number,
  accent: number = UI.teal, alpha = 0.94,
): void {
  const c = 7;
  const points = [
    {x:x+c,y}, {x:x+w-c,y}, {x:x+w,y:y+c}, {x:x+w,y:y+h-c},
    {x:x+w-c,y:y+h}, {x:x+c,y:y+h}, {x,y:y+h-c}, {x,y:y+c},
  ];
  g.fillStyle(UI.bg, alpha).fillPoints(points, true);
  g.lineStyle(1, UI.root, 0.8).strokePoints(points, true);
  g.lineStyle(1, accent, 0.4).lineBetween(x+14,y+1,x+Math.min(w-14,72),y+1);
  for (const [cx, cy, sx, sy] of [[x,y,1,1],[x+w,y+h,-1,-1]]) {
    g.lineStyle(1, UI.rootLight, 0.65);
    g.beginPath().moveTo(cx+sx*4,cy+sy*26).lineTo(cx+sx*10,cy+sy*17)
      .lineTo(cx+sx*8,cy+sy*9).lineTo(cx+sx*24,cy+sy*4).strokePath();
    g.lineBetween(cx+sx*10,cy+sy*17,cx+sx*19,cy+sy*17);
    g.fillStyle(accent, 0.65).fillRect(cx+sx*9-1,cy+sy*16-1,2,2);
  }
}

export function drawAbilityGlyph(g: Phaser.GameObjects.Graphics, x: number, y: number, kind: number, accent: number): void {
  g.lineStyle(2, accent, 1);
  if (kind === 0) {
    g.lineBetween(x-7,y+8,x+7,y-8).lineBetween(x-7,y+2,x-1,y+8)
      .lineBetween(x-8,y+9,x-11,y+12).lineBetween(x+7,y-8,x+7,y-2);
  } else if (kind === 1) {
    for (let i=0;i<3;i++) {
      const bx=x-10+i*8;
      g.beginPath().moveTo(bx,y-7).lineTo(bx+6,y).lineTo(bx,y+7).strokePath();
    }
  } else {
    g.strokePoints([{x,y:y-12},{x:x+10,y:y-4},{x:x+7,y:y+7},{x,y:y+12},{x:x-7,y:y+7},{x:x-10,y:y-4}],true);
    g.lineBetween(x,y-5,x,y+6).lineBetween(x,y+1,x-4,y-3).lineBetween(x,y+4,x+4,y);
  }
}

/** One pod, not a three-seed progress meter aggregated across different enemies. */
export function drawBloomGlyph(g: Phaser.GameObjects.Graphics, x: number, y: number, ripe: boolean, accent: number): void {
  g.lineStyle(2, accent, 1);
  g.lineBetween(x, y+6, x, y+12).lineBetween(x, y+10, x-6, y+7);
  const split = ripe ? 4 : 0;
  g.strokePoints([{x:x-split,y:y-11},{x:x-9-split,y:y-3},{x:x-6,y:y+5},{x,y:y+8}],false);
  g.strokePoints([{x:x+split,y:y-11},{x:x+9+split,y:y-3},{x:x+6,y:y+5},{x,y:y+8}],false);
  if (ripe) {
    g.fillStyle(accent,1).fillRect(x-2,y-3,4,6);
    g.lineBetween(x-13,y-8,x-16,y-11).lineBetween(x+13,y-8,x+16,y-11);
  } else {
    g.lineBetween(x,y-8,x,y+3);
  }
}
