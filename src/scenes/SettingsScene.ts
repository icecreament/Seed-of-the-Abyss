import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  VIDEO_SCALE_STEPS,
  applyRenderScale,
} from '../game/config';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
import { createDropdown, type DropdownOption } from '../ui/Dropdown';
import { createPanel, createSceneTitle, drawAbyssBackdrop } from '../ui/SceneDecor';
import { UI, bodyStyle } from '../ui/theme';
import { t } from '../i18n/i18n';
import { fadeInScene, goScene } from '../ui/transitions';

/** Desktop window content-size presets (16:9). */
const WINDOW_PRESETS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
];

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(): void {
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.32 });
    createSceneTitle(this, t('settings_title'), 64, '30px');

    const desktop = window.seedDesktop;
    createPanel(this, GAME_WIDTH / 2, 300, 720, 250, {
      color: UI.panel,
      stroke: UI.stroke,
      alpha: 0.9,
    });

    this.buildResolutionRow(245, desktop);
    if (desktop) {
      this.buildDisplayRow(desktop, 325);
    } else {
      this.add
        .text(GAME_WIDTH / 2, 330, t('settings_browser_hint'), bodyStyle('15px', UI.textDim))
        .setOrigin(0.5);
    }

    this.add
      .text(GAME_WIDTH / 2, 480, t('settings_hint'), bodyStyle('12px', UI.textMute))
      .setOrigin(0.5);

    createTextButton(
      this,
      GAME_WIDTH / 2,
      600,
      t('settings_back'),
      () => goScene(this, 'Menu'),
      { width: 220, height: 44 },
    );
  }

  private rowLabel(y: number, labelKey: string): void {
    this.add
      .text(GAME_WIDTH / 2 - 310, y, t(labelKey), bodyStyle('15px', UI.text))
      .setOrigin(0, 0.5);
  }

  private buildResolutionRow(y: number, desktop?: SeedDesktopApi): void {
    this.rowLabel(y, 'settings_resolution');
    const x = GAME_WIDTH / 2 + 160;

    if (desktop) {
      // Desktop: resolution = real OS window size. The render buffer follows
      // the window 1:1 so the picture stays sharp at every preset.
      const v = saveSystem.video;
      const opts: DropdownOption[] = WINDOW_PRESETS.map(([w, h]) => ({
        label: `${w} × ${h}`,
        value: `${w}x${h}`,
      }));
      const curKey = `${v.winW}x${v.winH}`;
      if (!opts.some((o) => o.value === curKey)) {
        // Window was drag-resized to a non-preset size — still show it.
        opts.push({ label: `${v.winW} × ${v.winH}`, value: curKey });
      }
      const dd = createDropdown(this, x, y, opts, curKey, (val) => {
        const [w, h] = val.split('x').map(Number);
        if (!w || !h) return;
        void desktop.setWindowSize(w, h);
        saveSystem.setWindowSize(w, h);
        const scale = w / GAME_WIDTH;
        saveSystem.setRenderScale(scale);
        applyRenderScale(this.game, scale);
      });
      // Dragging the window frame updates the shown value too.
      const off = desktop.onWindowSizeChanged((w, h) => dd.setValue(`${w}x${h}`));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => off());
      return;
    }

    // Browser / mobile: no window to resize — resolution = render scale.
    const opts: DropdownOption[] = VIDEO_SCALE_STEPS.map((s) => {
      const nameKey =
        s < 1 ? 'res_perf' : s < 1.5 ? 'res_standard' : s < 2 ? 'res_hd' : 'res_ultra';
      const w = Math.round(GAME_WIDTH * s);
      const h = Math.round(GAME_HEIGHT * s);
      return { label: `${t(nameKey)} · ${w} × ${h}`, value: String(s) };
    });
    createDropdown(this, x, y, opts, String(saveSystem.video.renderScale), (val) => {
      const scale = Number(val);
      if (!scale) return;
      saveSystem.setRenderScale(scale);
      applyRenderScale(this.game, scale);
    });
  }

  private buildDisplayRow(desktop: SeedDesktopApi, y: number): void {
    this.rowLabel(y, 'settings_display');
    const opts: DropdownOption[] = [
      { label: t('settings_windowed'), value: 'windowed' },
      { label: t('settings_fullscreen'), value: 'fullscreen' },
    ];
    const dd = createDropdown(this, GAME_WIDTH / 2 + 160, y, opts, 'windowed', (val) => {
      void desktop.setFullscreen(val === 'fullscreen');
    });
    const sync = (flag: boolean) => dd.setValue(flag ? 'fullscreen' : 'windowed');
    void desktop.isFullscreen().then(sync);
    // Covers F11/Alt+Enter too — main.cjs reports every fullscreen transition.
    const off = desktop.onFullscreenChanged(sync);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => off());
  }
}
