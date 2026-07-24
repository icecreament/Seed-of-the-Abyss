import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { UI, UI_FONT, bodyStyle, titleStyle } from './theme';

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
  return g;
}
