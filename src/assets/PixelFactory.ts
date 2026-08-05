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
