import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { TalentScene } from '../scenes/TalentScene';
import { ClassSelectScene } from '../scenes/ClassSelectScene';
import { SettingsScene } from '../scenes/SettingsScene';
import { RunScene } from '../scenes/RunScene';
import { DeathScene } from '../scenes/DeathScene';

/**
 * Design resolution (16:9).
 * Always FIT so the full UI is visible and pointer math stays correct
 * on PC / Android / iOS. Letterbox bars use the same dark bg.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export function isTouchLikeDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = navigator.maxTouchPoints || 0;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini/i.test(ua);
  const iPadDesktop = /Macintosh/i.test(ua) && touchPoints > 1;
  return Boolean(coarse || mobileUa || iPadDesktop || touchPoints > 2);
}

export function isElectronShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent || '');
}

/** True when a touch device is held in portrait — main.ts shows the rotate overlay. */
export function isPortraitBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth && isTouchLikeDevice() && !isElectronShell();
}

/**
 * Internal render-resolution steps (multiplier of the 1280×720 design space).
 * <1 boosts performance on weak devices, >1 renders sharper on high-DPI screens.
 */
export const VIDEO_SCALE_STEPS: readonly number[] = [0.75, 1, 1.5, 2];

let currentRenderScale = 1;

export function getRenderScale(): number {
  return currentRenderScale;
}

/**
 * Renders at 1280×720 × scale without changing the visible world: the drawing
 * buffer grows/shrinks via setGameSize, and every scene camera zooms by the
 * same factor, so all world/UI layout code keeps working in design coords.
 * (ScaleManager.setZoom is a no-op in FIT mode — verified in the Phaser source.)
 */
export function applyRenderScale(game: Phaser.Game, scale: number): void {
  scale = VIDEO_SCALE_STEPS.includes(scale) ? scale : 1;
  currentRenderScale = scale;
  const w = Math.round(GAME_WIDTH * scale);
  const h = Math.round(GAME_HEIGHT * scale);
  if (game.scale.gameSize.width !== w || game.scale.gameSize.height !== h) {
    game.scale.setGameSize(w, h);
  }
  for (const scene of game.scene.scenes) {
    syncSceneRenderScale(scene);
  }
}

/** 相机在场景重入时会重建，必须重新同步倍率与设计坐标中心。 */
export function syncSceneRenderScale(scene: Phaser.Scene): void {
  const cam = scene.cameras?.main;
  if (!cam) return;
  cam.setSize(scene.scale.width, scene.scale.height);
  cam.setZoom(currentRenderScale);
  if (!cam.useBounds) cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  scene.events.emit('render-scale-changed');
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#07060d',
  scale: {
    // FIT keeps 16:9 and correct input mapping on every platform.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    autoRound: true,
    expandParent: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    activePointers: 3,
  },
  scene: [BootScene, MenuScene, TalentScene, ClassSelectScene, SettingsScene, RunScene, DeathScene],
  render: {
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  disableContextMenu: true,
};
