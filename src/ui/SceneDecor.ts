import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { UI, UI_FONT, bodyStyle, titleStyle } from './theme';

/** Sparse, stepped root silhouettes kept out of the content column. */
function drawRootMargins(g: Phaser.GameObjects.Graphics): void {
  for (const side of [-1, 1]) {
    const x = side < 0 ? 10 : GAME_WIDTH-10;
    const d = -side;
    g.lineStyle(3, UI.root, 0.28);
    g.beginPath().moveTo(x, 590).lineTo(x+d*14, 490).lineTo(x+d*8, 420)
      .lineTo(x+d*24, 340).lineTo(x+d*18, 278).strokePath();
    g.lineStyle(1, UI.rootLight, 0.35);
    g.lineBetween(x+d*10, 450, x+d*32, 420);
    g.lineBetween(x+d*18, 365, x+d*40, 349);
    g.lineBetween(x+d*17, 490, x+d*36, 513);
    g.fillStyle(UI.teal,0.45).fillRect(x+d*22,340,2,2);
  }
}

/**
 * Flat abyss backdrop: solid fill + sparse floor tiles.
 * No radial soft glows, no edge vignette bars (those looked like weird shadows on menus).
 */
export function drawAbyssBackdrop(
  scene: Phaser.Scene,
  opts?: { tileAlpha?: number; vignette?: boolean },
): void {
  const tileAlpha = opts?.tileAlpha ?? 0.22;

  const g = scene.add.graphics().setDepth(-20);
  g.fillStyle(UI.bg, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawRootMargins(g);

  // Subtle checker dimming (hard-edged, pixel-friendly) — not a soft orb glow
  const grid = scene.add.graphics().setDepth(-15);
  for (let y = 0; y < Math.ceil(GAME_HEIGHT / 64); y++) {
    for (let x = 0; x < Math.ceil(GAME_WIDTH / 64); x++) {
      if ((x + y) % 2 === 0) {
        grid.fillStyle(0x100d1c, 0.35);
        grid.fillRect(x * 64, y * 64, 64, 64);
      }
    }
  }

  for (let y = 0; y < Math.ceil(GAME_HEIGHT / 32); y++) {
    for (let x = 0; x < Math.ceil(GAME_WIDTH / 32); x++) {
      if ((x + y) % 5 === 0 && scene.textures.exists(`tile_floor_${(x + y) % 4}`)) {
        scene.add
          .image(x * 32 + 16, y * 32 + 16, `tile_floor_${(x + y) % 4}`)
          .setScale(2)
          .setAlpha(tileAlpha)
          .setDepth(-10);
      }
    }
  }

  // Thin hairline separators only — no solid dark header/footer plates
  if (opts?.vignette !== false) {
    const lines = scene.add.graphics().setDepth(5);
    lines.lineStyle(1, UI.stroke, 0.28);
    lines.lineBetween(48, 64, GAME_WIDTH - 48, 64);
    lines.lineBetween(48, GAME_HEIGHT - 48, GAME_WIDTH - 48, GAME_HEIGHT - 48);
  }
}

/** 样稿页专用的石拱与祭坛背景，不改变其他场景的装饰。 */
export function drawSanctumBackdrop(scene: Phaser.Scene, centerX = 872): void {
  const g = scene.add.graphics().setDepth(-20);
  g.fillStyle(0x0c0e18, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.fillStyle(0x11131f, 1).fillRect(560, 76, 656, 508);
  g.fillStyle(0x141725, 1);
  const arch = (inset: number, color: number) => {
    g.fillStyle(color, 1).fillPoints([
      { x: centerX - 246 + inset, y: 532 },
      { x: centerX - 246 + inset, y: 238 },
      { x: centerX - 164 + inset / 2, y: 138 + inset },
      { x: centerX, y: 86 + inset },
      { x: centerX + 164 - inset / 2, y: 138 + inset },
      { x: centerX + 246 - inset, y: 238 },
      { x: centerX + 246 - inset, y: 532 },
    ], true);
  };
  arch(0, 0x252735);
  arch(7, 0x141923);
  arch(20, 0x32313e);
  arch(23, 0x101721);
  arch(36, 0x0c141c);
  g.lineStyle(1, UI.teal, 0.13);
  g.strokeCircle(centerX, 296, 144);
  g.strokeCircle(centerX, 296, 138);
  g.lineBetween(centerX, 138, centerX, 450);
  g.lineBetween(centerX - 160, 296, centerX + 160, 296);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const x = centerX + Math.cos(a) * 138;
    const y = 296 + Math.sin(a) * 138;
    g.fillStyle(UI.teal, i % 3 === 0 ? 0.55 : 0.22).fillRect(x - 2, y - 2, 4, 4);
  }
  for (const x of [centerX - 262, centerX + 238]) {
    g.fillStyle(0x1c1e2c, 1).fillRect(x, 196, 24, 342);
    g.fillStyle(0x343342, 1).fillRect(x, 196, 3, 342);
    for (let y = 218; y < 538; y += 48) {
      g.fillStyle(0x0a0e17, 1).fillRect(x, y, 24, 3);
    }
    g.fillStyle(0x383747, 1).fillRect(x - 8, 528, 40, 8);
  }
  g.lineStyle(1, 0x333143, 0.4);
  for (let i = -6; i <= 6; i++) {
    g.lineBetween(centerX + i * 30, 486, centerX + i * 124, 668);
  }
  for (const y of [502, 530, 570, 624]) g.lineBetween(568, y, 1208, y);
  drawRootMargins(g);
  for (const x of [centerX - 254, centerX + 244]) {
    g.lineStyle(2, UI.root, 0.7);
    g.beginPath().moveTo(x,527).lineTo(x+5,463).lineTo(x-4,418)
      .lineTo(x+7,349).lineTo(x+3,285).lineTo(x+12,246).strokePath();
    g.lineStyle(1, UI.rootLight, 0.65);
    g.lineBetween(x+3,467,x+20,446).lineBetween(x+2,365,x+17,347);
    g.fillStyle(UI.teal,0.55).fillRect(x+6,349,2,2);
  }
  // 固定种子分布的尘埃像素，重入时不会改变构图。
  for (let i = 0; i < 48; i++) {
    const x = 582 + (i * 137) % 608;
    const y = 100 + (i * 83) % 414;
    g.fillStyle(i % 3 === 0 ? UI.teal : UI.accent, 0.16 + (i % 4) * 0.08)
      .fillRect(x, y, i % 5 === 0 ? 3 : 2, 2);
  }
  g.lineStyle(1, 0x414052, 0.6);
  g.lineBetween(72, 76, 1208, 76);
  g.lineBetween(72, 594, 1208, 594);
  g.lineBetween(72, 674, 1208, 674);
}

/** 像素肖像的落脚台：装饰无交互，不覆盖卡片命中区域。 */
export function createPortraitPlinth(
  scene: Phaser.Scene, x: number, y: number, color: number, width = 140,
): void {
  const g = scene.add.graphics().setDepth(3);
  const w = width / 2;
  const points = (offset: number) => [
    { x: x - w, y: y + offset }, { x: x - w + 18, y: y - 10 + offset },
    { x: x + w - 18, y: y - 10 + offset }, { x: x + w, y: y + offset },
    { x: x + w - 18, y: y + 10 + offset }, { x: x - w + 18, y: y + 10 + offset },
  ];
  g.fillStyle(0x080c13, 1).fillPoints(points(9), true);
  g.fillStyle(0x272b38, 1).fillPoints(points(3), true);
  g.fillStyle(0x161e29, 1).fillPoints(points(0), true);
  g.lineStyle(1, color, 0.65).strokePoints(points(0), true);
  g.fillStyle(color, 0.75).fillRect(x - 12, y + 12, 24, 2);
}

/** Framed content panel. */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { color?: number; stroke?: number; alpha?: number; depth?: number },
): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(x, y, w, h, opts?.color ?? UI.panel, opts?.alpha ?? 0.94)
    .setStrokeStyle(1, opts?.stroke ?? UI.stroke, 0.75)
    .setDepth(opts?.depth ?? 1);
}

/** Compact stat chip (label + value). */
export function createStatChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  value: string,
  opts?: { width?: number; accent?: number },
): Phaser.GameObjects.Container {
  const w = opts?.width ?? 150;
  const accent = opts?.accent ?? UI.accent;
  const c = scene.add.container(x, y).setDepth(8);
  const bg = scene.add
    .rectangle(0, 0, w, 44, UI.panelAlt, 0.95)
    .setStrokeStyle(1, accent, 0.45);
  const lab = scene.add
    .text(0, -10, label, bodyStyle('11px', UI.textMute))
    .setOrigin(0.5);
  const val = scene.add
    .text(0, 10, value, bodyStyle('15px', UI.text))
    .setOrigin(0.5);
  c.add([bg, lab, val]);
  c.setSize(w, 44);
  return c;
}

export function createSceneTitle(
  scene: Phaser.Scene,
  text: string,
  y = 28,
  size = '26px',
): Phaser.GameObjects.Text {
  return scene.add
    .text(GAME_WIDTH / 2, y, text, titleStyle(size))
    .setOrigin(0.5)
    .setDepth(30);
}

export function createSceneSubtitle(
  scene: Phaser.Scene,
  text: string,
  y = 58,
): Phaser.GameObjects.Text {
  return scene.add
    .text(GAME_WIDTH / 2, y, text, bodyStyle('13px', UI.textMute))
    .setOrigin(0.5)
    .setDepth(30);
}

/**
 * Very light edge darkening for gameplay only (not menus).
 * Kept thin so it does not look like a UI shadow plate.
 */
export function attachRunVignette(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(400);
  const w = GAME_WIDTH;
  const h = GAME_HEIGHT;
  g.fillStyle(0x000000, 0.12);
  g.fillRect(0, 0, w, 10);
  g.fillRect(0, h - 10, w, 10);
  g.fillRect(0, 0, 10, h);
  g.fillRect(w - 10, 0, 10, h);
  // 由 RunScene 的 hudRoot 统一抵消相机缩放位移，这里不再单独平移。
  return g;
}
