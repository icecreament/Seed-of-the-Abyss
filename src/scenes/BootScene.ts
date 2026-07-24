import Phaser from 'phaser';
import { generateAllPixelTextures, registerPixelAnimations } from '../assets/PixelFactory';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Textures are generated in create() so the game context is fully ready.
  }

  create(): void {
    generateAllPixelTextures(this);
    registerPixelAnimations(this);
    this.scene.start('Menu');
  }
}
