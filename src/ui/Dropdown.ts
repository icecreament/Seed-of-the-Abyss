import Phaser from 'phaser';
import { UI, UI_FONT } from './theme';

export interface DropdownOption {
  label: string;
  value: string;
}

export interface DropdownHandle {
  container: Phaser.GameObjects.Container;
  /** Update the shown selection without firing onSelect. */
  setValue(value: string): void;
  /** Collapse the option list. */
  close(): void;
}

interface DropdownOpts {
  width?: number;
  rowHeight?: number;
  fontSize?: string;
}

/**
 * Phaser-native dropdown (no DOM overlay): the header shows the current
 * option, tapping it opens the list below. Tapping an option selects it;
 * tapping anywhere else collapses the list — which also means opening one
 * dropdown auto-closes any other on the same scene.
 */
export function createDropdown(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: readonly DropdownOption[],
  current: string,
  onSelect: (value: string) => void,
  opts?: DropdownOpts,
): DropdownHandle {
  const w = opts?.width ?? 300;
  const rowH = opts?.rowHeight ?? 38;
  const fontSize = opts?.fontSize ?? '14px';
  let value = current;
  let open = false;

  const container = scene.add.container(x, y).setDepth(250);

  // ---- header ----
  const headerBg = scene.add
    .rectangle(0, 0, w, rowH, UI.panelAlt, 0.96)
    .setStrokeStyle(1, UI.strokeBright, 0.75);
  const headerText = scene.add
    .text(-w / 2 + 12, 0, '', { fontSize, color: UI.text, fontFamily: UI_FONT })
    .setOrigin(0, 0.5);
  const arrow = scene.add
    .text(w / 2 - 14, 0, '▾', { fontSize, color: UI.textDim, fontFamily: UI_FONT })
    .setOrigin(0.5);
  container.add([headerBg, headerText, arrow]);
  container.setSize(w, rowH);

  const labelOf = (v: string): string =>
    options.find((o) => o.value === v)?.label ?? v.replace('x', '×');

  const syncHeader = () => headerText.setText(labelOf(value));

  // ---- option list (hidden until opened) ----
  const list = scene.add.container(0, rowH / 2);
  const listBg = scene.add
    .rectangle(0, (options.length * rowH) / 2, w, options.length * rowH, UI.panel, 1)
    .setStrokeStyle(1, UI.stroke, 0.9);
  list.add(listBg);

  const rowTexts: Phaser.GameObjects.Text[] = [];
  options.forEach((opt, i) => {
    const rowY = i * rowH + rowH / 2;
    const rowBg = scene.add.rectangle(0, rowY, w - 2, rowH - 2, UI.panelActive, 0);
    const rowText = scene.add
      .text(-w / 2 + 12, rowY, opt.label, { fontSize, color: UI.text, fontFamily: UI_FONT })
      .setOrigin(0, 0.5);
    rowBg.setInteractive({ useHandCursor: true });
    rowBg.on('pointerover', () => rowBg.setFillStyle(UI.panelActive, 1));
    rowBg.on('pointerout', () => rowBg.setFillStyle(UI.panelActive, 0));
    rowBg.on('pointerup', () => {
      value = opt.value;
      syncHeader();
      close();
      onSelect(opt.value);
    });
    rowTexts.push(rowText);
    list.add([rowBg, rowText]);
  });
  list.setVisible(false);
  container.add(list);

  /** Highlight the selected row each time the list opens. */
  const syncRows = () => {
    options.forEach((opt, i) => {
      rowTexts[i]?.setColor(opt.value === value ? UI.textGood : UI.text);
    });
  };

  const close = () => {
    open = false;
    list.setVisible(false);
    arrow.setText('▾');
    container.setDepth(250);
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    open = true;
    syncRows();
    list.setVisible(true);
    arrow.setText('▴');
    container.setDepth(400);
  };

  scene.input.setTopOnly(true);
  headerBg.setInteractive({ useHandCursor: true });
  headerBg.on('pointerover', () => headerBg.setFillStyle(0x3a3058, 1));
  headerBg.on('pointerout', () => headerBg.setFillStyle(UI.panelAlt, 0.96));
  headerBg.on('pointerup', toggle);

  // Collapse on any tap outside the header + list bounds (design coords).
  const onGlobalDown = (pointer: Phaser.Input.Pointer) => {
    if (!open) return;
    const left = x - w / 2;
    const top = y - rowH / 2;
    const totalH = rowH * (1 + options.length);
    const px = pointer.worldX;
    const py = pointer.worldY;
    const inside = px >= left && px <= left + w && py >= top && py <= top + totalH;
    if (!inside) close();
  };
  scene.input.on(Phaser.Input.Events.POINTER_DOWN, onGlobalDown);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off(Phaser.Input.Events.POINTER_DOWN, onGlobalDown);
  });

  syncHeader();

  return {
    container,
    setValue(v: string) {
      value = v;
      syncHeader();
      if (open) syncRows();
    },
    close,
  };
}
