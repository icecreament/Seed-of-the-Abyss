import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { TalentScene } from '../scenes/TalentScene';
import { ClassSelectScene } from '../scenes/ClassSelectScene';
import { RunScene } from '../scenes/RunScene';
import { DeathScene } from '../scenes/DeathScene';

/**
 * Design resolution (16:9).
 * Pixel-art game: keep integer zoom friendly. 1280x720 is a clean 16:9 canvas.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#07060d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    autoRound: true,
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
    // Nearest-neighbor sampling — required for crisp pixel sprites.
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
};
