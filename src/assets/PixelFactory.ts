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
  // 32x32 knight with teal seed core
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  pc.blit(4, 2 + (walk ? 0 : 0), [
    '............',
    '....kkkk....',
    '...kbbbbk...',
    '..kbwwbbbk..',
    '..kbbbbbbk..',
    '...kbbbbk...',
    '....kTTk....',
    '...kttttk...',
    '..kTttttTk..',
    '..kttttttk..',
    '.kkTttttTkk.',
    'kbbkttttkbbk',
    'kbbkkkkkkbbk',
    '.kk.kttk.kk.',
    '....kttk....',
    '....kTTk....',
    '...kk..kk...',
    '..kbk..kbk..',
  ], PAL_COMMON);

  // legs offset for walk
  pc.rect(10, 26, 4, 4, P.ink);
  pc.rect(18, 26, 4, 4, P.ink);
  pc.rect(11 + foot, 27, 2, 3, P.stoneHi);
  pc.rect(19 - foot, 27, 2, 3, P.stoneHi);

  // shield
  pc.blit(1, 12, [
    '.kkkk.',
    'ktttTk',
    'ktwwtk',
    'ktttTk',
    'kTTTTk',
    '.kkkk.',
  ], PAL_COMMON);

  // sword
  pc.blit(24, 8, [
    '..g.',
    '.gGg',
    '..g.',
    '..d.',
    '..d.',
    '..d.',
    '.ddd',
    '..k.',
  ], PAL_COMMON);
}

function drawReaver(pc: PixelCanvas, walk = 0): void {
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  pc.blit(6, 3, [
    '..........',
    '...kkkk...',
    '..kRrrRk..',
    '.krrrrrrk.',
    '.krwwrrrk.',
    '.krrrrrrk.',
    '..krrrrk..',
    '...kRRk...',
    '..krrrrk..',
    '.krrrrrrk.',
    'kRrrrrrrRk',
    'krrkkkkrrk',
    '.kk.rr.kk.',
    '....rr....',
    '...kRRk...',
    '..kk..kk..',
  ], PAL_COMMON);
  pc.rect(11 + foot, 27, 3, 3, P.bloodDark);
  pc.rect(18 - foot, 27, 3, 3, P.bloodDark);

  // dual blades
  pc.blit(0, 10, [
    'r.',
    'Rr',
    'r.',
    'd.',
    'd.',
    'k.',
  ], PAL_COMMON);
  pc.blit(28, 10, [
    '.r',
    'rR',
    '.r',
    '.d',
    '.d',
    '.k',
  ], PAL_COMMON);

  // seed scar
  pc.p(15, 14, P.violet);
  pc.p(16, 15, P.violetDark);
}

function drawShade(pc: PixelCanvas, walk = 0): void {
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  pc.blit(7, 2, [
    '........',
    '..kkkk..',
    '.kppppk.',
    'kpPwwPpk',
    'kppppppk',
    '.kppppk.',
    '..kPPk..',
    '.kppppk.',
    'kppppppk',
    'kpPppPpk',
    'kppkkppk',
    '.kk..kk.',
    '..p..p..',
    '.kP..Pk.',
    'kk....kk',
  ], PAL_COMMON);
  pc.rect(11 + foot, 26, 3, 4, P.violetDark);
  pc.rect(18 - foot, 26, 3, 4, P.violetDark);

  // dagger trail
  pc.blit(22, 12, [
    '.p.',
    'pPp',
    '.p.',
    '.d.',
    '.k.',
  ], PAL_COMMON);
  // cloak flick
  if (walk) {
    pc.p(6, 14, P.violetDark);
    pc.p(5, 15, P.violet);
    pc.p(25, 15, P.violetDark);
  }
}

function drawThorn(pc: PixelCanvas, walk = 0): void {
  const foot = walk === 1 ? 1 : walk === 2 ? -1 : 0;
  // Sprig-keeper: leaf-crowned hood, seed pendant, thorn staff.
  pc.blit(6, 2, [
    '....ll....',
    '...kllk...',
    '..kllllk..',
    '..kLllLk..',
    '..kbbbbk..',
    '..kbwwbk..',
    '..kbbbbk..',
    '...kLLk...',
    '..kllllk..',
    '.kllllllk.',
    '.kllggllk.',
    'kLllgLglLk',
    'kLllllllLk',
    '.klLkkLlk.',
    '..kllLlk..',
    '...kLLk...',
    '..kk..kk..',
  ], PAL_COMMON);
  pc.rect(10, 26, 4, 4, P.ink);
  pc.rect(18, 26, 4, 4, P.ink);
  pc.rect(11 + foot, 27, 2, 3, P.slimeDark);
  pc.rect(19 - foot, 27, 2, 3, P.slimeDark);

  // thorn staff with a seed tip
  pc.blit(24, 6, [
    '..g.',
    '.gwg',
    '..gG',
    '..L.',
    '..L.',
    '..L.',
    '.lL.',
    '..L.',
    '..k.',
  ], PAL_COMMON);
  // robe flick while walking
  if (walk) {
    pc.p(5, 15, P.slimeDark);
    pc.p(16, 15, P.slimeDark);
  }
}

function drawCrawler(pc: PixelCanvas, frame = 0): void {
  const bob = frame === 1 ? 1 : 0;
  pc.blit(4, 8 + bob, [
    '........................',
    '......kkkkkk............',
    '....kkRRRRkk............',
    '...kRrrrrrrRk...........',
    '..kRrwwrrwwrRk..........',
    '..kRrrrrrrrrRk..........',
    '.kRrrrrrrrrrrRk.........',
    '.kRRrrkkkkrrRRk.........',
    '..kkRRk..kRRkk..........',
    '..k..k....k..k..........',
    '.kL..k....k..Lk.........',
    'kL....k..k....Lk........',
  ], PAL_COMMON);
  // legs cycle
  if (frame === 1) {
    pc.p(8, 24, P.ink);
    pc.p(22, 24, P.ink);
  } else {
    pc.p(10, 25, P.ink);
    pc.p(20, 25, P.ink);
  }
}

function drawSpitter(pc: PixelCanvas, frame = 0): void {
  pc.blit(6, 6, [
    '....................',
    '.....kkkkkk.........',
    '...kkGeeeeGkk.......',
    '..kGeeeeeewGek......',
    '.kGeeeeeewwwek......',
    '.kGeeeeeeeeeeGk.....',
    '..kGGeeeeeeGGk......',
    '...kkGGkkGGkk.......',
    '....k..kk..k........',
    '...kL......Lk.......',
    '..kL........Lk......',
  ], PAL_COMMON);
  if (frame === 1) {
    // spit charge
    pc.p(22, 12, P.ember);
    pc.p(23, 12, P.gold);
    pc.p(24, 13, P.ember);
  }
}

function drawBrute(pc: PixelCanvas, frame = 0): void {
  const swing = frame === 1 ? 1 : 0;
  pc.blit(2, 2, [
    '............................',
    '........kkkkkkkk............',
    '......kkPPPPPPkk............',
    '.....kPPppppppPPk...........',
    '....kPppwwppwwppPk..........',
    '....kPppppppppppPk..........',
    '....kPPppppppppPPk..........',
    '.....kPPkkkkkkPPk...........',
    '....kkPPppppppPPkk..........',
    '...kPPppppppppppPPk.........',
    '..kPPppkkkkkkkkppPPk........',
    '..kPPk..........kPPk........',
    '..kPk............kPk........',
    '.kPk..............kPk.......',
    'kPk................kPk......',
    'kk..................kk......',
  ], PAL_COMMON);
  // club
  pc.blit(22 + swing, 8, [
    '..kkkk',
    '.ksssk',
    'khsshk',
    '.kssk.',
    '..dd..',
    '..dd..',
    '..kk..',
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

function drawSlash(pc: PixelCanvas, frame: number): void {
  // arc slash 32x32
  const arcs = [
    [
      '................................',
      '................................',
      '.....................ww.........',
      '...................wtTw.........',
      '.................wtTTtw.........',
      '...............wtTTttw..........',
      '.............wtTTttw............',
      '...........wtTTttw..............',
      '.........wtTTttw................',
      '.......wtTTttw..................',
      '.....wtTTttw....................',
      '...wtTTttw......................',
      '.wtTTttw........................',
      'wtTttw..........................',
      'wTtw............................',
      'ww..............................',
    ],
    [
      '................................',
      '................................',
      '................................',
      '..........wwwwww................',
      '........wtTTTTTtw...............',
      '......wtTTtttttTTw..............',
      '....wtTTtt.....tTTw.............',
      '..wtTTtt.........tTTw...........',
      '.wTTtt.............tTTw.........',
      'wTtw.................tTw........',
      'ww.....................w........',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
    ],
  ];
  pc.blit(0, 0, arcs[frame % arcs.length], PAL_COMMON);
}

function drawProjectile(pc: PixelCanvas, kind: 'ember' | 'seed'): void {
  if (kind === 'ember') {
    pc.blit(0, 0, [
      '..e.',
      '.ewe',
      'eGee',
      '.ee.',
    ], PAL_COMMON);
  } else {
    pc.blit(0, 0, [
      '.p.',
      'pwp',
      'PpP',
      '.p.',
    ], PAL_COMMON);
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
  sheet(32, 32, [(pc) => drawSlash(pc, 0), (pc) => drawSlash(pc, 1)]).toTexture(
    scene,
    'fx_slash',
  );
  {
    const t = new PixelCanvas(4, 4);
    drawProjectile(t, 'ember');
    t.toTexture(scene, 'proj_ember');
  }
  {
    const t = new PixelCanvas(4, 4);
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

  ensureSheetFrames('fx_slash', 32, 32);
  mk('fx_slash_play', 'fx_slash', [0, 1], 18, 0);

  ensureSheetFrames('icon_essence', 8, 8);
  mk('icon_essence_spin', 'icon_essence', [0, 1], 4);
}
