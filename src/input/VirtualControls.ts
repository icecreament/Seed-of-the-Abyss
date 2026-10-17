import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { t } from '../i18n/i18n';

/**
 * On-screen left stick + action buttons for touch devices.
 */
export class VirtualControls {
  private scene: Phaser.Scene;
  private base!: Phaser.GameObjects.Arc;
  private knob!: Phaser.GameObjects.Arc;
  private attackBtn!: Phaser.GameObjects.Container;
  private dashBtn!: Phaser.GameObjects.Container;
  private skillBtn!: Phaser.GameObjects.Container;
  readonly root: Phaser.GameObjects.Container;

  private stickPointerId: number | null = null;
  private attackPointerId: number | null = null;
  private stickOrigin = new Phaser.Math.Vector2();
  private stickVec = new Phaser.Math.Vector2(0, 0);
  private maxRadius = 56;

  attackHeld = false;
  dashPressed = false;
  skillPressed = false;

  private enabled = false;
  private bound = false;
  private suspended = false;

  private onDown = (p: Phaser.Input.Pointer) => {
    if (this.suspended || !p.wasTouch) return;
    // First touch enables mobile UI.
    if (!this.enabled && p.wasTouch) this.show();
    if (!this.enabled) return;

    // Pointer coords arrive in game-size space (1280×720 × render scale);
    // the stick lives in design space (camera zoom maps the two), so convert.
    const rs = this.scene.scale.width / GAME_WIDTH || 1;
    const x = p.x / rs;
    const y = p.y / rs;
    const w = GAME_WIDTH;

    if (x < w * 0.48 && this.stickPointerId === null) {
      this.stickPointerId = p.id;
      this.stickOrigin.set(x, y);
      this.base.setPosition(x, y);
      this.knob.setPosition(x, y);
      return;
    }

    if (this.hit(this.attackBtn, x, y)) {
      if (this.attackPointerId === null) {
        this.attackHeld = true;
        this.attackPointerId = p.id;
      }
    } else if (this.hit(this.dashBtn, x, y)) {
      this.dashPressed = true;
    } else if (this.hit(this.skillBtn, x, y)) {
      this.skillPressed = true;
    }
  };

  private onMove = (p: Phaser.Input.Pointer) => {
    if (!this.enabled || p.id !== this.stickPointerId) return;
    const rs = this.scene.scale.width / GAME_WIDTH || 1;
    const dx = p.x / rs - this.stickOrigin.x;
    const dy = p.y / rs - this.stickOrigin.y;
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
    // Track the exact finger that pressed attack — with multi-touch the old
    // activePointer.isDown check cleared attackHeld when ANY finger lifted.
    if (p.id === this.attackPointerId) {
      this.attackPointerId = null;
      this.attackHeld = false;
    }
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);

    // Fixed design space — the camera zoom handles the render scale.
    const h = GAME_HEIGHT;
    const w = GAME_WIDTH;

    // Bigger touch targets for phones.
    this.base = scene.add.circle(100, h - 100, 64, 0xffffff, 0.14).setStrokeStyle(2, 0xffffff, 0.28);
    this.knob = scene.add.circle(100, h - 100, 30, 0xffffff, 0.32);
    this.stickOrigin.set(100, h - 100);
    this.root.add([this.base, this.knob]);

    this.attackBtn = this.makeButton(w - 90, h - 90, 48, 0xff6b6b, t('btn_atk'));
    this.dashBtn = this.makeButton(w - 175, h - 140, 40, 0x4ecdc4, t('btn_dash'));
    this.skillBtn = this.makeButton(w - 175, h - 55, 40, 0xb794f6, t('btn_skill'));
    this.root.add([this.attackBtn, this.dashBtn, this.skillBtn]);

    this.root.setVisible(false);
    this.bind();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get moveVector(): Phaser.Math.Vector2 {
    return this.stickVec.clone();
  }

  get isVisible(): boolean {
    return this.enabled;
  }

  consumePresses(): void {
    this.dashPressed = false;
    this.skillPressed = false;
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) this.hide();
  }

  show(): void {
    if (this.suspended) return;
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
    this.attackPointerId = null;
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
    const circle = this.scene.add.circle(0, 0, r, color, 0.38).setStrokeStyle(2, color, 0.85);
    const text = this.scene.add
      .text(0, 0, label, {
        fontSize: '13px',
        color: '#ffffff',
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
      })
      .setOrigin(0.5);
    c.add([circle, text]);
    // Inflated hit size
    c.setSize(r * 2.4, r * 2.4);
    c.setData('hitRadius', r);
    return c;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.scene.input.on('pointerdown', this.onDown);
    this.scene.input.on('pointermove', this.onMove);
    this.scene.input.on('pointerup', this.onUp);
    this.scene.input.on('pointerupoutside', this.onUp);
  }

  private unbind(): void {
    if (!this.bound) return;
    this.bound = false;
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.input.off('pointerupoutside', this.onUp);
  }

  private hit(btn: Phaser.GameObjects.Container, x: number, y: number): boolean {
    // 使用可见圆形命中区，避免放大的矩形边角同时触发多个动作。
    const radius = btn.getData('hitRadius') as number;
    return (x - btn.x) ** 2 + (y - btn.y) ** 2 <= radius ** 2;
  }
}
