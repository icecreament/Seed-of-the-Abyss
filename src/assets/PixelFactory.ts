/**
 * Deterministic pixel-art texture factory.
 * Draws crisp nearest-neighbor sprites (no soft AI blur) into Phaser textures.
 */

type Hex = string;

const P = {
  // Shared abyss palette
  void: '#0b0914',
  deep: '#16122a',
  mid: '#2a2148',
  stone: '#3d3558',
  stoneHi: '#5a4f78',
  bone: '#e8e0d4',
  boneDim: '#b8ae9c',
  ink: '#1a1020',
  // Accents
  teal: '#3ecfbf',
  tealDark: '#1f7a72',
  blood: '#e24b5a',
  bloodDark: '#8a2432',
  violet: '#a78bfa',
  violetDark: '#5b3f9a',
  gold: '#f0c14a',
  goldDark: '#a87a1c',
  slime: '#7ed957',
  slimeDark: '#3d7a2a',
  ember: '#ff8a4c',
  white: '#ffffff',
  transparent: 'transparent',
} as const;

function hexToRgba(hex: string, a = 255): string {
  if (hex === 'transparent') return 'rgba(0,0,0,0)';
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a / 255})`;
}

export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.clear();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  p(x: number, y: number, color: Hex): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.ctx.fillStyle = hexToRgba(color);
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  /** Draw from a row-string map. `.` = empty, other keys map via palette. */
  blit(
    x0: number,
    y0: number,
    rows: string[],
    palette: Record<string, Hex>,
  ): void {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const c = palette[ch];
        if (c) this.p(x0 + x, y0 + y, c);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, color: Hex): void {
    this.ctx.fillStyle = hexToRgba(color);
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  toTexture(scene: Phaser.Scene, key: string): void {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
    scene.textures.addCanvas(key, this.canvas);
    const tex = scene.textures.get(key);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  get source(): HTMLCanvasElement {
    return this.canvas;
  }

  drawFrom(other: PixelCanvas, dx: number, dy: number): void {
    this.ctx.drawImage(other.canvas, dx, dy);
  }

  cloneCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0);
    return c;
  }
}

/** Build a horizontal spritesheet canvas from frame drawers. */
function sheet(
  frameW: number,
  frameH: number,
  frames: Array<(pc: PixelCanvas) => void>,
): PixelCanvas {
  const pc = new PixelCanvas(frameW * frames.length, frameH);
  frames.forEach((draw, i) => {
    const cell = new PixelCanvas(frameW, frameH);
    draw(cell);
    pc.drawFrom(cell, i * frameW, 0);
  });
  return pc;
}

// ---------------------------------------------------------------------------
// Character / enemy pixel maps (32x32)
// ---------------------------------------------------------------------------

const PAL_COMMON = {
  k: P.ink,
  b: P.bone,
  d: P.boneDim,
  v: P.void,
  m: P.mid,
  s: P.stone,
  h: P.stoneHi,
  t: P.teal,
  T: P.tealDark,
  r: P.blood,
  R: P.bloodDark,
  p: P.violet,
  P: P.violetDark,
  g: P.gold,
  G: P.goldDark,
  l: P.slime,
  L: P.slimeDark,
  e: P.ember,
  w: P.white,
} as const;

function drawWarden(pc: PixelCanvas, walk = 0): void {
  // Templar of the Seed: T-visor helm, wide pauldrons, glowing seed core.
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  pc.blit(8, 4, [
    '....kkkkkk....',
    '...kssssssk...',
    '..kssssssssk..',
    '..ksttttttsk..',
    '..ksssttsssk..',
    '..kssssssssk..',
    '.kkkkkkkkkkkk.',
    '.ksssktttksssk.',
    '.ksskttwttkssk.',
    'ksssktttttksssk',
    'ksssktttttksssk',
    '.ksssktttksssk.',
    '.ksskkkkkkkssk.',
    '..kssssssssk..',
    '..kssskkkssk..',
    '..kssk..kssk..',
    '..kssk..kssk..',
    '..kssk..kssk..',
  ], PAL_COMMON);
  // sabatons flush with the greaves, alternate while walking
  pc.rect(10, 22, 4, 5, P.ink);
  pc.rect(16, 22, 4, 5, P.ink);
  pc.rect(11 + foot, 23, 2, 3, P.stone);
  pc.rect(17 - foot, 23, 2, 3, P.stone);

  // tower shield with seed sigil
  pc.blit(1, 13, [
    'kkkkkk.',
    'ktttttk',
    'ktwwwtk',
    'ktwtwtk',
    'ktwwwtk',
    'ktttttk',
    'kTTTTTk',
    '.kkkkkk',
  ], PAL_COMMON);

  // longsword with bright fuller
  pc.blit(26, 6, [
    '.ww.',
    '.ws.',
    '.ws.',
    '.ws.',
    '.ws.',
    '.ws.',
    '.ws.',
    '.ws.',
    'gddg',
    '.kk.',
  ], PAL_COMMON);
}

function drawReaver(pc: PixelCanvas, walk = 0): void {
  // Abyss berserker: jagged mane, war paint, bare torso, bone cleavers.
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  pc.blit(8, 4, [
    '..kk..kk..kk..',
    '..kRRRRRRRRRRk..',
    '..kRRrrRRrrRRk..',
    '...kbbbbbbbbk...',
    '...kbwwbbwwbk...',
    '...kbbRRRRbbk...',
    '....kbbbbbbk....',
    '...kkkkkkkkkk...',
    '..kbbRRRRRRbbk..',
    '..kbRRbbbbRRbk..',
    '.kbbRbbbbbbRbbk.',
    '.kbk.RbbbbbR.kbk.',
    '..kk..kRRRk..kk..',
    '....kbbRRbbk....',
    '....kkRRRRkk....',
    '....kRRkkRRk....',
    '....kbk..kbk....',
    '....kbk..kbk....',
  ], PAL_COMMON);
  pc.rect(12, 22, 4, 5, P.ink);
  pc.rect(17, 22, 4, 5, P.ink);
  pc.rect(13 + foot, 23, 2, 3, P.bloodDark);
  pc.rect(18 - foot, 23, 2, 3, P.bloodDark);

  // twin bone cleavers, hooked edge outward
  pc.blit(2, 10, [
    '...dd',
    '..dbd',
    '.dbbd',
    '.db.d',
    'db..d',
    'db.d.',
    '.bb..',
    '.Rk..',
  ], PAL_COMMON);
  pc.blit(25, 10, [
    'dd...',
    'dbd..',
    'dbbd.',
    'd.bd.',
    'd..bd',
    '.d.bd',
    '..bb.',
    '..kR.',
  ], PAL_COMMON);
}

function drawShade(pc: PixelCanvas, walk = 0): void {
  // Void assassin: lightless hood, glowing eyes, scarf, split cloak hem.
  pc.blit(9, 4, [
    '.....kkkk.....',
    '...kkppppkk...',
    '..kppppppppk..',
    '..kppvvvvppk..',
    '..kvvvvvvvvk..',
    '..kvPPvvPPvk..',
    '..kvvvvvvvvk..',
    '...kvvvvvvk...',
    '..kkkkkkkkkk..',
    '.kpppkkkkpppk.',
    '.kppkppppkppk.',
    'kpppkppppkpppk',
    'kpk.kppppk.kpk',
    '.kk.kppppk.kk.',
    '....kppppk....',
    '...kppPPppk...',
  ], PAL_COMMON);
  // cloak hem stands in for feet; spreads while walking
  if (walk) {
    pc.blit(9, 20, [
      '..kPp....pPk..',
      '..kp......pk..',
      '..kk......kk..',
    ], PAL_COMMON);
  } else {
    pc.blit(9, 20, [
      '...kPp..pPk...',
      '...kp....pk...',
      '...kk....kk...',
    ], PAL_COMMON);
  }

  // scarf streams behind; lifts while walking
  if (walk) {
    pc.blit(24, 7, [
      'ppp...',
      '..pppP',
      '...ppp',
    ], PAL_COMMON);
  } else {
    pc.blit(24, 9, [
      'pp....',
      '.ppp..',
      '..ppP.',
      '...pP.',
    ], PAL_COMMON);
  }
  // reversed dagger, blade down
  pc.blit(6, 15, [
    '.k.',
    'pd.',
    'pd.',
    'dp.',
  ], PAL_COMMON);
}

function drawThorn(pc: PixelCanvas, walk = 0): void {
  // Gardener of the Seed: flower crown, vine mail, great seed staff.
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  pc.blit(9, 4, [
    '...l.lggl.l...',
    '..kllllllllk..',
    '..kbbbbbbbbk..',
    '..kbllbbllbk..',
    '..kbbbbbbbbk..',
    '...kbbbbbbk...',
    '...kkllllkk...',
    '..kkllllllkk..',
    '.kllLllllLllk.',
    '.klLkggggkLlk.',
    'kllLkggggkLllk',
    'klk.LlgglL.klk',
    '.kk.kLllLk.kk.',
    '....kLllLk....',
    '...kLllllLk...',
    '...kllllllk...',
    '...kLkllkLk...',
    '...kk....kk...',
  ], PAL_COMMON);
  pc.rect(12, 22, 4, 5, P.ink);
  pc.rect(17, 22, 4, 5, P.ink);
  pc.rect(13 + foot, 23, 2, 3, P.slimeDark);
  pc.rect(18 - foot, 23, 2, 3, P.slimeDark);

  // thorn staff: vine-wrapped shaft, great golden seed on top
  pc.blit(22, 5, [
    '..gg.',
    '.gwwg.',
    '.gGGg.',
    '..gg.',
    '..L..',
    '.lL..',
    '..L.l',
    '..L..',
    '.lL..',
    '..L..',
    '..L..',
    '..kk.',
  ], PAL_COMMON);
}

function drawCrawler(pc: PixelCanvas, frame = 0): void {
  // Abyss scavenger bug: segmented shell, back spikes, big compound eyes.
  pc.blit(3, 9, [
    '......kk...kk...kk........',
    '....kkRRkkRRRkkRRkk......',
    '..kkRrrrRRrrrRRrrrRkk....',
    '.kRrrrrRrrrrRrrrrRrrkkkk.',
    'kRrrrrrRrrrrRrrrrRrrkwwwwk',
    'kRrrrrRrrrrRrrrrRrrkwkwwkk',
    '.kRrrrrRrrrrRrrrrRrkwwwwk.',
    '..kRrrrrRrrrrRrrrrk.kk.k..',
    '...kkkkkkkkkkkkkkkk...k.k.',
  ], PAL_COMMON);
  // six alternating legs
  for (let i = 0; i < 3; i++) {
    const phase = (i + frame) % 2;
    pc.rect(6 + i * 5 + phase * 2, 18, 2, 4, P.ink);
    pc.rect(9 + i * 5 + (1 - phase) * 2, 19, 2, 3, P.ink);
  }
}

function drawSpitter(pc: PixelCanvas, frame = 0): void {
  // Bloated acid sac: ember glow through taut skin, charging spout.
  pc.blit(8, 6, [
    '....kkkkkkkk....',
    '..kkGGGGGGGGkk..',
    '.kGGeeeeeeeeGGk.',
    '.kGeeewweeeeGGk',
    'kGeeeewwwweeeeGk',
    'kGeewwGGwweeeGGk',
    'kGeeewwwweeeeGGk',
    '.kGeeeeeeeeGGk..',
    '..kkGGGGGGkk....',
    '...kkkkkkkk......',
  ], PAL_COMMON);
  // stubby legs
  pc.rect(10, 16, 2, 3, P.ink);
  pc.rect(14, 17, 2, 2, P.ink);
  pc.rect(18, 17, 2, 2, P.ink);
  pc.rect(22, 16, 2, 3, P.ink);
  // spout on the right: shut normally, swollen and glowing when charging
  if (frame === 1) {
    pc.blit(22, 9, [
      'eek',
      'ewwk',
      'eek',
    ], PAL_COMMON);
  } else {
    pc.blit(23, 9, [
      'kk',
      'kG',
      'kk',
    ], PAL_COMMON);
  }
}

function drawBrute(pc: PixelCanvas, frame = 0): void {
  // Stone-plated juggernaut: hunched shell, low head with tusks, heavy club.
  const swing = frame === 1 ? 1 : 0;
  pc.blit(3, 4, [
    '........kkkkkkkk........',
    '......kksssssssskk......',
    '.....ksshhhhhhhhssk.....',
    '....ksshsssssssshssk....',
    '...kssssksssssskssssk...',
    '..kssssskkkkkkksssssk..',
    '..kssskPPPPPPPPPksssk..',
    '.kssskPpwwpppwwpPksssk.',
    '.ksskPpppppppppPkssk...',
    '..kkkPbbPkkkPbbPkkk....',
    '....kkPPPPPPPPPkk......',
    '...kPPk.......kPPk......',
    '..kPPk.........kPPk.....',
    '..kPk...........kPk.....',
    '.kPk.............kPk....',
    '.kk...............kk....',
  ], PAL_COMMON);
  // trunk legs flush with the shell
  pc.rect(9, 21, 5, 5, P.ink);
  pc.rect(19, 21, 5, 5, P.ink);
  pc.rect(10 + swing, 22, 3, 3, P.violetDark);
  pc.rect(20 - swing, 22, 3, 3, P.violetDark);
  // massive stone club, drags and swings with the walk cycle
  pc.blit(24 + swing, 8, [
    '..kkkk.',
    '.khsshk',
    'khssshk',
    'khssshk',
    '.ksssk.',
    '..dd...',
    '..dd...',
    '..kk...',
  ], PAL_COMMON);
}

function drawFloorTile(pc: PixelCanvas, variant: number): void {
  pc.rect(0, 0, 16, 16, P.deep);
  // brick noise
  const seeds = [
    [1, 1],
    [8, 3],
    [4, 9],
    [12, 12],
    [3, 14],
    [11, 6],
  ];
  for (const [x, y] of seeds) {
    const ox = (x + variant * 3) % 14;
    const oy = (y + variant * 5) % 14;
    pc.p(ox + 1, oy + 1, variant % 2 === 0 ? P.mid : P.void);
  }
  // subtle crack for variant 2
  if (variant === 2) {
    pc.p(5, 7, P.violetDark);
    pc.p(6, 8, P.violet);
    pc.p(7, 9, P.violetDark);
  }
  // edge darken
  for (let i = 0; i < 16; i++) {
    pc.p(i, 0, P.void);
    pc.p(0, i, P.void);
  }
  pc.p(15, 15, P.mid);
}

function drawWallTile(pc: PixelCanvas): void {
  pc.rect(0, 0, 16, 16, P.stone);
  pc.rect(0, 0, 16, 2, P.stoneHi);
  pc.rect(0, 14, 16, 2, P.ink);
  pc.rect(0, 0, 2, 16, P.stoneHi);
  pc.rect(14, 0, 2, 16, P.ink);
  // bricks
  pc.rect(3, 4, 5, 3, P.mid);
  pc.rect(9, 4, 4, 3, P.deep);
  pc.rect(3, 9, 4, 3, P.deep);
  pc.rect(8, 9, 5, 3, P.mid);
  // moss / seed veins
  pc.p(6, 5, P.violetDark);
  pc.p(11, 10, P.tealDark);
}

/**
 * Crescent slash sweep around the +x axis (the scene rotates the sprite to
 * aim). Frame 0: short draw-in arc; frame 1: full crescent, bright outer
 * edge; frame 2: shattering motes. Procedural so the arc stays smooth.
 */
function drawSlash(pc: PixelCanvas, frame: number, hi: Hex, mid: Hex, dark: Hex): void {
  const cx = 16;
  const cy = 16;
  if (frame === 0) {
    for (let deg = -50; deg <= 10; deg += 4) {
      const a = (deg * Math.PI) / 180;
      for (let r = 9; r <= 14; r++) {
        pc.p(
          Math.round(cx + Math.cos(a) * r),
          Math.round(cy + Math.sin(a) * r),
          r > 12 ? hi : mid,
        );
      }
    }
    return;
  }
  if (frame === 1) {
    for (let deg = -60; deg <= 60; deg += 3) {
      const a = (deg * Math.PI) / 180;
      for (let r = 7; r <= 15; r++) {
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        const color = Math.abs(deg) > 50 ? dark : r >= 14 ? hi : r >= 11 ? mid : dark;
        pc.p(x, y, color);
      }
    }
    return;
  }
  for (let deg = -60; deg <= 60; deg += 6) {
    const a = (deg * Math.PI) / 180;
    const r = 10 + (((deg + 60) * 7) % 5);
    pc.p(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), mid);
    pc.p(Math.round(cx + Math.cos(a) * (r + 4)), Math.round(cy + Math.sin(a) * (r + 4)), dark);
  }
}

/** 8x8 projectile with a colored halo around a bright core. */
function drawProjectile(pc: PixelCanvas, kind: 'ember' | 'seed'): void {
  if (kind === 'ember') {
    pc.blit(0, 0, [
      '...ee...',
      '..egge..',
      '.egwwge.',
      'egwwwwge',
      'egwwwwge',
      '.egwwge.',
      '..egge..',
      '...ee...',
    ], PAL_COMMON);
  } else {
    pc.blit(0, 0, [
      '...ll...',
      '..lggl..',
      '.lgwwgl.',
      'lgwwwwgl',
      'lgwwwwgl',
      '.lgwwgl.',
      '..lggl..',
      '...ll...',
    ], PAL_COMMON);
  }
}

/** Orbiting motes for sustained skills (24x24, 2-frame pulse). */
function drawSkillRing(pc: PixelCanvas, frame: number, hi: Hex, mid: Hex): void {
  const r = frame === 0 ? 8 : 10;
  const rot = frame === 1 ? Math.PI / 8 : 0;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 + rot;
    const x = Math.round(11.5 + Math.cos(a) * r);
    const y = Math.round(11.5 + Math.sin(a) * r);
    pc.p(x, y, i % 2 === 0 ? hi : mid);
  }
}

/** Thorn nova: expanding ring of thorn spikes (48x48, 3 frames). */
function drawNovaRing(pc: PixelCanvas, frame: number): void {
  const r = [9, 16, 22][frame] ?? 22;
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    const x = Math.round(23.5 + Math.cos(a) * r);
    const y = Math.round(23.5 + Math.sin(a) * r);
    pc.p(x, y, frame === 2 ? P.slimeDark : P.slime);
    if (frame < 2) {
      pc.p(
        Math.round(23.5 + Math.cos(a) * (r + 2)),
        Math.round(23.5 + Math.sin(a) * (r + 2)),
        P.gold,
      );
    }
  }
}

function drawShadow(pc: PixelCanvas): void {
  pc.blit(0, 0, [
    '..kkkk..',
    '.kkkkkk.',
    'kkkkkkkk',
    '.kkkkkk.',
    '..kkkk..',
  ], { k: '#000000' });
  // soft via alpha not available per-pixel easily; use dark only
}

function drawSeedIcon(pc: PixelCanvas): void {
  pc.blit(8, 4, [
    '................',
    '......kkkk......',
    '....kkpppPkk....',
    '...kppwwwwppk...',
    '..kppwwwwwwppk..',
    '..kpwwtwwtwwpk..',
    '..kpwwttttwwpk..',
    '..kppwwttwwppk..',
    '...kppwwwwppk...',
    '....kkpPPpkk....',
    '....k.kPPk.k....',
    '...k...kk...k...',
    '..k....kk....k..',
    '.k.....TT.....k.',
    'k......tt......k',
    '................',
  ], PAL_COMMON);
}

function drawEssenceOrb(pc: PixelCanvas, frame: number): void {
  const glow = frame === 1;
  pc.blit(0, 0, [
    '..kkkk..',
    '.kppppk.',
    'kpwwpppk',
    'kpwwpppk',
    'kppppppk',
    'kppPPppk',
    '.kppppk.',
    '..kkkk..',
  ], PAL_COMMON);
  if (glow) {
    pc.p(1, 3, P.violet);
    pc.p(6, 4, P.white);
  }
}

function drawUiPanel(pc: PixelCanvas): void {
  // 32x16 nine-slice-ish chunk
  pc.rect(0, 0, 32, 16, P.deep);
  pc.rect(1, 1, 30, 14, P.mid);
  pc.rect(2, 2, 28, 12, P.deep);
  // corners
  pc.p(0, 0, P.violet);
  pc.p(31, 0, P.violet);
  pc.p(0, 15, P.violet);
  pc.p(31, 15, P.violet);
}

function drawHeart(pc: PixelCanvas): void {
  pc.blit(0, 0, [
    '.rr.rr.',
    'rrrrrrr',
    'rrrrrrr',
    '.rrrrr.',
    '..rrr..',
    '...r...',
  ], PAL_COMMON);
}

// 展示肖像独立于战斗精灵：64×80、主体中心 x32、靴底最后一行 y74。
// 整数顶点在像素中心采样，逐行填充且限制边界，不使用抗锯齿路径。
type PortraitPoint = readonly [number, number];
function portraitPolygon(pc: PixelCanvas, color: Hex, points: PortraitPoint[]): void {
  const top = Math.max(0, Math.min(...points.map((p) => p[1])));
  const bottom = Math.min(pc.h - 1, Math.max(...points.map((p) => p[1])));
  for (let y = top; y <= bottom; y++) {
    const scan = y + 0.5;
    const hits: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= scan && by > scan) || (by <= scan && ay > scan)) {
        hits.push(ax + (scan - ay) * (bx - ax) / (by - ay));
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

function drawWardenPortrait(pc: PixelCanvas): void {
  const k = '#10151b', d = '#354047', s = '#707b78', m = '#a9ad9c';
  const l = '#d2d2ba', h = '#ebe4cc', t = '#276862', T = '#64cbb3';
  const q = (c: Hex, ...v: PortraitPoint[]) => portraitPolygon(pc, c, v);
  // 后披帛、承重双腿：宽肩窄腰，骨白甲片遮住深色关节。
  q(k, [22, 23], [40, 23], [45, 66], [36, 63], [31, 67], [19, 66]);
  q('#203d3e', [23, 26], [29, 29], [25, 63], [20, 64]);
  q('#192b32', [35, 28], [39, 26], [43, 63], [35, 60]);
  q(k, [22, 46], [32, 46], [30, 69], [30, 75], [18, 75], [19, 70]);
  q(k, [33, 46], [42, 47], [43, 69], [46, 72], [46, 75], [34, 75]);
  q(s, [23, 49], [30, 50], [28, 60], [21, 61]);
  q(m, [23, 51], [27, 51], [26, 58], [22, 59]);
  q(d, [35, 49], [40, 50], [41, 61], [35, 60]);
  q(m, [21, 60], [28, 59], [29, 64], [25, 67], [20, 64]);
  q(l, [21, 61], [26, 60], [26, 63], [21, 64]);
  q(s, [35, 60], [41, 61], [42, 65], [37, 66], [34, 63]);
  q(m, [21, 66], [27, 67], [27, 71], [19, 72]);
  q(l, [21, 66], [23, 67], [22, 71], [20, 71]);
  q(s, [36, 66], [41, 66], [42, 71], [36, 71]);
  pc.rect(19, 72, 10, 2, s); pc.rect(35, 72, 10, 2, d);
  pc.rect(19, 72, 5, 1, l); pc.rect(36, 72, 4, 1, m);
  pc.rect(18, 74, 12, 1, k); pc.rect(34, 74, 12, 1, k);
  // 胸甲中央折脊与三层腹甲；亮边只落在左上受光面。
  q(k, [23, 24], [39, 24], [44, 32], [39, 47], [24, 47], [19, 32]);
  q(s, [24, 26], [37, 26], [41, 32], [37, 39], [25, 38], [21, 31]);
  q(m, [24, 27], [32, 26], [32, 37], [26, 36], [22, 31]);
  q(l, [24, 27], [31, 27], [29, 30], [23, 31]);
  q(d, [33, 28], [39, 30], [39, 34], [34, 37]);
  q(l, [31, 29], [33, 30], [33, 37], [31, 39]);
  for (let y = 38; y <= 44; y += 3) {
    q(k, [25, y], [39, y], [38, y + 4], [26, y + 4]);
    pc.rect(26, y + 1, 11, 1, s); pc.rect(26, y + 1, 5, 1, m);
  }
  pc.rect(25, 46, 14, 3, d); pc.rect(30, 46, 4, 3, k);
  pc.rect(31, 47, 2, 1, t);
  q(k, [23, 48], [31, 49], [30, 57], [20, 57]);
  q(m, [24, 49], [29, 50], [28, 55], [22, 55]);
  q(k, [33, 49], [40, 48], [43, 56], [34, 57]);
  q(s, [35, 50], [39, 49], [41, 54], [35, 55]);
  pc.rect(23, 51, 6, 1, l); pc.rect(35, 51, 5, 1, m);
  // 肩甲重叠上臂；左手在盾后，右腕延伸到剑柄。
  q(k, [17, 25], [25, 25], [25, 38], [20, 46], [14, 42], [14, 32]);
  q(s, [17, 32], [23, 32], [21, 42], [16, 41]);
  q(k, [39, 25], [47, 27], [48, 38], [52, 41], [51, 48], [44, 46], [40, 36]);
  q(s, [43, 32], [46, 33], [46, 39], [50, 42], [48, 45], [43, 41]);
  q(m, [42, 32], [44, 32], [45, 38], [43, 38]);
  q(k, [14, 24], [23, 22], [28, 28], [25, 34], [14, 35], [11, 30]);
  q(m, [15, 25], [22, 24], [26, 28], [23, 32], [14, 32], [13, 29]);
  q(l, [15, 25], [22, 24], [24, 26], [15, 28], [13, 29]);
  pc.rect(15, 32, 8, 1, s); pc.rect(16, 26, 3, 1, h);
  q(k, [39, 23], [46, 24], [51, 30], [48, 35], [40, 33], [37, 28]);
  q(s, [40, 25], [45, 25], [49, 30], [47, 33], [41, 31], [39, 28]);
  q(m, [40, 25], [44, 25], [47, 28], [41, 28]);
  // 封闭头盔：细窄眼裂、中央鼻梁和下颌，不画裸露面部。
  pc.rect(27, 22, 10, 4, k); pc.rect(28, 23, 7, 2, s);
  q(k, [29, 8], [35, 8], [39, 12], [39, 21], [35, 25], [28, 23], [25, 18], [25, 12]);
  q(m, [29, 10], [34, 10], [37, 13], [37, 20], [34, 23], [29, 21], [27, 17], [27, 13]);
  q(l, [29, 10], [32, 10], [31, 15], [27, 16], [27, 13]);
  q(s, [34, 11], [37, 14], [37, 20], [34, 22], [33, 17]);
  pc.blit(27, 15, ['kkk.kkkk', '.tTktTt.', '..kdkd..', '..sdkd..'], { k, t, T, d, s });
  pc.rect(31, 11, 1, 4, h); pc.rect(32, 17, 1, 5, l);
  // 尖底大盾：暗钢包边、骨质分面、内嵌青绿纹章。
  q(k, [7, 33], [16, 29], [26, 33], [25, 52], [17, 65], [7, 54], [5, 39]);
  q(s, [8, 34], [16, 31], [24, 34], [23, 51], [17, 62], [9, 53], [7, 39]);
  q(l, [8, 35], [16, 32], [16, 58], [10, 52], [8, 39]);
  q(m, [17, 33], [23, 35], [22, 50], [17, 59]);
  q(d, [10, 37], [16, 34], [21, 37], [20, 49], [16, 57], [11, 49]);
  q('#294c4d', [11, 38], [15, 36], [15, 53], [12, 48]);
  pc.blit(12, 39, ['...t...', '..tTt..', '.tTTtt.', '..tTt..', '...T...', '...t...', '..t.t..'], { t, T });
  pc.rect(8, 36, 1, 7, h); pc.p(11, 34, h); pc.p(21, 36, l);
  // 直剑保持垂直，护手、手指和前臂连续相接。
  q(k, [53, 17], [56, 23], [56, 42], [58, 43], [58, 46], [55, 46], [55, 52], [51, 52], [51, 46], [48, 46], [48, 43], [51, 42], [51, 23]);
  q(s, [53, 20], [55, 24], [55, 42], [52, 42], [52, 24]);
  pc.rect(52, 25, 1, 17, l); pc.rect(53, 23, 1, 17, m);
  pc.rect(49, 44, 8, 1, m); pc.rect(52, 46, 2, 5, d);
  pc.rect(50, 45, 4, 4, k); pc.rect(50, 45, 3, 2, s);
  pc.p(50, 45, l); pc.rect(52, 50, 2, 1, m);
}

function drawReaverPortrait(pc: PixelCanvas): void {
  const k = '#160f16', d = '#2c2c35', s = '#50555b', m = '#818783';
  const l = '#b8b7a5', r = '#702833', R = '#ac3b43', e = '#e36959';
  const q = (c: Hex, ...v: PortraitPoint[]) => portraitPolygon(pc, c, v);
  // 撕裂战裙和错开的膝甲承接前倾躯干，红布不替代金属体积。
  q(k, [23, 39], [39, 41], [44, 61], [36, 58], [31, 63], [25, 59], [16, 61]);
  q(r, [24, 43], [30, 46], [26, 57], [19, 58]);
  q('#43202b', [33, 45], [38, 44], [41, 57], [34, 55]);
  q(k, [23, 48], [32, 49], [28, 63], [25, 70], [27, 75], [14, 75], [16, 70], [19, 60]);
  q(s, [24, 51], [29, 52], [25, 62], [20, 62]);
  q(m, [23, 53], [26, 53], [23, 59], [21, 60]);
  q(k, [33, 48], [41, 49], [43, 62], [45, 70], [50, 72], [50, 75], [37, 75], [36, 60]);
  q(d, [35, 52], [40, 52], [41, 61], [37, 63]);
  q(s, [20, 61], [26, 61], [25, 66], [18, 67]);
  q(m, [20, 62], [24, 62], [22, 64], [19, 65]);
  q(s, [37, 61], [42, 62], [44, 67], [38, 67]);
  q(r, [39, 62], [41, 63], [42, 66], [39, 65]);
  q(d, [18, 67], [24, 67], [23, 71], [16, 73]);
  q(s, [38, 68], [43, 68], [44, 71], [48, 73], [38, 73]);
  pc.rect(15, 73, 11, 1, s); pc.rect(38, 73, 10, 1, d);
  pc.rect(14, 74, 13, 1, k); pc.rect(37, 74, 13, 1, k);
  // 铁灰胸甲向右压低，左侧厚重肩甲与右侧绑带形成不对称。
  q(k, [25, 24], [37, 23], [45, 30], [42, 39], [38, 49], [25, 48], [20, 34]);
  q(s, [27, 26], [36, 25], [42, 31], [38, 39], [28, 40], [23, 33]);
  q(m, [27, 27], [34, 26], [33, 30], [25, 33]);
  q(d, [35, 28], [41, 31], [37, 38], [32, 39], [32, 33]);
  q(r, [26, 34], [29, 35], [30, 41], [26, 40]);
  q(k, [25, 40], [39, 39], [38, 44], [26, 45]);
  q(s, [27, 41], [37, 40], [36, 43], [27, 43]);
  q(k, [27, 44], [38, 43], [39, 48], [26, 50], [24, 47]);
  q('#59483f', [26, 46], [37, 44], [37, 46], [26, 48]);
  pc.rect(31, 45, 4, 3, k); pc.rect(32, 46, 2, 1, m);
  q(k, [16, 31], [24, 32], [22, 42], [19, 47], [11, 44], [12, 39]);
  q(d, [16, 34], [21, 34], [19, 41], [14, 42]);
  q(r, [13, 40], [20, 42], [19, 49], [13, 50], [10, 46]);
  q(s, [13, 42], [18, 43], [17, 47], [12, 46]);
  pc.rect(12, 44, 3, 1, m); pc.rect(14, 48, 4, 2, d);
  q(k, [15, 22], [17, 17], [21, 22], [26, 21], [31, 28], [26, 36], [15, 35], [10, 30], [10, 24]);
  q(r, [16, 24], [24, 23], [28, 28], [24, 33], [15, 32], [12, 28]);
  q(R, [16, 24], [23, 24], [25, 26], [16, 27], [13, 28]);
  q(s, [11, 24], [13, 20], [17, 27], [14, 29]);
  q(m, [17, 19], [19, 23], [17, 24]);
  pc.rect(15, 32, 8, 1, d); pc.p(14, 27, l); pc.p(24, 28, m);
  q(k, [39, 26], [45, 27], [48, 34], [45, 38], [38, 33]);
  q(d, [40, 28], [44, 29], [46, 34], [43, 35], [39, 32]);
  q(s, [40, 28], [43, 29], [44, 31], [40, 31]);
  // 红发碎冠包住半覆面铁盔，头颈向前越过腰线。
  pc.rect(32, 22, 9, 5, k); pc.rect(34, 23, 5, 3, r);
  q(k, [30, 15], [29, 9], [34, 11], [36, 6], [39, 10], [44, 8], [44, 14], [47, 17], [43, 24], [34, 25]);
  q(r, [31, 12], [35, 13], [36, 9], [39, 13], [42, 11], [42, 17], [34, 20]);
  q(R, [33, 13], [36, 12], [39, 15], [35, 17]);
  pc.p(36, 12, e); pc.rect(32, 15, 2, 3, R);
  q(k, [35, 16], [42, 14], [45, 18], [43, 25], [39, 28], [33, 24], [32, 20]);
  q(s, [36, 17], [41, 16], [43, 19], [41, 24], [38, 25], [35, 23]);
  q(m, [36, 17], [40, 17], [39, 19], [35, 20]);
  q(d, [41, 18], [43, 19], [41, 24], [39, 25], [38, 21]);
  pc.blit(35, 20, ['kk.kkk', '.RkRe.', '..kd..', '..kd..'], { k, R, e, d });
  pc.rect(38, 24, 2, 1, m);
  // 侵蚀裂纹沿甲片折线爬行，少量亮红像素压在暗红底纹上。
  pc.blit(29, 30, ['rR....', '.Rr...', '..Rr..', '.rR...', '..rRr.', '...R..', '...rR.'], { r, R });
  pc.p(30, 31, e); pc.p(32, 34, e); pc.rect(17, 28, 1, 3, R);
  // 右侧斜置巨刃：厚刀背、冷灰刃面与磨亮刃口，不做发光光剑。
  q(k, [42, 44], [54, 18], [62, 12], [62, 25], [52, 47], [46, 51]);
  q(d, [44, 44], [55, 20], [60, 16], [60, 25], [50, 45], [46, 48]);
  q(s, [47, 42], [56, 21], [60, 18], [58, 27], [50, 44], [46, 47]);
  q(m, [50, 40], [59, 20], [60, 18], [59, 25], [51, 43], [47, 46]);
  q(l, [55, 28], [59, 19], [60, 17], [58, 24]);
  q(r, [45, 43], [53, 26], [54, 26], [47, 44]);
  q(k, [40, 44], [42, 41], [51, 49], [49, 52]);
  q(s, [41, 44], [43, 44], [49, 49], [48, 50]);
  q(k, [44, 47], [48, 50], [41, 60], [37, 57]);
  q('#655047', [44, 49], [46, 50], [40, 57], [39, 56]);
  q(k, [41, 35], [46, 35], [45, 42], [48, 46], [45, 52], [40, 49], [38, 44]);
  q(d, [42, 37], [44, 37], [42, 43], [45, 46], [43, 49], [40, 46], [40, 43]);
  q(s, [41, 43], [44, 44], [46, 46], [44, 49], [41, 47]);
  pc.rect(42, 44, 2, 1, m); pc.p(41, 47, r);
}

function drawShadePortrait(pc: PixelCanvas): void {
  const k = '#100e1c', d = '#211c36', s = '#383052', m = '#55456e';
  const l = '#79648f', h = '#aaa0ba', v = '#9278c3', t = '#7bbbbd';
  const q = (c: Hex, ...p: PortraitPoint[]) => portraitPolygon(pc, c, p);
  // 风向统一向右；一长一短的飘带从肩颈接出，不画悬浮碎片。
  q(k, [35, 25], [44, 23], [49, 27], [58, 25], [54, 31], [46, 32], [38, 29]);
  q(m, [38, 26], [44, 25], [49, 29], [55, 28], [53, 30], [46, 30]);
  q(k, [37, 28], [42, 28], [47, 35], [54, 36], [50, 40], [45, 38]);
  q(s, [40, 29], [42, 30], [47, 36], [51, 37], [49, 38], [46, 37]);
  // 长披风外轮廓与内衬先画，细腿从开衩伸出，脚底与重甲职业对齐。
  q(k, [26, 24], [37, 24], [42, 33], [42, 48], [49, 67], [42, 64], [41, 70], [33, 65], [26, 69], [25, 65], [14, 69], [20, 50], [20, 35]);
  pc.p(47, 66, k); // 补齐披风尖端的四邻域连接，避免孤立对角像素。
  q(d, [27, 27], [35, 26], [39, 35], [40, 50], [46, 64], [40, 62], [39, 67], [32, 62], [25, 66], [17, 66], [23, 46]);
  q(s, [25, 30], [29, 29], [27, 49], [21, 64], [18, 65], [24, 45]);
  q(m, [25, 32], [27, 31], [25, 46], [21, 58], [23, 46]);
  q(s, [35, 31], [38, 34], [38, 52], [43, 63], [39, 60], [34, 47]);
  q('#49335c', [29, 44], [35, 43], [38, 62], [32, 60], [26, 65]);
  q(k, [27, 46], [33, 47], [31, 60], [29, 70], [30, 75], [20, 75], [21, 71], [25, 67]);
  q(s, [28, 50], [31, 50], [29, 60], [27, 66], [25, 68]);
  q(m, [27, 58], [29, 58], [28, 62], [26, 63]);
  q(k, [33, 46], [38, 47], [37, 60], [39, 70], [44, 73], [43, 75], [34, 75], [33, 68], [32, 60]);
  q(d, [34, 51], [36, 50], [35, 60], [37, 69], [35, 70], [33, 60]);
  pc.rect(25, 67, 3, 5, s); pc.rect(34, 67, 3, 5, s);
  pc.rect(23, 72, 5, 2, d); pc.rect(35, 72, 6, 2, d);
  pc.rect(23, 72, 3, 1, m); pc.rect(35, 72, 3, 1, s);
  pc.rect(20, 74, 10, 1, k); pc.rect(34, 74, 10, 1, k);
  // 贴身皮甲收腰，斜肩覆布与错落裙摆打破左右对称。
  q(k, [27, 25], [35, 24], [40, 31], [36, 42], [38, 49], [25, 50], [27, 41], [23, 32]);
  q(s, [28, 27], [34, 27], [37, 31], [33, 40], [28, 40], [25, 32]);
  q(m, [28, 27], [31, 27], [29, 33], [26, 32]);
  q(d, [32, 30], [37, 31], [34, 40], [31, 40]);
  q(k, [26, 30], [28, 29], [36, 38], [35, 41]);
  q('#665572', [27, 30], [28, 30], [35, 38], [34, 39]);
  pc.rect(27, 41, 9, 3, k); pc.rect(28, 42, 7, 1, m);
  pc.rect(31, 41, 3, 3, s); pc.p(32, 42, v);
  q(d, [28, 45], [33, 45], [32, 55], [25, 60]);
  q(s, [28, 45], [30, 45], [28, 54], [26, 56]);
  q(m, [34, 45], [36, 44], [39, 55], [35, 52]);
  // 两臂在不同高度握住反向匕首；护腕和拳头覆盖柄根。
  q(k, [24, 28], [28, 32], [23, 42], [18, 46], [14, 43], [19, 36], [20, 31]);
  q(s, [23, 31], [25, 32], [21, 40], [18, 43], [16, 42], [21, 35]);
  q(m, [22, 32], [23, 32], [21, 37], [19, 38]);
  q(k, [37, 29], [41, 31], [45, 41], [44, 48], [39, 48], [39, 40], [35, 34]);
  q(d, [38, 32], [40, 33], [43, 41], [42, 46], [40, 45], [41, 41]);
  q(s, [38, 32], [39, 33], [42, 40], [41, 41]);
  // 尖兜帽顶点高而窄，深色脸部只保留青紫双眼。
  q(k, [32, 4], [37, 10], [40, 19], [38, 26], [32, 29], [24, 25], [23, 18], [27, 9]);
  q(s, [32, 7], [35, 12], [38, 19], [36, 25], [31, 27], [26, 23], [25, 18], [28, 11]);
  q(m, [32, 7], [33, 11], [29, 16], [27, 23], [25, 20], [27, 14]);
  q(l, [31, 9], [32, 9], [29, 14], [28, 15]);
  q(d, [34, 12], [38, 20], [36, 25], [32, 27], [34, 20]);
  q(k, [31, 14], [34, 15], [36, 20], [34, 24], [29, 24], [27, 21], [28, 17]);
  pc.blit(28, 19, ['sv.ksv', '.t..v.', '..dd..', '..dk..'], { s, v, k, t, d });
  pc.rect(29, 20, 1, 1, t); pc.p(33, 20, h);
  q(m, [26, 24], [31, 27], [37, 24], [35, 29], [30, 31], [25, 27]);
  pc.rect(27, 26, 2, 1, l);
  // 左匕首朝外下，右匕首反握朝下；刀脊保留三档冷光。
  q(k, [15, 41], [18, 44], [12, 50], [6, 55], [8, 47]);
  q(s, [14, 44], [16, 44], [11, 50], [8, 52], [10, 47]);
  q(h, [13, 45], [14, 45], [9, 50], [10, 47]);
  pc.rect(13, 41, 6, 2, k); pc.rect(14, 41, 4, 1, m);
  pc.rect(15, 39, 4, 4, k); pc.rect(16, 40, 2, 2, s); pc.p(16, 40, l);
  q(k, [40, 46], [44, 46], [47, 58], [46, 62], [41, 55]);
  q(s, [42, 49], [43, 49], [45, 57], [45, 59], [43, 55]);
  q(h, [42, 49], [43, 50], [44, 55], [43, 54]);
  pc.rect(39, 47, 7, 2, k); pc.rect(40, 47, 4, 1, m);
  pc.rect(40, 44, 4, 3, k); pc.rect(41, 44, 2, 2, s); pc.p(41, 44, l);
}

// 棘语者：远程射手。暗绿皮甲 + 藤蔓兜帽，右手竖握缠藤长杖，杖顶嵌金种。
// 与另外三职业同为 64×80、主体中心 x32、鞋底 y74；大面积用暗部压住，
// 只让藤蔓/眼睛/杖顶取亮色，避免整块绿色糊成一团。
function drawThornPortrait(pc: PixelCanvas): void {
  const k = '#0a110d', d = '#1b2a20', s = '#2f4a35', m = '#4d6e4a';
  const l = '#87a86e', h = '#c3d6a3';
  const g = '#f0c14a', G = '#a87a1c', gh = '#ffe9a6';
  const v = '#7ed957', V = '#3d7a2a';
  const q = (c: Hex, ...p: PortraitPoint[]) => portraitPolygon(pc, c, p);

  // 披风：外轮廓最暗，内衬退一档，下摆向右开衩露出双腿。
  q(k, [19, 24], [32, 21], [44, 27], [43, 54], [48, 71], [34, 66], [26, 71], [18, 63], [16, 49], [17, 29]);
  q(d, [22, 27], [31, 24], [40, 29], [39, 52], [44, 68], [33, 63], [26, 67], [21, 60], [20, 47]);
  q(s, [21, 30], [26, 28], [24, 51], [19, 61], [18, 50]);
  q('#16241b', [32, 31], [37, 30], [40, 54], [34, 62]);

  // 双腿与靴子：落脚点 y74，与重甲/刺客职业对齐。
  q(k, [24, 53], [31, 54], [30, 71], [23, 74], [19, 71]);
  q(s, [25, 56], [29, 57], [28, 68], [23, 69]);
  q(m, [25, 56], [27, 57], [26, 64], [24, 65]);
  q(k, [32, 54], [39, 55], [41, 72], [34, 74], [31, 70]);
  q(s, [33, 57], [37, 57], [38, 69], [34, 70]);
  q(m, [33, 57], [35, 58], [35, 64], [33, 65]);
  q(k, [21, 68], [30, 69], [30, 75], [18, 75]);
  q(m, [23, 69], [27, 69], [26, 73], [22, 73]);
  q(k, [33, 69], [41, 70], [41, 75], [32, 75]);
  q(m, [34, 70], [38, 70], [37, 73], [33, 73]);

  // 皮甲躯干：暗底 + 左侧窄受光面，右侧整体沉下去。
  q(k, [23, 26], [33, 24], [42, 30], [40, 45], [34, 49], [25, 48], [20, 38]);
  q(d, [25, 28], [33, 26], [39, 31], [37, 44], [32, 47], [26, 46], [22, 37]);
  q(m, [25, 29], [30, 28], [29, 34], [24, 36]);
  q(k, [24, 40], [40, 40], [40, 44], [24, 44]);
  q(h, [30, 40], [34, 40], [34, 44], [30, 44]);
  q(l, [30, 41], [32, 41], [32, 43], [30, 43]);
  // 胸前缠绕的藤带是唯一大面积亮绿。
  q(V, [21, 44], [30, 46], [29, 48], [20, 46]);
  q(v, [22, 45], [27, 46], [27, 47], [22, 46]);

  // 肩甲：左肩覆藤，右肩裸皮，两肩都不亮过胸口。
  q(k, [17, 26], [25, 24], [26, 33], [19, 38], [14, 32]);
  q(s, [19, 27], [24, 26], [24, 31], [19, 34]);
  q(V, [18, 30], [25, 31], [24, 33], [17, 32]);
  q(k, [37, 25], [45, 27], [48, 34], [41, 38], [37, 31]);
  q(s, [38, 27], [44, 28], [46, 33], [40, 34]);
  q(m, [38, 27], [41, 28], [41, 31], [38, 31]);

  // 左臂握杖，右臂垂在体侧；护腕压住杖身。
  q(k, [20, 32], [26, 34], [23, 48], [17, 51], [14, 45]);
  q(s, [19, 35], [24, 36], [21, 46], [17, 47]);
  q(m, [16, 46], [22, 47], [22, 51], [15, 51]);
  q(k, [39, 31], [45, 33], [49, 42], [46, 48], [40, 44]);
  q(s, [40, 34], [44, 35], [47, 42], [44, 45], [40, 42]);
  q(m, [44, 43], [49, 44], [49, 48], [43, 48]);

  // 藤蔓兜帽：尖顶窄、帽檐压低，眼窝全暗只留两点绿光。
  q(k, [26, 8], [34, 5], [41, 10], [43, 18], [40, 27], [32, 30], [25, 25], [23, 15]);
  q(d, [27, 10], [33, 7], [39, 11], [41, 17], [38, 25], [32, 27], [26, 23], [25, 16]);
  q(s, [27, 11], [31, 9], [30, 16], [25, 17]);
  q(k, [28, 15], [37, 15], [38, 23], [32, 26], [27, 21]);
  pc.p(30, 19, v); pc.p(31, 19, v); pc.p(34, 19, v); pc.p(35, 19, v);
  pc.p(30, 20, V); pc.p(34, 20, V);
  q(m, [30, 24], [36, 24], [34, 28], [31, 28]);
  q(V, [33, 5], [35, 8], [33, 12], [31, 8]);
  q(v, [33, 6], [34, 8], [33, 10], [32, 8]);

  // 缠藤长杖：杖身取中亮色便于在暗背景上读出，杖顶金种与杖身贯通。
  q(k, [46, 7], [54, 7], [54, 72], [46, 72]);
  q(d, [47, 9], [53, 9], [53, 71], [47, 71]);
  q(m, [48, 9], [50, 9], [50, 71], [48, 71]);
  for (let y = 18; y < 70; y += 9) {
    q(V, [46, y], [54, y + 3], [54, y + 5], [46, y + 2]);
    q(v, [47, y + 1], [51, y + 3], [51, y + 4], [47, y + 2]);
  }
  q(k, [44, 3], [56, 3], [57, 9], [52, 15], [45, 11]);
  q(g, [46, 4], [54, 4], [55, 9], [51, 13], [46, 10]);
  q(G, [48, 6], [53, 6], [53, 9], [49, 11]);
  q(gh, [48, 5], [50, 5], [49, 7]);
  pc.p(51, 8, gh);

  // 背后箭袋：三支羽箭自右肩后方斜出。
  q(k, [11, 32], [19, 28], [22, 37], [16, 47], [10, 41]);
  q(d, [13, 34], [18, 31], [20, 37], [16, 44]);
  q(m, [13, 34], [16, 32], [17, 36], [14, 37]);
  for (const [ax, ay] of [[13, 25], [16, 21], [19, 18]] as const) {
    pc.rect(ax, ay, 1, 6, m); pc.p(ax, ay - 1, l); pc.p(ax - 1, ay, s);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateAllPixelTextures(scene: Phaser.Scene): void {
  // --- Players: 32x32 x 4 frames (idle, walk1, walk2, walk3) ---
  const makeHero = (key: string, drawer: (pc: PixelCanvas, walk: number) => void) => {
    const s = sheet(32, 32, [
      (pc) => drawer(pc, 0),
      (pc) => drawer(pc, 1),
      (pc) => drawer(pc, 0),
      (pc) => drawer(pc, 2),
    ]);
    s.toTexture(scene, key);
  };
  makeHero('hero_warden', drawWarden);
  makeHero('hero_reaver', drawReaver);
  makeHero('hero_shade', drawShade);
  makeHero('hero_thorn', drawThorn);

  // 展示专用静态纹理：保持透明底，沿用最近邻过滤供界面放大两倍或三倍。
  const portraits: Array<[string, (pc: PixelCanvas) => void]> = [
    ['portrait_warden', drawWardenPortrait],
    ['portrait_reaver', drawReaverPortrait],
    ['portrait_shade', drawShadePortrait],
    ['portrait_thorn', drawThornPortrait],
  ];
  for (const [key, draw] of portraits) {
    const portrait = new PixelCanvas(64, 80);
    draw(portrait);
    portrait.toTexture(scene, key);
  }

  // --- Enemies ---
  sheet(32, 32, [(pc) => drawCrawler(pc, 0), (pc) => drawCrawler(pc, 1)]).toTexture(
    scene,
    'enemy_crawler',
  );
  sheet(32, 32, [(pc) => drawSpitter(pc, 0), (pc) => drawSpitter(pc, 1)]).toTexture(
    scene,
    'enemy_spitter',
  );
  sheet(32, 32, [(pc) => drawBrute(pc, 0), (pc) => drawBrute(pc, 1)]).toTexture(
    scene,
    'enemy_brute',
  );

  // --- Tiles ---
  for (let i = 0; i < 4; i++) {
    const t = new PixelCanvas(16, 16);
    drawFloorTile(t, i);
    t.toTexture(scene, `tile_floor_${i}`);
  }
  {
    const t = new PixelCanvas(16, 16);
    drawWallTile(t);
    t.toTexture(scene, 'tile_wall');
  }

  // --- FX ---
  // Per-class slash arcs (3 frames each).
  sheet(32, 32, [0, 1, 2].map((f) => (pc: PixelCanvas) => drawSlash(pc, f, P.white, P.teal, P.tealDark))).toTexture(scene, 'fx_slash_warden');
  sheet(32, 32, [0, 1, 2].map((f) => (pc: PixelCanvas) => drawSlash(pc, f, P.white, P.blood, P.bloodDark))).toTexture(scene, 'fx_slash_reaver');
  sheet(32, 32, [0, 1, 2].map((f) => (pc: PixelCanvas) => drawSlash(pc, f, P.white, P.violet, P.violetDark))).toTexture(scene, 'fx_slash_shade');
  sheet(32, 32, [0, 1, 2].map((f) => (pc: PixelCanvas) => drawSlash(pc, f, P.white, P.slime, P.slimeDark))).toTexture(scene, 'fx_slash_thorn');
  // Sustained-skill orbit rings (thorn has no sustained skill — nova is instant).
  sheet(24, 24, [0, 1].map((f) => (pc: PixelCanvas) => drawSkillRing(pc, f, P.white, P.teal))).toTexture(scene, 'fx_ring_warden');
  sheet(24, 24, [0, 1].map((f) => (pc: PixelCanvas) => drawSkillRing(pc, f, P.ember, P.blood))).toTexture(scene, 'fx_ring_reaver');
  sheet(24, 24, [0, 1].map((f) => (pc: PixelCanvas) => drawSkillRing(pc, f, P.violet, P.violetDark))).toTexture(scene, 'fx_ring_shade');
  sheet(48, 48, [0, 1, 2].map((f) => (pc: PixelCanvas) => drawNovaRing(pc, f))).toTexture(scene, 'fx_nova');
  {
    const t = new PixelCanvas(8, 8);
    drawProjectile(t, 'ember');
    t.toTexture(scene, 'proj_ember');
  }
  {
    const t = new PixelCanvas(8, 8);
    drawProjectile(t, 'seed');
    t.toTexture(scene, 'proj_seed');
  }
  {
    const t = new PixelCanvas(8, 5);
    drawShadow(t);
    t.toTexture(scene, 'shadow');
  }

  // --- UI / icons ---
  {
    const t = new PixelCanvas(32, 32);
    drawSeedIcon(t);
    t.toTexture(scene, 'icon_seed');
  }
  sheet(8, 8, [(pc) => drawEssenceOrb(pc, 0), (pc) => drawEssenceOrb(pc, 1)]).toTexture(
    scene,
    'icon_essence',
  );
  {
    const t = new PixelCanvas(32, 16);
    drawUiPanel(t);
    t.toTexture(scene, 'ui_panel');
  }
  {
    const t = new PixelCanvas(7, 6);
    drawHeart(t);
    t.toTexture(scene, 'ui_heart');
  }

  // Fallback 1px white for rare tints
  {
    const t = new PixelCanvas(1, 1);
    t.p(0, 0, P.white);
    t.toTexture(scene, 'pixel');
  }
}

export function registerPixelAnimations(scene: Phaser.Scene): void {
  const mk = (
    key: string,
    texture: string,
    frames: number[],
    frameRate: number,
    repeat = -1,
  ) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: frames.map((f) => ({ key: texture, frame: f })),
      frameRate,
      repeat,
    });
  };

  // Phaser canvas textures from sheet need frames added.
  // addSpriteSheet frames:
  const ensureSheetFrames = (key: string, frameW: number, frameH: number) => {
    const tex = scene.textures.get(key);
    if (!tex) return;
    // Already sliced (more than the default __BASE frame).
    if (tex.frameTotal > 1) return;
    const src = tex.getSourceImage() as HTMLCanvasElement;
    const count = Math.floor(src.width / frameW);
    for (let i = 0; i < count; i++) {
      tex.add(i, 0, i * frameW, 0, frameW, frameH);
    }
  };

  const heroes = ['hero_warden', 'hero_reaver', 'hero_shade', 'hero_thorn'] as const;
  for (const h of heroes) {
    ensureSheetFrames(h, 32, 32);
    mk(`${h}_idle`, h, [0], 1);
    mk(`${h}_walk`, h, [0, 1, 2, 3], 8);
  }

  ensureSheetFrames('enemy_crawler', 32, 32);
  ensureSheetFrames('enemy_spitter', 32, 32);
  ensureSheetFrames('enemy_brute', 32, 32);
  mk('enemy_crawler_walk', 'enemy_crawler', [0, 1], 6);
  mk('enemy_spitter_walk', 'enemy_spitter', [0, 1], 5);
  mk('enemy_brute_walk', 'enemy_brute', [0, 1], 4);

  const slashClasses = ['warden', 'reaver', 'shade', 'thorn'] as const;
  for (const c of slashClasses) {
    ensureSheetFrames(`fx_slash_${c}`, 32, 32);
    mk(`fx_slash_${c}_play`, `fx_slash_${c}`, [0, 1, 2], 24, 0);
  }
  const ringClasses = ['warden', 'reaver', 'shade'] as const;
  for (const c of ringClasses) {
    ensureSheetFrames(`fx_ring_${c}`, 24, 24);
    mk(`fx_ring_${c}_play`, `fx_ring_${c}`, [0, 1], 6);
  }
  ensureSheetFrames('fx_nova', 48, 48);
  mk('fx_nova_play', 'fx_nova', [0, 1, 2], 14, 0);

  ensureSheetFrames('icon_essence', 8, 8);
  mk('icon_essence_spin', 'icon_essence', [0, 1], 4);
}
