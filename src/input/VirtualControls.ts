import Phaser from 'phaser';
import { t } from '../i18n/i18n';

/**
 * On-screen left stick + action buttons for touch devices.
 * Desktop can ignore this; it only activates when touch is used.
 */
export class VirtualControls {
  private scene: Phaser.Scene;
  private base!: Phaser.GameObjects.Arc;
  private knob!: Phaser.GameObjects.Arc;
  private attackBtn!: Phaser.GameObjects.Container;
  private dashBtn!: Phaser.GameObjects.Container;
  private skillBtn!: Phaser.GameObjects.Container;
  private root: Phaser.GameObjects.Container;

  private stickPointerId: number | null = null;
  private stickOrigin = new Phaser.Math.Vector2();
  private stickVec = new Phaser.Math.Vector2(0, 0);
  private maxRadius = 48;

  attackHeld = false;
  dashPressed = false;
  skillPressed = false;

  private enabled = false;
  private bound = false;

  private onDown = (p: Phaser.Input.Pointer) => {
    if (!this.enabled) {
      if (p.wasTouch) this.show();
    }
    if (!this.enabled) return;

    if (p.x < this.scene.scale.width * 0.45 && this.stickPointerId === null) {
      this.stickPointerId = p.id;
      this.stickOrigin.set(p.x, p.y);
      this.base.setPosition(p.x, p.y);
      this.knob.setPosition(p.x, p.y);
      return;
    }

    if (this.hit(this.attackBtn, p)) this.attackHeld = true;
    if (this.hit(this.dashBtn, p)) this.dashPressed = true;
    if (this.hit(this.skillBtn, p)) this.skillPressed = true;
  };

  private onMove = (p: Phaser.Input.Pointer) => {
    if (!this.enabled || p.id !== this.stickPointerId) return;
    const dx = p.x - this.stickOrigin.x;
    const dy = p.y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, this.maxRadius);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    this.knob.setPosition(this.stickOrigin.x + nx * clamped, this.stickOrigin.y + ny * clamped);
    this.stickVec.set(nx * (clamped / this.maxRadius), ny * (clamped / this.maxRadius));
  };

  private onUp = (p: Phaser.Input.Pointer) => {
    if (p.id === this.stickPointerId) {
      this.stickPointerId = null;
      this.stickVec.set(0, 0);
      this.knob.setPosition(this.stickOrigin.x, this.stickOrigin.y);
    }
    if (!this.scene.input.activePointer.isDown) {
      this.attackHeld = false;
    }
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);

    const h = scene.scale.height;
    const w = scene.scale.width;

    this.base = scene.add.circle(90, h - 90, 56, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.25);
    this.knob = scene.add.circle(90, h - 90, 26, 0xffffff, 0.28);
    this.stickOrigin.set(90, h - 90);
    this.root.add([this.base, this.knob]);

    this.attackBtn = this.makeButton(w - 78, h - 78, 40, 0xff6b6b, t('btn_atk'));
    this.dashBtn = this.makeButton(w - 150, h - 120, 32, 0x4ecdc4, t('btn_dash'));
    this.skillBtn = this.makeButton(w - 150, h - 48, 32, 0xb794f6, t('btn_skill'));
    this.root.add([this.attackBtn, this.dashBtn, this.skillBtn]);

    this.root.setVisible(false);
    this.bind();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get moveVector(): Phaser.Math.Vector2 {
    return this.stickVec.clone();
  }

  consumePresses(): void {
    this.dashPressed = false;
    this.skillPressed = false;
  }

  show(): void {
    this.enabled = true;
    this.root.setVisible(true);
  }

  hide(): void {
    this.enabled = false;
    this.root.setVisible(false);
    this.stickVec.set(0, 0);
    this.attackHeld = false;
    this.dashPressed = false;
    this.skillPressed = false;
    this.stickPointerId = null;
    this.knob.setPosition(this.stickOrigin.x, this.stickOrigin.y);
  }

  destroy(): void {
    this.unbind();
    this.hide();
    this.root.destroy(true);
  }

  private makeButton(
    x: number,
    y: number,
    r: number,
    color: number,
    label: string,
  ): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);
    const circle = this.scene.add.circle(0, 0, r, color, 0.35).setStrokeStyle(2, color, 0.8);
    const text = this.scene.add
      .text(0, 0, label, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
      })
      .setOrigin(0.5);
    c.add([circle, text]);
    c.setSize(r * 2, r * 2);
    return c;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.scene.input.on('pointerdown', this.onDown);
    this.scene.input.on('pointermove', this.onMove);
    this.scene.input.on('pointerup', this.onUp);
  }

  private unbind(): void {
    if (!this.bound) return;
    this.bound = false;
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
  }

  private hit(btn: Phaser.GameObjects.Container, p: Phaser.Input.Pointer): boolean {
    const bounds = new Phaser.Geom.Rectangle(
      btn.x - btn.width / 2,
      btn.y - btn.height / 2,
      btn.width,
      btn.height,
    );
    return bounds.contains(p.x, p.y);
  }
}
