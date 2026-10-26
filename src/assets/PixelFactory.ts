import { drawRootHammer } from './RootHammer';
import { drawParasiticWarden, drawParasiticWardenPortrait } from './ParasiticWarden';
import { drawReaver, drawShade, drawThorn, drawReaverPortrait, drawShadePortrait, drawThornPortrait } from './AbyssHeroes';
import { PORTRAIT_WIDTH, PORTRAIT_HEIGHT } from './HeroPortraits';
import { drawAwakenedHero, drawAwakenedPortrait } from './HeroAwakening';
import { awakenedHeroKey, portraitKey } from '../data/awakenings';
import { CLASS_LIST, HERO_TEXTURES, type ClassId } from '../data/classes';

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

/** Pixel-only recoil: feet stay planted; physics frame dimensions/origin never change. */
function enemyHitFrames(draw:(pc:PixelCanvas)=>void,kind:'crawler'|'spitter'|'brute',windupDraw=draw):Array<(pc:PixelCanvas)=>void> {
  return [0,1,2,3].map(pose=>(pc:PixelCanvas)=>{
    // The fourth is only a slight brace of the ORIGINAL charging pose (open spout kept).
    const base=new PixelCanvas(32,32);(pose===3?windupDraw:draw)(base);
    const pixels=base.source.getContext('2d')!.getImageData(0,0,32,32).data;
    const strength=pose===1?1:pose===0?0.6:0.25;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const i=(y*32+x)*4;if(!pixels[i+3])continue;
      let dx=0,dy=0;
      if(kind==='crawler'&&y<18){dx=-Math.round(3*strength);dy=Math.round(2*strength);}
      else if(kind==='spitter'&&y<16){dx=-Math.round(3*strength);dy=Math.round((16-y)*0.3*strength);}
      else if(kind==='brute'&&y<21){
        dx=-Math.round(Math.max(0,21-y)/17*4*strength);
        dy=Math.round(Math.max(0,21-y)/17*2*strength);
        if(x>=24&&y>=8){dx=-Math.round(strength);dy=Math.round(3*strength);}
      }
      const color='#'+[pixels[i],pixels[i+1],pixels[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');
      pc.p(x+dx,y+dy,color);
    }
  });
}

function drawFloorTile(pc: PixelCanvas, variant: number): void {
  // Closely related values avoid the old bright checkerboard and glitter noise.
  const floors = ['#20212b', '#21222c', '#1f202a', '#22232c'];
  pc.rect(0, 0, 16, 16, floors[variant]);
  pc.rect(0, 0, 16, 1, '#292a33');
  pc.rect(15, 1, 1, 15, '#171922');
  pc.rect(0, 15, 15, 1, '#191b24');
  pc.rect(2, 2, 6, 1, '#252630');
  if (variant === 2) {
    for (const [x,y] of [[10,1],[10,2],[9,3],[9,4],[8,5],[8,6],[7,7],[8,8]]) pc.p(x,y,'#151820');
    pc.p(10,5,'#2c3035');
  } else if (variant === 3) {
    pc.rect(3,11,3,1,'#282b30'); pc.p(4,10,'#2d3435');
  }
}

function drawWallTile(pc: PixelCanvas): void {
  pc.rect(0,0,16,16,'#363943');
  pc.rect(0,0,16,2,'#5d6266');
  pc.rect(1,2,1,11,'#494e54');
  pc.rect(0,13,16,3,'#191d29');
  pc.rect(2,4,12,1,'#41454e');
  pc.rect(7,5,1,7,'#292d38');
  pc.rect(2,10,5,1,'#2b2f39');
  pc.rect(9,7,5,1,'#30343e');
  pc.p(4,3,'#737568');
  pc.rect(10,10,3,1,'#414d43');
  pc.p(12,9,'#59604b');
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
  pc.blit(8, 2, [
    '.......kk.......',
    '......kddk......',
    '.....kdTddk.....',
    '....kdTttddk....',
    '...kdTtwwtddk...',
    '...kdTtwwtTdk...',
    '...kdTtwwtTdk...',
    '...kdTttttTdk...',
    '....kdTttTdk....',
    '....kddTTddk....',
    '.....kddddk.....',
    '......kddk......',
    '.....d.dd.d.....',
    '....d..dd..d....',
    '...d...d.d..d...',
    '...d..d...d.....',
    '..d...d....d....',
    '.....d......d...',
    '....d...........',
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
  // All professions share 14 grounded 32×32 cells: walk / idle / attack / dash / hurt.
  const heroes: Record<ClassId, (pc: PixelCanvas, frame: number) => void> = {
    warden: drawParasiticWarden, reaver: drawReaver, shade: drawShade, thorn: drawThorn,
  };
  for (const cls of CLASS_LIST) {
    sheet(32, 32, Array.from({ length: 14 }, (_, frame) =>
      (pc: PixelCanvas) => heroes[cls.id](pc, frame),
    )).toTexture(scene, HERO_TEXTURES[cls.id]);
    sheet(32, 32, Array.from({ length: 14 }, (_, frame) => (pc: PixelCanvas) => {
      drawAwakenedHero(pc, cls.id, frame, false);
      heroes[cls.id](pc, frame);
      drawAwakenedHero(pc, cls.id, frame, true);
    })).toTexture(scene, awakenedHeroKey(cls.id));
  }

  // Independent payoff sheets: every original hero cell and animation stays exact.
  for(const awakened of [false,true]) {
    sheet(32,32,[0,1,2,3].map(phase=>(pc:PixelCanvas)=>{
      if(awakened)drawAwakenedHero(pc,'thorn',8+phase,false);
      drawThorn(pc,14+phase);
      if(awakened)drawAwakenedHero(pc,'thorn',8+phase,true);
    })).toTexture(scene,awakened?'cast_thorn_bloom_awakened':'cast_thorn_bloom');
  }

  // Paid Warden release has its own sheet; all original hero/portrait cells stay exact.
  for(const awakened of [false,true]) {
    sheet(32,32,[0,1,2,3].map(phase=>(pc:PixelCanvas)=>{
      if(awakened)drawAwakenedHero(pc,'warden',14+phase,false);
      drawParasiticWarden(pc,14+phase);
      if(awakened)drawAwakenedHero(pc,'warden',14+phase,true);
    })).toTexture(scene,awakened?'strike_warden_reprisal_awakened':'strike_warden_reprisal');
  }

  // Committed Reaver approach (2) + original-clock follow-through (4), never a wind-up.
  for(const awakened of [false,true]) {
    sheet(32,32,[14,15,16,17,18,19].map(frame=>(pc:PixelCanvas)=>{
      if(awakened)drawAwakenedHero(pc,'reaver',frame,false);
      drawReaver(pc,frame);
      if(awakened)drawAwakenedHero(pc,'reaver',frame,true);
    })).toTexture(scene,awakened?'pounce_reaver_awakened':'pounce_reaver');
  }

  // Shade owns only committed stealth-break and actually used reverse-dash cells.
  for(const awakened of [false,true])for(const [key,frames]of [['strike_shade_ambush',[14,15,16,17]],['step_shade_return',[18,19]]] as const) {
    sheet(32,32,frames.map(frame=>(pc:PixelCanvas)=>{
      if(awakened)drawAwakenedHero(pc,'shade',frame,false);
      drawShade(pc,frame);
      if(awakened)drawAwakenedHero(pc,'shade',frame,true);
    })).toTexture(scene,key+(awakened?'_awakened':''));
  }

  // Display-only portraits use their own resolution; nearest filtering and UI footprints are preserved.
  const portraits: Array<[string, (pc: PixelCanvas) => void]> = [
    ['portrait_warden', drawParasiticWardenPortrait],
    ['portrait_reaver', drawReaverPortrait],
    ['portrait_shade', drawShadePortrait],
    ['portrait_thorn', drawThornPortrait],
  ];
  for (const [key, draw] of portraits) {
    const portrait = new PixelCanvas(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    draw(portrait);
    portrait.toTexture(scene, key);
    const id = key.replace('portrait_', '') as ClassId;
    const awakened = new PixelCanvas(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    drawAwakenedPortrait(awakened, id, false);
    draw(awakened);
    drawAwakenedPortrait(awakened, id, true);
    awakened.toTexture(scene, portraitKey(id, true));
  }

  // --- Enemies ---
  sheet(32, 32, [(pc) => drawCrawler(pc, 0), (pc) => drawCrawler(pc, 1), ...enemyHitFrames(pc=>drawCrawler(pc,0),'crawler',pc=>drawCrawler(pc,1))]).toTexture(
    scene,
    'enemy_crawler',
  );
  sheet(32, 32, [(pc) => drawSpitter(pc, 0), (pc) => drawSpitter(pc, 1), ...enemyHitFrames(pc=>drawSpitter(pc,0),'spitter',pc=>drawSpitter(pc,1))]).toTexture(
    scene,
    'enemy_spitter',
  );
  sheet(32, 32, [(pc) => drawBrute(pc, 0), (pc) => drawBrute(pc, 1), ...enemyHitFrames(pc=>drawBrute(pc,0),'brute',pc=>drawBrute(pc,1))]).toTexture(
    scene,
    'enemy_brute',
  );

  const drawOpenBrute=(pc:PixelCanvas)=>{
    drawBrute(pc,0);
    pc.rect(12,8,10,7,P.ink);
    pc.rect(13,8,2,6,P.stoneHi);pc.rect(20,8,2,6,P.stone);
    pc.rect(16,9,3,5,P.goldDark);pc.rect(17,10,1,3,P.gold);
    pc.rect(15,10,1,1,P.boneDim);pc.rect(19,11,1,1,P.boneDim);
    pc.rect(13,14,3,1,P.stoneHi);pc.rect(19,14,3,1,P.stone);
  };
  sheet(32,32,[drawOpenBrute,...enemyHitFrames(drawOpenBrute,'brute')]).toTexture(scene,'enemy_brute_open');

  const hammerClosed=new PixelCanvas(32,32),hammerOpen=new PixelCanvas(32,32);
  drawBrute(hammerClosed,0);drawOpenBrute(hammerOpen);
  sheet(32,32,[0,1,2,3,4,5].map(frame=>(pc:PixelCanvas)=>drawRootHammer(pc,frame,frame<2?hammerClosed:hammerOpen)))
    .toTexture(scene,'enemy_root_hammer');

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

  for (const cls of CLASS_LIST) {
    for (const h of [HERO_TEXTURES[cls.id], awakenedHeroKey(cls.id)]) {
    ensureSheetFrames(h, 32, 32);
    mk(`${h}_idle`, h, [4, 5, 6, 7], 4);
    mk(`${h}_walk`, h, [0, 1, 2, 3], 8);
    mk(`${h}_attack`, h, [8, 9, 10, 11], 4000 / Math.min(250, cls.attackCooldown), 0);
    mk(`${h}_dash`, h, [12], 1, 0);
    mk(`${h}_hurt`, h, [13], 1, 0);
    }
  }

  for(const key of ['strike_shade_ambush','strike_shade_ambush_awakened','step_shade_return','step_shade_return_awakened'])ensureSheetFrames(key,32,32);
  ensureSheetFrames('pounce_reaver',32,32);
  ensureSheetFrames('pounce_reaver_awakened',32,32);
  ensureSheetFrames('strike_warden_reprisal',32,32);
  ensureSheetFrames('strike_warden_reprisal_awakened',32,32);
  ensureSheetFrames('cast_thorn_bloom',32,32);
  ensureSheetFrames('cast_thorn_bloom_awakened',32,32);
  ensureSheetFrames('enemy_crawler', 32, 32);
  ensureSheetFrames('enemy_spitter', 32, 32);
  ensureSheetFrames('enemy_brute', 32, 32);
  ensureSheetFrames('enemy_brute_open', 32, 32);
  ensureSheetFrames('enemy_root_hammer',32,32);
  mk('enemy_crawler_walk', 'enemy_crawler', [0, 1], 6);
  // The swollen/open spout frame is now reserved for an actual committed shot.
  mk('enemy_spitter_walk', 'enemy_spitter', [0], 5);
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
