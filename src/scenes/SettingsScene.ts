import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  VIDEO_SCALE_STEPS,
  applyRenderScale,
} from '../game/config';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
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
  private resValue?: Phaser.GameObjects.Text;
  private fsValue?: Phaser.GameObjects.Text;
  private sizeValue?: Phaser.GameObjects.Text;
  private fullscreen = false;

  constructor() {
    super('Settings');
  }

  create(): void {
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.32 });
    createSceneTitle(this, t('settings_title'), 64, '30px');

    const desktop = window.seedDesktop;
    createPanel(this, GAME_WIDTH / 2, 320, 720, 290, {
      color: UI.panel,
      stroke: UI.stroke,
      alpha: 0.9,
    });

    this.buildResolutionRow(236);
    if (desktop) {
      this.buildFullscreenRow(desktop, 316);
      this.buildWindowSizeRow(desktop, 396);
    } else {
      this.add
        .text(GAME_WIDTH / 2, 330, t('settings_browser_hint'), bodyStyle('15px', UI.textDim))
        .setOrigin(0.5);
    }

    this.add
      .text(GAME_WIDTH / 2, 520, t('settings_hint'), bodyStyle('12px', UI.textMute))
      .setOrigin(0.5);

    createTextButton(
      this,
      GAME_WIDTH / 2,
      610,
      t('settings_back'),
      () => goScene(this, 'Menu'),
      { width: 220, height: 44 },
    );
  }

  /** Label left, value center, "Change" button right. Returns the value text. */
  private buildRow(y: number, labelKey: string, onCycle: () => void): Phaser.GameObjects.Text {
    this.add.text(GAME_WIDTH / 2 - 310, y, t(labelKey), bodyStyle('15px', UI.text)).setOrigin(0, 0.5);
    const value = this.add
      .text(GAME_WIDTH / 2 + 60, y, '', bodyStyle('15px', UI.textGood))
      .setOrigin(0.5);
    createTextButton(this, GAME_WIDTH / 2 + 265, y, t('settings_cycle'), onCycle, {
      width: 110,
      height: 36,
      fontSize: '13px',
    });
    return value;
  }

  private buildResolutionRow(y: number): void {
    this.resValue = this.buildRow(y, 'settings_resolution', () => {
      const cur = saveSystem.video.renderScale;
      const idx = VIDEO_SCALE_STEPS.indexOf(cur);
      const next = VIDEO_SCALE_STEPS[(idx + 1) % VIDEO_SCALE_STEPS.length] ?? 1;
      saveSystem.setRenderScale(next);
      applyRenderScale(this.game, next);
      this.refreshResolutionLabel();
    });
    this.refreshResolutionLabel();
  }

  private refreshResolutionLabel(): void {
    if (!this.resValue) return;
    const s = saveSystem.video.renderScale;
    const nameKey = s < 1 ? 'res_perf' : s < 1.5 ? 'res_standard' : s < 2 ? 'res_hd' : 'res_ultra';
    const w = Math.round(GAME_WIDTH * s);
    const h = Math.round(GAME_HEIGHT * s);
    this.resValue.setText(`${t(nameKey)} · ${w}×${h}`);
  }

  private buildFullscreenRow(desktop: SeedDesktopApi, y: number): void {
    this.fsValue = this.buildRow(y, 'settings_display', () => {
      void desktop.setFullscreen(!this.fullscreen);
    });
    void desktop.isFullscreen().then((flag) => {
      this.fullscreen = flag;
      this.refreshFullscreenLabel();
    });
    // Covers F11/Alt+Enter too — main.cjs reports every fullscreen transition.
    const off = desktop.onFullscreenChanged((flag) => {
      this.fullscreen = flag;
      this.refreshFullscreenLabel();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => off());
    this.refreshFullscreenLabel();
  }

  private refreshFullscreenLabel(): void {
    this.fsValue?.setText(t(this.fullscreen ? 'settings_fullscreen' : 'settings_windowed'));
  }

  private buildWindowSizeRow(desktop: SeedDesktopApi, y: number): void {
    this.sizeValue = this.buildRow(y, 'settings_window_size', () => {
      const v = saveSystem.video;
      const idx = WINDOW_PRESETS.findIndex(([w, h]) => w === v.winW && h === v.winH);
      const [w, h] = WINDOW_PRESETS[(idx + 1) % WINDOW_PRESETS.length]!;
      void desktop.setWindowSize(w, h);
      saveSystem.setWindowSize(w, h);
      this.refreshSizeLabel();
    });
    const off = desktop.onWindowSizeChanged(() => this.refreshSizeLabel());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => off());
    this.refreshSizeLabel();
  }

  private refreshSizeLabel(): void {
    if (!this.sizeValue) return;
    const v = saveSystem.video;
    this.sizeValue.setText(`${v.winW}×${v.winH}`);
  }
}
