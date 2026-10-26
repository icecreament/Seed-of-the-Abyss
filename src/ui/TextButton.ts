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
 * Menu/UI text button.
 * Hit box matches the visible rectangle exactly — no oversized pad that steals
 * neighboring buttons, and no setTopOnly(false) multi-hover mess.
 */
export function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts?: ButtonOpts,
): Phaser.GameObjects.Container {
  const w = opts?.width ?? 240;
  const h = opts?.height ?? 48;
  const color = opts?.color ?? UI.panelAlt;
  const stroke = opts?.stroke ?? UI.rootLight;
  const depth = opts?.depth ?? 80;

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

  const line = scene.add.rectangle(0, h / 2 - 2, Math.min(w - 24, 72), 1, stroke, 0.55);
  const roots = scene.add.graphics();
  roots.lineStyle(1, UI.rootLight, 0.5);
  for (const side of [-1, 1]) {
    const edge = side * (w / 2 - 6);
    roots.beginPath().moveTo(edge, -h/2+6).lineTo(edge-side*5, -h/2+13)
      .lineTo(edge-side*4, -h/2+19).strokePath();
    roots.lineBetween(edge-side*5,-h/2+13,edge-side*12,-h/2+12);
  }

  container.add([bg, line, text, roots]);
  container.setSize(w, h);

  // Hit exactly the drawn button. Origin of rectangle is center by default,
  // so hit area is centered on (0,0) inside the container.
  bg.setInteractive({ useHandCursor: true });

  // Only the top-most interactive object under the pointer should react.
  scene.input.setTopOnly(true);

  const paintIdle = () => {
    bg.setFillStyle(color, 0.96);
    line.setFillStyle(stroke, 0.55);
    bg.setStrokeStyle(1, stroke, 0.75);
  };
  const paintHover = () => {
    bg.setFillStyle(0x273b38, 1);
    bg.setStrokeStyle(1, UI.teal, 0.85);
    line.setFillStyle(UI.teal, 0.9);
  };
  const paintDown = () => {
    bg.setFillStyle(0x1a1428, 1);
  };

  let locked = false;
  let pressedPointer: number | null = null;
  const fire = () => {
    if (locked || !scene.sys.isActive()) return;
    locked = true;
    try {
      onClick();
    } finally {
      scene.time.delayedCall(200, () => {
        locked = false;
        if (bg.scene) paintIdle();
      });
    }
  };

  bg.on('pointerover', () => paintHover());
  bg.on('pointerout', () => {
    pressedPointer = null;
    paintIdle();
  });
  bg.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    pressedPointer = pointer.id;
    paintDown();
  });
  // Single click path for mouse + touch. Phaser maps both to pointerup on the object.
  bg.on('pointerup', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
    const pressedHere = pressedPointer === pointer.id;
    pressedPointer = null;
    paintHover();
    if (pressedHere) {
      event.stopPropagation();
      fire();
    }
  });

  return container;
}
