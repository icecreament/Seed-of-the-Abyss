import Phaser from 'phaser';
import { CLASSES, HERO_TEXTURES, type ClassId } from '../data/classes';
import type { PermanentStats } from '../systems/SaveSystem';

export interface PlayerStats {
  maxHp: number;
  hp: number;
  damage: number;
  speed: number;
  attackCooldown: number;
  attackRange: number;
  dashCooldown: number;
  skillCooldown: number;
  lifesteal: number;
  armor: number;
  critChance: number;
}

const HERO_SCALE = 2;

/** Dash tuning (ms / px·s⁻¹). Max speed cap must exceed the largest dash boost. */
const DASH_DURATION_MS = 140;
const DASH_BOOST = 420;
const DASH_BOOST_SHADE = 520;
/** Shade skill: a longer stealth-dash. */
const SHADE_SKILL_DASH_MS = 160;
const SHADE_SKILL_BOOST = 560;
const SHADE_SKILL_STEALTH_MS = 1600;
const WARDEN_SKILL_MS = 1800;
const REAVER_SKILL_MS = 2200;
/** White hit-flash shown on taking damage. */
const HIT_FLASH_MS = 80;
const HURT_INVULN_MS = 220;
/** Well above every dash boost so Arcade never clamps a dash back to walk speed. */
const BODY_MAX_SPEED = 640;

export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly classId: ClassId;
  stats: PlayerStats;
  private shadow: Phaser.GameObjects.Image;
  private facing = new Phaser.Math.Vector2(1, 0);
  private attackTimer = 0;
  private dashTimer = 0;
  private skillTimer = 0;
  private invulnTimer = 0;
  private dashActive = 0;
  private skillActive = 0;
  private hitFlashTimer = 0;
  private isDead = false;
  private texKey: string;
  /** Sustained-skill orbit ring (thorn has none — its nova is instant). */
  private skillFx?: Phaser.GameObjects.Sprite;

  moveIntent = new Phaser.Math.Vector2(0, 0);
  aimIntent = new Phaser.Math.Vector2(1, 0);
  wantAttack = false;
  wantDash = false;
  wantSkill = false;
  /** Thorn skill: asks the scene to fire the nova ring (Player keeps no
   * reference to the scene's projectile list). Consumed by RunScene. */
  pendingNova = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    classId: ClassId,
    permanent: PermanentStats,
  ) {
    const def = CLASSES[classId];
    const texKey = HERO_TEXTURES[classId];
    super(scene, x, y, texKey, 0);
    this.classId = classId;
    this.texKey = texKey;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(HERO_SCALE);
    this.setOrigin(0.5, 0.72);
    this.setCollideWorldBounds(true);
    this.setDepth(10);

    this.shadow = scene.add
      .image(x, y + 6, 'shadow')
      .setScale(HERO_SCALE)
      .setAlpha(0.35)
      .setDepth(9);

    if (classId !== 'thorn') {
      this.skillFx = scene.add
        .sprite(x, y, `fx_ring_${classId}`, 0)
        .setScale(2)
        .setDepth(11)
        .setAlpha(0.85)
        .setVisible(false);
      this.skillFx.play(`fx_ring_${classId}_play`);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(14, 12);
    body.setOffset(9, 16);
    // Cap must cover the fastest dash boost — previously this was base speed
    // +40, so every dash got clamped back to walking speed the same frame.
    body.setMaxSpeed(BODY_MAX_SPEED);

    this.stats = {
      maxHp: Math.floor(def.baseHp + permanent.maxHp),
      hp: Math.floor(def.baseHp + permanent.maxHp),
      // Flat stage/talent bonuses add first, percentage talents multiply the
      // sum — keeps pred_fang equally valuable on every class.
      damage: Math.round((def.baseDamage + permanent.damage) * (1 + permanent.damageMul)),
      speed: def.baseSpeed * (1 + permanent.moveSpeed),
      attackCooldown: def.attackCooldown,
      attackRange: def.attackRange + 8,
      dashCooldown: def.dashCooldown,
      skillCooldown: def.skillCooldown,
      lifesteal: permanent.lifesteal,
      armor: permanent.armor,
      critChance: permanent.critChance,
    };

    this.play(`${texKey}_idle`, true);
  }

  get dead(): boolean {
    return this.isDead;
  }

  get facingDir(): Phaser.Math.Vector2 {
    return this.facing.clone();
  }

  get attackReady(): boolean {
    return this.attackTimer <= 0;
  }

  get dashReady(): boolean {
    return this.dashTimer <= 0;
  }

  get skillReady(): boolean {
    return this.skillTimer <= 0;
  }

  get isInvulnerable(): boolean {
    // Skills are NOT invulnerability: warden reduces damage via hasBulwark in
    // applyDamage, shade relies on stealth (enemies lose track). Previously
    // skillActive here made every class fully invincible for the whole skill
    // duration and turned the bulwark 75% reduction into dead code.
    return this.invulnTimer > 0 || this.dashActive > 0;
  }

  get isDashing(): boolean {
    return this.dashActive > 0;
  }

  get hasBulwark(): boolean {
    return this.classId === 'warden' && this.skillActive > 0;
  }

  get isStealthed(): boolean {
    return this.classId === 'shade' && this.skillActive > 0;
  }

  /**
   * Named updateEntity (not `update`) on purpose: GameObject.update has a
   * (time, delta) signature under runChildUpdate groups, and this class only
   * takes delta — keeping the names distinct avoids a future wiring trap.
   */
  updateEntity(deltaMs: number): void {
    if (this.isDead) {
      this.setVelocity(0, 0);
      this.shadow.setPosition(this.x, this.y + 6);
      this.skillFx?.setVisible(false);
      return;
    }

    this.attackTimer = Math.max(0, this.attackTimer - deltaMs);
    this.dashTimer = Math.max(0, this.dashTimer - deltaMs);
    this.skillTimer = Math.max(0, this.skillTimer - deltaMs);
    this.invulnTimer = Math.max(0, this.invulnTimer - deltaMs);
    this.dashActive = Math.max(0, this.dashActive - deltaMs);
    this.skillActive = Math.max(0, this.skillActive - deltaMs);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaMs);

    if (this.aimIntent.lengthSq() > 0.01) {
      this.facing.copy(this.aimIntent).normalize();
    } else if (this.moveIntent.lengthSq() > 0.01) {
      this.facing.copy(this.moveIntent).normalize();
    }

    if (Math.abs(this.facing.x) > 0.15) {
      this.setFlipX(this.facing.x < 0);
    }

    if (this.dashActive <= 0) {
      const len = this.moveIntent.length();
      if (len > 0.01) {
        const nx = this.moveIntent.x / Math.max(len, 1);
        const ny = this.moveIntent.y / Math.max(len, 1);
        this.setVelocity(nx * this.stats.speed, ny * this.stats.speed);
      } else {
        this.setVelocity(0, 0);
      }
    }

    const moving = this.body && (this.body as Phaser.Physics.Arcade.Body).speed > 12;
    const walkKey = `${this.texKey}_walk`;
    const idleKey = `${this.texKey}_idle`;
    if (moving) {
      if (this.anims.currentAnim?.key !== walkKey) this.play(walkKey, true);
    } else if (this.anims.currentAnim?.key !== idleKey) {
      this.play(idleKey, true);
    }

    // Hit flash wins over every state tint for a few frames — previously
    // applyDamage set the flash with a delayedCall, but this state machine
    // cleared the tint on the very next frame so the flash never showed.
    if (this.hitFlashTimer > 0) {
      this.setAlpha(1);
      this.setTintFill(0xffffff);
    } else if (this.isStealthed) {
      this.setAlpha(0.4);
      this.clearTint();
    } else if (this.hasBulwark) {
      this.setAlpha(1);
      this.setTint(0xa0fff8);
    } else if (this.invulnTimer > 0 && Math.floor(this.invulnTimer / 40) % 2 === 0) {
      this.setAlpha(0.55);
      this.clearTint();
    } else {
      this.setAlpha(1);
      this.clearTint();
    }

    this.shadow.setPosition(this.x, this.y + 6);
    this.shadow.setFlipX(this.flipX);
    this.shadow.setVisible(!this.isStealthed);
    if (this.skillFx) {
      this.skillFx.setPosition(this.x, this.y);
      this.skillFx.setVisible(this.skillActive > 0);
    }

    if (this.wantDash && this.dashReady) this.performDash();
    if (this.wantSkill && this.skillReady) this.performSkill();
  }

  tryAttack(): {
    origin: Phaser.Math.Vector2;
    dir: Phaser.Math.Vector2;
    damage: number;
    crit: boolean;
  } | null {
    if (this.isDead || this.attackTimer > 0) return null;
    this.attackTimer = this.stats.attackCooldown;

    let dmg = this.stats.damage;
    if (this.classId === 'reaver' && this.skillActive > 0) dmg *= 1.35;
    if (this.isStealthed) {
      dmg *= 1.35;
      this.skillActive = 0;
    }

    const crit = Math.random() < this.stats.critChance;
    if (crit) dmg = Math.floor(dmg * 1.75);

    return {
      origin: new Phaser.Math.Vector2(this.x, this.y),
      dir: this.facing.clone(),
      damage: Math.floor(dmg),
      crit,
    };
  }

  applyDamage(amount: number): number {
    if (this.isDead || this.isInvulnerable) return 0;
    if (this.hasBulwark) amount = Math.floor(amount * 0.25);
    const reduced = Math.max(1, amount - this.stats.armor);
    this.stats.hp -= reduced;
    this.invulnTimer = HURT_INVULN_MS;
    this.hitFlashTimer = HIT_FLASH_MS;
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.isDead = true;
      this.setVelocity(0, 0);
      this.setTint(0x555555);
      this.anims.stop();
    }
    return reduced;
  }

  heal(amount: number): void {
    if (this.isDead) return;
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  onHitEnemy(damageDealt: number): void {
    if (this.stats.lifesteal > 0) {
      this.heal(Math.max(1, Math.floor(damageDealt * this.stats.lifesteal)));
    }
    if (this.classId === 'reaver') this.heal(1);
  }

  destroy(fromScene?: boolean): void {
    this.shadow?.destroy();
    this.skillFx?.destroy();
    super.destroy(fromScene);
  }

  private performDash(): void {
    this.dashTimer = this.stats.dashCooldown;
    this.dashActive = DASH_DURATION_MS;
    this.invulnTimer = Math.max(this.invulnTimer, DASH_DURATION_MS);
    const dir =
      this.moveIntent.lengthSq() > 0.01
        ? this.moveIntent.clone().normalize()
        : this.facing.clone();
    const boost = this.classId === 'shade' ? DASH_BOOST_SHADE : DASH_BOOST;
    this.setVelocity(dir.x * boost, dir.y * boost);
  }

  private performSkill(): void {
    this.skillTimer = this.stats.skillCooldown;
    if (this.classId === 'warden') {
      this.skillActive = WARDEN_SKILL_MS;
      this.invulnTimer = Math.max(this.invulnTimer, 200);
    } else if (this.classId === 'reaver') {
      this.skillActive = REAVER_SKILL_MS;
      this.heal(8);
    } else if (this.classId === 'thorn') {
      this.pendingNova = true;
    } else {
      this.skillActive = SHADE_SKILL_STEALTH_MS;
      this.dashActive = SHADE_SKILL_DASH_MS;
      this.invulnTimer = Math.max(this.invulnTimer, 400);
      const dir =
        this.moveIntent.lengthSq() > 0.01
          ? this.moveIntent.clone().normalize()
          : this.facing.clone();
      this.setVelocity(dir.x * SHADE_SKILL_BOOST, dir.y * SHADE_SKILL_BOOST);
    }
  }
}
