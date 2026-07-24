import Phaser from 'phaser';
import type { Player } from './Player';

export type EnemyKind = 'crawler' | 'spitter' | 'brute';

interface EnemyDef {
  texture: string;
  hp: number;
  damage: number;
  speed: number;
  scale: number;
  score: number;
  bodyW: number;
  bodyH: number;
  bodyOx: number;
  bodyOy: number;
  range?: number;
}

const DEFS: Record<EnemyKind, EnemyDef> = {
  crawler: {
    texture: 'enemy_crawler',
    hp: 28,
    damage: 8,
    speed: 95,
    scale: 2,
    score: 1,
    bodyW: 16,
    bodyH: 12,
    bodyOx: 8,
    bodyOy: 14,
  },
  spitter: {
    texture: 'enemy_spitter',
    hp: 20,
    damage: 6,
    speed: 70,
    scale: 2,
    score: 2,
    bodyW: 14,
    bodyH: 12,
    bodyOx: 9,
    bodyOy: 12,
    range: 220,
  },
  brute: {
    texture: 'enemy_brute',
    hp: 70,
    damage: 14,
    speed: 55,
    scale: 2,
    score: 4,
    bodyW: 18,
    bodyH: 16,
    bodyOx: 7,
    bodyOy: 12,
  },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly kind: EnemyKind;
  readonly elite: boolean;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  score: number;
  attackRange: number;
  private attackCd = 0;
  private knockbackMs = 0;
  private alive = true;
  private shadow: Phaser.GameObjects.Image;
  private hpBar?: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: EnemyKind,
    floor: number,
    elite = false,
  ) {
    const def = DEFS[kind];
    super(scene, x, y, def.texture, 0);
    this.kind = kind;
    this.elite = elite;
    const scaleMul = 1 + (floor - 1) * 0.12;
    const eliteMul = elite ? 1.85 : 1;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(def.scale * (elite ? 1.2 : 1));
    this.setOrigin(0.5, 0.75);
    this.setDepth(8);
    if (elite) this.setTint(0xffc4a8);

    this.shadow = scene.add
      .image(x, y + 4, 'shadow')
      .setScale(def.scale * (elite ? 1.15 : 0.9))
      .setAlpha(0.3)
      .setDepth(7);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(def.bodyW, def.bodyH);
    body.setOffset(def.bodyOx, def.bodyOy);

    this.maxHp = Math.floor(def.hp * scaleMul * eliteMul);
    this.hp = this.maxHp;
    this.damage = Math.floor(def.damage * scaleMul * (elite ? 1.35 : 1));
    this.speed = def.speed * (1 + (floor - 1) * 0.04) * (elite ? 1.08 : 1);
    this.score = def.score * (elite ? 3 : 1);
    this.attackRange = (def.range ?? 34) * (elite ? 1.1 : 1);

    if (elite) {
      this.hpBar = scene.add.graphics().setDepth(9);
    }

    this.play(`${def.texture}_walk`, true);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  updateAI(player: Player, deltaMs: number): Phaser.Math.Vector2 | null {
    if (!this.alive || player.dead) {
      this.setVelocity(0, 0);
      if (this.shadow.active) this.shadow.setPosition(this.x, this.y + 4);
      this.drawHpBar();
      return null;
    }

    this.attackCd = Math.max(0, this.attackCd - deltaMs);
    this.knockbackMs = Math.max(0, this.knockbackMs - deltaMs);

    if (this.knockbackMs > 0) {
      this.shadow.setPosition(this.x, this.y + 4);
      this.shadow.setFlipX(this.flipX);
      this.drawHpBar();
      return null;
    }

    // Stealthed player: enemies wander more slowly / lose track a bit
    const stealthed = player.isStealthed;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const track = stealthed ? 0.35 : 1;

    if (Math.abs(dx) > 4) this.setFlipX(dx < 0);

    if (this.kind === 'spitter') {
      if (dist > this.attackRange * 0.85) {
        this.setVelocity((dx / dist) * this.speed * track, (dy / dist) * this.speed * track);
      } else if (dist < this.attackRange * 0.55) {
        this.setVelocity((-dx / dist) * this.speed * 0.8, (-dy / dist) * this.speed * 0.8);
      } else {
        this.setVelocity(0, 0);
      }
      this.shadow.setPosition(this.x, this.y + 4);
      this.shadow.setFlipX(this.flipX);
      this.drawHpBar();

      if (!stealthed && dist <= this.attackRange && this.attackCd <= 0) {
        this.attackCd = this.elite ? 1100 : 1400;
        return new Phaser.Math.Vector2(dx / dist, dy / dist);
      }
      return null;
    }

    if (dist > 20) {
      this.setVelocity((dx / dist) * this.speed * track, (dy / dist) * this.speed * track);
    } else {
      this.setVelocity(0, 0);
    }

    this.shadow.setPosition(this.x, this.y + 4);
    this.shadow.setFlipX(this.flipX);
    this.drawHpBar();
    return null;
  }

  applyKnockback(dirX: number, dirY: number, force = 280, durationMs = 120): void {
    if (!this.alive) return;
    const len = Math.hypot(dirX, dirY) || 1;
    this.knockbackMs = durationMs;
    this.setVelocity((dirX / len) * force, (dirY / len) * force);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.alive) {
        if (this.elite) this.setTint(0xffc4a8);
        else this.clearTint();
      }
    });
    if (this.hp <= 0) {
      this.alive = false;
      this.hp = 0;
      this.shadow.destroy();
      this.hpBar?.destroy();
      this.disableBody(true, true);
      return true;
    }
    this.drawHpBar();
    return false;
  }

  private drawHpBar(): void {
    if (!this.hpBar || !this.alive) return;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const w = 28;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x1a1020, 0.85);
    this.hpBar.fillRect(this.x - w / 2, this.y - 28, w, 4);
    this.hpBar.fillStyle(0xe24b5a, 1);
    this.hpBar.fillRect(this.x - w / 2, this.y - 28, w * ratio, 4);
  }

  destroy(fromScene?: boolean): void {
    if (this.shadow?.active) this.shadow.destroy();
    this.hpBar?.destroy();
    super.destroy(fromScene);
  }
}
