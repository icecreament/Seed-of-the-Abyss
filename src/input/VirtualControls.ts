import { HudPeek, focusOverlaps, type FocusRect } from '../ui/CombatHudFocus';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { t } from '../i18n/i18n';
import { UI } from '../ui/theme';
import type { AmbushAction } from './AmbushInputOrder';

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
  private skillText!: Phaser.GameObjects.Text;
  /** Dot that slides along the drag direction while aiming with the attack button. */
  private attackKnob!: Phaser.GameObjects.Arc;
  readonly root: Phaser.GameObjects.Container;

  private stickPointerId: number | null = null;
  private attackPointerId: number | null = null;
  private stickOrigin = new Phaser.Math.Vector2();
  private stickVec = new Phaser.Math.Vector2(0, 0);
  private maxRadius = 56;

  attackHeld = false;
  attackPressed = false;
  dashPressed = false;
  skillPressed = false;
  /** Drag direction of the held attack button (design coords). Zero = no manual aim. */
  readonly attackAim = new Phaser.Math.Vector2(0, 0);

  private readonly combatPeeks: Array<{button: Phaser.GameObjects.Container; outer: Phaser.GameObjects.Arc; inner: Phaser.GameObjects.Arc; peek: HudPeek}> = [];
  private readonly stickPeek = new HudPeek();
  private readonly cooldownBars: Phaser.GameObjects.Graphics[] = [];
  private readonly cooldownSteps = [-1, -1, -1];
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
        this.attackPressed = true;
        this.onActionPress?.('attack', p.event?.timeStamp);
        this.attackPointerId = p.id;
      }
    } else if (this.hit(this.dashBtn, x, y)) {
      this.dashPressed = true;
      this.onActionPress?.('dash', p.event?.timeStamp);
    } else if (this.hit(this.skillBtn, x, y)) {
      this.skillPressed = true;
      this.onActionPress?.('skill', p.event?.timeStamp);
    }
  };

  private onMove = (p: Phaser.Input.Pointer) => {
    if (!this.enabled) return;
    const rs = this.scene.scale.width / GAME_WIDTH || 1;
    const x = p.x / rs;
    const y = p.y / rs;

    if (p.id === this.stickPointerId) {
      const dx = x - this.stickOrigin.x;
      const dy = y - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(len, this.maxRadius);
      const nx = len > 0 ? dx / len : 0;
      const ny = len > 0 ? dy / len : 0;
      this.knob.setPosition(this.stickOrigin.x + nx * clamped, this.stickOrigin.y + ny * clamped);
      this.stickVec.set(nx * (clamped / this.maxRadius), ny * (clamped / this.maxRadius));
      return;
    }

    // The attack button doubles as an aim stick: drag past the dead zone
    // (any direction) to aim attacks there; a plain tap keeps movement aim.
    if (p.id === this.attackPointerId) {
      const dx = x - this.attackBtn.x;
      const dy = y - this.attackBtn.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 14 * 14) {
        this.attackAim.set(dx, dy);
        // Slide the knob toward the drag so the aim is visible on screen.
        const inv = 26 / Math.sqrt(lenSq);
        this.attackKnob
          .setPosition(this.attackBtn.x + dx * inv, this.attackBtn.y + dy * inv)
          .setAlpha(1);
      }
    }
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
      this.resetAimKnob();
    }
  };

  constructor(scene: Phaser.Scene, private readonly onActionPress?: (action: AmbushAction, timeStamp: number) => void) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);

    // Fixed design space — RunScene 把 root 挂进 hudRoot，由 hudRoot 统一抵消缩放。

    // Fixed design space — the camera zoom handles the render scale.
    const h = GAME_HEIGHT;
    const w = GAME_WIDTH;

    // Bigger touch targets for phones.
    this.base = scene.add.circle(100, h - 100, 64, UI.bg, 0.65).setStrokeStyle(2, UI.rootLight, 0.65);
    this.knob = scene.add.circle(100, h - 100, 30, UI.teal, 0.32).setStrokeStyle(1, UI.teal, 0.6);
    this.stickOrigin.set(100, h - 100);
    this.root.add([this.base, this.knob]);

    this.attackBtn = this.makeButton(w - 90, h - 90, 48, UI.bone, t('btn_atk'));
    this.dashBtn = this.makeButton(w - 175, h - 140, 40, UI.teal, t('btn_dash'));
    this.skillBtn = this.makeButton(w - 175, h - 55, 40, UI.accent, t('btn_skill'));
    this.skillText = this.skillBtn.list[2] as Phaser.GameObjects.Text;
    this.root.add([this.attackBtn, this.dashBtn, this.skillBtn]);

    this.attackKnob = scene.add
      .circle(this.attackBtn.x, this.attackBtn.y, 13, 0xffffff, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.7)
      .setAlpha(0);
    this.root.add(this.attackKnob);

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

  /** Visual only: do not change the gesture hit radii, pointer owners or controls. */
  updateCooldowns(progress: readonly number[]): void {
    const colors = [UI.bone, UI.teal, UI.accent];
    progress.forEach((value, i) => {
      const step = Math.round(Phaser.Math.Clamp(value, 0, 1) * 100);
      if (!this.cooldownBars[i] || this.cooldownSteps[i] === step) return;
      this.cooldownSteps[i] = step;
      const width = i === 0 ? 48 : 40;
      const g = this.cooldownBars[i];
      g.clear().fillStyle(UI.panelAlt, 1).fillRect(-width/2, 16, width, 3);
      g.fillStyle(colors[i], step === 100 ? 1 : 0.55).fillRect(-width/2, 16, width*step/100, 3);
    });
  }

  /** Text/color only. Geometry, alpha, gesture ownership and handlers are untouched. */
  updateSkillCue(label: string, emphasis = false): void {
    if (this.skillText.text !== label) {
      this.skillText.setText(label).setFontSize(13);
      if (this.skillText.width > 64) this.skillText.setFontSize(11);
    }
    const color = emphasis ? '#e5dda0' : '#ffffff';
    if (this.skillText.style.color !== color) this.skillText.setColor(color);
  }

  /** Only reduce opaque fills: outlines, labels, cooldowns and gesture ownership stay intact. */
  updateCombatFocus(focus: readonly FocusRect[], delta: number, enabled = true): void {
    for(const entry of this.combatPeeks){
      const r=entry.button.getData('hitRadius') as number;
      const bounds={x:entry.button.x-r,y:entry.button.y-r,width:r*2,height:r*2};
      entry.peek.update(focus.some(rect=>focusOverlaps(rect,bounds)),delta,enabled&&this.enabled);
      entry.outer.setFillStyle(UI.bg,0.88*entry.peek.alpha(0.12));
      entry.inner.setFillStyle(UI.panel,0.4*entry.peek.alpha(0.08));
    }
    const stick={x:this.base.x-64,y:this.base.y-64,width:128,height:128};
    this.stickPeek.update(focus.some(rect=>focusOverlaps(rect,stick)),delta,enabled&&this.enabled);
    this.base.setFillStyle(UI.bg,0.65*this.stickPeek.alpha(0.14));
    this.knob.setFillStyle(UI.teal,0.32*this.stickPeek.alpha(0.20));
  }

  consumePresses(): void {
    this.attackPressed = false;
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
    this.attackPressed = false;
    this.dashPressed = false;
    this.skillPressed = false;
    this.resetAimKnob();
    this.stickPointerId = null;
    this.attackPointerId = null;
    this.knob.setPosition(this.stickOrigin.x, this.stickOrigin.y);
  }

  private resetAimKnob(): void {
    this.attackAim.set(0, 0);
    if (this.attackKnob) {
      this.attackKnob.setPosition(this.attackBtn.x, this.attackBtn.y).setAlpha(0);
    }
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
    const circle = this.scene.add.circle(0, 0, r, UI.bg, 0.88).setStrokeStyle(2, color, 0.65);
    const inner = this.scene.add.circle(0, 0, r-6, UI.panel, 0.4).setStrokeStyle(1, UI.root, 0.65);
    const cooldown = this.scene.add.graphics();
    this.cooldownBars.push(cooldown);
    const text = this.scene.add
      .text(0, -5, label, {
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#070a10',
        strokeThickness: 2,
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
      })
      .setOrigin(0.5);
    c.add([circle, inner, text, cooldown]);
    this.combatPeeks.push({button:c,outer:circle,inner,peek:new HudPeek()});
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
