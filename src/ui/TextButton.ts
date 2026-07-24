import Phaser from 'phaser';
import { UI, UI_FONT } from './theme';

type ButtonOpts = {
  width?: number;
  height?: number;
  color?: number;
  fontSize?: string;
  stroke?: number;
  depth?: number;
};

/**
 * Reliable clickable text button.
 * Uses pointerup + small movement tolerance; works with touch and mouse.
 */
export function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts?: ButtonOpts,
): Phaser.GameObjects.Container {
  const w = opts?.width ?? 220;
  const h = opts?.height ?? 44;
  const color = opts?.color ?? UI.panelAlt;
  const stroke = opts?.stroke ?? UI.strokeBright;
  const depth = opts?.depth ?? 20;

  const container = scene.add.container(x, y).setDepth(depth);
  const bg = scene.add
    .rectangle(0, 0, w, h, color, 0.96)
    .setStrokeStyle(1, stroke, 0.75);
  const text = scene.add
    .text(0, 0, label, {
      fontSize: opts?.fontSize ?? '16px',
      color: UI.text,
      fontFamily: UI_FONT,
    })
    .setOrigin(0.5);
  const line = scene.add.rectangle(0, h / 2 - 2, Math.min(w - 24, 120), 2, UI.accent, 0.55);

  container.add([bg, line, text]);
  container.setSize(w, h);

  // Hit target on the container itself (not a nested child) — more reliable for touch.
  container.setInteractive(
    new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
    Phaser.Geom.Rectangle.Contains,
  );
  if (scene.input) {
    scene.input.setTopOnly(true);
  }

  let pressed = false;

  const paintIdle = () => {
    bg.setFillStyle(color, 0.96);
    line.setFillStyle(UI.accent, 0.55);
  };
  const paintHover = () => {
    bg.setFillStyle(0x3a3058, 1);
    line.setFillStyle(UI.teal, 0.9);
  };
  const paintDown = () => {
    bg.setFillStyle(0x1a1428, 1);
  };

  container.on('pointerover', () => {
    if (!pressed) paintHover();
  });
  container.on('pointerout', () => {
    pressed = false;
    paintIdle();
  });
  container.on('pointerdown', (p: Phaser.Input.Pointer) => {
    pressed = true;
    paintDown();
    // Capture so a drag-off still can cancel cleanly
    p.event?.stopPropagation?.();
  });
  container.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!pressed) return;
    pressed = false;
    paintHover();
    // Ignore if released far from button center (accidental drag)
    const dx = Math.abs(p.x - container.x);
    const dy = Math.abs(p.y - container.y);
    if (dx <= w * 0.65 && dy <= h * 0.8) {
      onClick();
    } else {
      paintIdle();
    }
  });

  // Touch devices sometimes only fire pointerup outside after cancel — also accept pointerupoutside reset
  container.on('pointerupoutside', () => {
    pressed = false;
    paintIdle();
  });

  return container;
}
