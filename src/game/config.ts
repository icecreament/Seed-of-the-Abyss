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
 * scrollFactor(0) layers are zoomed around the buffer center by the camera,
 * which throws fixed HUD elements off-screen at renderScale ≠ 1. Shifting the
 * layer root by center × (z − 1) maps design coords back onto the buffer.
 * Container children multiply in the parent's scrollFactor (see Phaser's
 * ContainerWebGLRenderer), so offsetting the root fixes the whole subtree.
 */
export function offsetFixedUi(obj: Phaser.GameObjects.Components.Transform): void {
  const z = currentRenderScale;
  if (z === 1) return;
  obj.setPosition(obj.x + (GAME_WIDTH / 2) * (z - 1), obj.y + (GAME_HEIGHT / 2) * (z - 1));
}

const hookedScenes = new WeakSet<Phaser.Scene>();

/** Apply the current render scale to a scene camera, now and on every restart. */
function hookSceneCamera(scene: Phaser.Scene): void {
  if (hookedScenes.has(scene)) return;
  hookedScenes.add(scene);
  scene.sys.events.on(Phaser.Scenes.Events.START, () => {
    const cam = scene.cameras?.main;
    if (!cam) return;
    if (cam.zoom !== currentRenderScale) cam.setZoom(currentRenderScale);
    cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  });
}

/**
 * Renders at 1280×720 × scale without changing the visible world: the drawing
 * buffer grows/shrinks via setGameSize, and every scene camera zooms by the
 * same factor, so all world/UI layout code keeps working in design coords.
 * (ScaleManager.setZoom is a no-op in FIT mode — verified in the Phaser source.)
 * setGameSize shifts the camera view, so the view is re-centered on the design
 * space; scenes started later get the same treatment via the START hook above.
 * RunScene overrides scroll with setBounds + startFollow right after, harmless.
 */
export function applyRenderScale(game: Phaser.Game, scale: number): void {
  currentRenderScale = scale;
  const w = Math.round(GAME_WIDTH * scale);
  const h = Math.round(GAME_HEIGHT * scale);
  if (game.scale.gameSize.width !== w || game.scale.gameSize.height !== h) {
    game.scale.setGameSize(w, h);
  }
  for (const scene of game.scene.scenes) {
    hookSceneCamera(scene);
    const cam = scene.cameras?.main;
    if (!cam) continue;
    if (cam.zoom !== scale) cam.setZoom(scale);
    cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }
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
