import type { PixelCanvas } from './PixelFactory';

export type Point = readonly [number, number];

/** Integer scanlines: no antialiasing, stable at every render scale. */
export function polygon(pc: PixelCanvas, color: string, points: Point[]): void {
  const low = Math.max(0, Math.min(...points.map(p => p[1])));
  const high = Math.min(pc.h - 1, Math.max(...points.map(p => p[1])));
  for (let y = low; y <= high; y++) {
    const hits: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
        hits.push(ax + (y + 0.5 - ay) * (bx - ax) / (by - ay));
      }
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const left = Math.max(0, Math.ceil(hits[i] - 0.5));
      const right = Math.min(pc.w - 1, Math.floor(hits[i + 1] - 0.5));
      if (left <= right) pc.rect(left, y, right - left + 1, 1, color);
    }
  }
}

export function line(pc: PixelCanvas, a: Point, b: Point, color: string): void {
  let [x, y] = a;
  const [endX, endY] = b;
  const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
  const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    pc.p(x, y, color);
    if (x === endX && y === endY) break;
    const e = 2 * error;
    if (e >= dy) { error += dy; x += sx; }
    if (e <= dx) { error += dx; y += sy; }
  }
}

