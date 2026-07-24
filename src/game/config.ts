import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { TalentScene } from '../scenes/TalentScene';
import { ClassSelectScene } from '../scenes/ClassSelectScene';
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
  scene: [BootScene, MenuScene, TalentScene, ClassSelectScene, RunScene, DeathScene],
  render: {
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  disableContextMenu: true,
};
