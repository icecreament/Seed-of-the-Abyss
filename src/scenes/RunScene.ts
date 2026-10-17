import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  isPortraitBlocked,
  isTouchLikeDevice,
  syncSceneRenderScale,
} from '../game/config';
import { Player } from '../entities/Player';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import { CLASSES } from '../data/classes';
import { VirtualControls } from '../input/VirtualControls';
import { i18n, t } from '../i18n/i18n';
import { saveSystem } from '../systems/SaveSystem';
import { runState } from '../systems/RunState';
import { attachRunVignette } from '../ui/SceneDecor';
import { UI, UI_FONT } from '../ui/theme';
import { createTextButton } from '../ui/TextButton';

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  fromEnemy: boolean;
  crit: boolean;
}

const TILE = 32;
const MAX_ENEMIES = 28;
const FLOOR_DURATION_MS = 45000;

/** Inner pillars in tile units [tx, ty, w, h]. The border ring is derived. */
const PILLARS: ReadonlyArray<readonly [number, number, number, number]> = [
  [10, 8, 3, 6],
  [22, 18, 5, 2],
  [34, 7, 3, 7],
  [15, 24, 6, 2],
  [30, 22, 2, 5],
  [8, 16, 2, 4],
  [40, 14, 4, 3],
  [26, 10, 2, 2],
];

export class RunScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private virtual!: VirtualControls;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;

  /**
   * 冲刺/技能走 keydown 事件缓冲，而不是每帧轮询 JustDown。
   * Phaser 的 Key.onUp 会把 _justDown 清成 false，按下与抬起落在同一帧内
   * （快速点按、低帧率设备）时 JustDown 会完全丢掉这次按键。
   */
  private pendingDash = false;
  private pendingSkill = false;
  /** 场景重启前解绑 keydown 监听，避免每局叠加一层。 */
  private offKeyHandlers?: () => void;

  private floor = 1;
  private kills = 0;
  private floorKills = 0;
  private damageDealt = 0;
  private timeAlive = 0;
  private spawnTimer = 0;
  private floorTimer = 0;
  private ended = false;
  private paused = false;
  private virtualVisibleBeforePause = false;
  /** Set when the pause came from the portrait rotate overlay, not the user. */
  private pausedByPortrait = false;

  private hpBar!: Phaser.GameObjects.Graphics;
  private cdBar!: Phaser.GameObjects.Graphics;
  private progressBar!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private pauseRoot?: Phaser.GameObjects.Container;
  private hudRoot!: Phaser.GameObjects.Container;
  private pauseButton!: Phaser.GameObjects.Container;
  private projectiles: Projectile[] = [];
  private groundImage?: Phaser.GameObjects.Image;
  private wallRects: Phaser.Geom.Rectangle[] = [];
  private lastHudLine = '';
  private lastFloorLine = '';
  /** Reused for pointer -> world conversion to avoid a per-frame allocation. */
  private readonly aimPoint = new Phaser.Math.Vector2();

  private readonly mapCols = 56;
  private readonly mapRows = 38;
  private readonly mapW = 56 * TILE;
  private readonly mapH = 38 * TILE;

  constructor() {
    super('Run');
  }

  create(): void {
    this.ended = false;
    this.paused = false;
    this.floor = 1;
    this.kills = 0;
    this.floorKills = 0;
    this.damageDealt = 0;
    this.timeAlive = 0;
    this.spawnTimer = 0;
    this.floorTimer = 0;
    this.lastHudLine = '';
    this.lastFloorLine = '';
    this.virtualVisibleBeforePause = false;
    this.pausedByPortrait = false;
    this.pendingDash = false;
    this.pendingSkill = false;
    this.projectiles = [];
    this.pauseRoot = undefined;

    this.physics.world.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setBackgroundColor(0x0b0914);
    syncSceneRenderScale(this);
    this.cameras.main.setRoundPixels(true);
    this.input.enabled = true;
    this.cameras.main.fadeIn(220, 8, 6, 14);

    this.drawFloor();
    this.buildWalls();

    const permanent = saveSystem.computePermanentStats();
    const classId = saveSystem.selectedClass;
    this.player = new Player(this, this.mapW / 2, this.mapH / 2, classId, permanent);

    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      this.onPlayerTouchEnemy(e as Enemy);
    });

    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);

    this.setupInput();
    this.hudRoot = this.add.container(0, 0).setScrollFactor(0).setDepth(490);
    this.events.on('render-scale-changed', this.syncHudScale, this);
    this.syncHudScale();
    this.virtual = new VirtualControls(this);

    this.createHud();
    this.addHudObjects([attachRunVignette(this), this.virtual.root]);
    if (isTouchLikeDevice()) this.virtual.show();
    this.spawnWave(6);
    this.showBanner(`${t('run_floor')} 1`, UI.teal);
    // Device already in portrait: start paused behind the rotate overlay.
    if (isPortraitBlocked()) this.pauseForPortrait();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  update(_time: number, delta: number): void {
    if (this.ended || !this.player) return;

    // ESC 由 setupInput 的 keydown 监听处理（见 onPauseKey），不再逐帧轮询。
    if (this.paused) return;

    this.timeAlive += delta / 1000;
    this.floorTimer += delta;
    this.spawnTimer += delta;

    this.readInput();
    this.player.updateEntity(delta);

    // Thorn skill: the player entity only raises the flag, the scene owns
    // the projectile list and fires the ring.
    if (this.player.pendingNova) {
      this.player.pendingNova = false;
      this.fireNova();
    }

    if (this.player.wantAttack) {
      this.tryPlayerAttack();
    }

    const list = this.enemies.getChildren() as Enemy[];
    for (const enemy of list) {
      if (!enemy.active || !enemy.isAlive) continue;
      const shot = enemy.updateAI(this.player, delta);
      if (shot) {
        this.spawnProjectile(enemy.x, enemy.y, shot.x, shot.y, enemy.damage, true, 220);
      }
    }

    this.updateProjectiles(delta);
    this.cleanupEnemies();

    const spawnInterval = Math.max(850, 2200 - this.floor * 120);
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      const count = 1 + Math.floor(this.floor / 2);
      this.spawnWave(count);
    }

    const killGoal = this.floor * 12;
    if (this.floorTimer >= FLOOR_DURATION_MS || this.floorKills >= killGoal) {
      this.advanceFloor();
    }

    this.updateHud();

    if (this.player.dead) {
      this.endRun(false);
    }
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.offKeyHandlers?.();
    kb.on('keydown-ESC', this.onPauseKey);
    kb.on('keydown-SHIFT', this.onDashKey);
    kb.on('keydown-Q', this.onSkillKey);
    this.offKeyHandlers = () => {
      kb.off('keydown-ESC', this.onPauseKey);
      kb.off('keydown-SHIFT', this.onDashKey);
      kb.off('keydown-Q', this.onSkillKey);
    };
  }

  /** ESC 暂停/继续。事件驱动，快速点按也不会被帧边界丢掉。 */
  private onPauseKey = (event: KeyboardEvent): void => {
    if (event?.repeat || this.ended) return;
    this.togglePause();
  };

  private onDashKey = (event: KeyboardEvent): void => {
    if (event?.repeat || this.ended || this.paused) return;
    this.pendingDash = true;
  };

  private onSkillKey = (event: KeyboardEvent): void => {
    if (event?.repeat || this.ended || this.paused) return;
    this.pendingSkill = true;
  };

  private readInput(): void {
    let mx = 0;
    let my = 0;

    if (this.keyA.isDown || this.cursors.left?.isDown) mx -= 1;
    if (this.keyD.isDown || this.cursors.right?.isDown) mx += 1;
    if (this.keyW.isDown || this.cursors.up?.isDown) my -= 1;
    if (this.keyS.isDown || this.cursors.down?.isDown) my += 1;

    const stick = this.virtual.moveVector;
    if (stick.lengthSq() > 0.01) {
      mx = stick.x;
      my = stick.y;
    }

    this.player.moveIntent.set(mx, my);

    const pointer = this.input.activePointer;
    if (pointer.wasTouch) {
      // Touch: dragging the attack button aims in any direction; a plain tap
      // aims along movement. (The pointer sits on the controls, so aiming at
      // it would fire at the player's own finger.)
      if (this.virtual.attackAim.lengthSq() > 0.01) {
        this.player.aimIntent.copy(this.virtual.attackAim);
      } else if (this.player.moveIntent.lengthSq() > 0.01) {
        this.player.aimIntent.copy(this.player.moveIntent);
      }
    } else {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y, this.aimPoint);
      const adx = world.x - this.player.x;
      const ady = world.y - this.player.y;
      if (Math.hypot(adx, ady) > 4) {
        this.player.aimIntent.set(adx, ady);
      } else if (this.player.moveIntent.lengthSq() > 0.01) {
        this.player.aimIntent.copy(this.player.moveIntent);
      }
    }

    this.player.wantAttack =
      (!pointer.wasTouch && pointer.leftButtonDown()) || this.keySpace.isDown || this.virtual.attackHeld;
    this.player.wantDash = this.pendingDash || this.virtual.dashPressed;
    this.player.wantSkill = this.pendingSkill || this.virtual.skillPressed;
    // 缓冲只消费一次：读到就清，避免下一帧重复触发。
    this.pendingDash = false;
    this.pendingSkill = false;

    this.virtual.consumePresses();
  }

  private tryPlayerAttack(): void {
    const atk = this.player.tryAttack();
    if (!atk) return;

    const def = CLASSES[this.player.classId];
    if (def.attackType === 'ranged') {
      const speed = def.projectileSpeed ?? 360;
      const rangePx = this.player.stats.attackRange;
      // Spawn ahead of the body so the shot never overlaps the shooter.
      const sx = atk.origin.x + atk.dir.x * 16;
      const sy = atk.origin.y + atk.dir.y * 16;
      this.spawnProjectile(
        sx,
        sy,
        atk.dir.x,
        atk.dir.y,
        atk.damage,
        false,
        speed,
        (rangePx / speed) * 1000,
        atk.crit,
      );
      const flash = this.add.image(sx, sy, 'proj_seed').setScale(2.5).setDepth(12).setAlpha(0.85);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.5,
        duration: 90,
        onComplete: () => flash.destroy(),
      });
      return;
    }

    const reach = this.player.stats.attackRange;
    const cx = this.player.x + atk.dir.x * reach * 0.55;
    const cy = this.player.y + atk.dir.y * reach * 0.55;

    const slash = this.add.sprite(cx, cy, `fx_slash_${this.player.classId}`, 0);
    slash.setDepth(12);
    slash.setScale(2);
    slash.setRotation(Math.atan2(atk.dir.y, atk.dir.x));
    slash.play(`fx_slash_${this.player.classId}_play`);
    slash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => slash.destroy());

    const list = this.enemies.getChildren() as Enemy[];
    for (const enemy of list) {
      if (!enemy.active || !enemy.isAlive) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + 12) continue;
      const ndx = dx / (dist || 1);
      const ndy = dy / (dist || 1);
      const dot = ndx * atk.dir.x + ndy * atk.dir.y;
      if (dot < 0.15) continue;

      this.hitEnemy(
        enemy,
        atk.damage,
        atk.dir.x,
        atk.dir.y,
        atk.crit,
        atk.crit ? 360 : 260,
        atk.crit ? 140 : 100,
      );
    }
  }

  /** Shared hit resolution for melee swings and player projectiles. */
  private hitEnemy(
    enemy: Enemy,
    damage: number,
    dirX: number,
    dirY: number,
    crit: boolean,
    knockForce: number,
    knockMs: number,
  ): void {
    const killed = enemy.takeDamage(damage);
    enemy.applyKnockback(dirX, dirY, knockForce, knockMs);
    this.damageDealt += damage;
    this.player.onHitEnemy(damage);

    this.floatText(
      enemy.x,
      enemy.y - 18,
      crit ? `${damage}!` : `${damage}`,
      crit ? '#ffd56a' : '#ffffff',
    );

    if (killed) {
      this.kills += 1;
      this.floorKills += 1;
      this.spawnEssenceFx(enemy.x, enemy.y);
      if (enemy.elite) {
        this.floatText(enemy.x, enemy.y - 36, t('run_elite'), '#ffc4a8');
        this.player.heal(Math.floor(this.player.stats.maxHp * 0.08));
      }
    }
  }

  /** Thorn skill: short-range 8-way ring for peeling mobs off the kiter. */
  private fireNova(): void {
    const def = CLASSES[this.player.classId];
    const speed = def.projectileSpeed ?? 360;
    const damage = Math.max(1, Math.floor(this.player.stats.damage * 0.7));
    const lifeMs = (160 / speed) * 1000;
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      this.spawnProjectile(
        this.player.x,
        this.player.y,
        Math.cos(angle),
        Math.sin(angle),
        damage,
        false,
        speed,
        lifeMs,
      );
    }
    const ring = this.add
      .sprite(this.player.x, this.player.y, 'fx_nova', 0)
      .setDepth(12)
      .setScale(2);
    ring.play('fx_nova_play');
    ring.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => ring.destroy());
    this.cameras.main.flash(90, 107, 203, 119);
  }

  /** Kill feedback only — essence is settled on death, nothing to pick up. */
  private spawnEssenceFx(x: number, y: number): void {
    const orb = this.add.sprite(x, y, 'icon_essence', 0).setScale(2).setDepth(11);
    if (this.anims.exists('icon_essence_spin')) orb.play('icon_essence_spin');
    this.tweens.add({
      targets: orb,
      y: y - 22,
      alpha: 0,
      duration: 480,
      onComplete: () => orb.destroy(),
    });
  }

  private onPlayerTouchEnemy(enemy: Enemy): void {
    if (!enemy.isAlive || this.player.dead) return;
    if (this.player.isDashing) return;
    // The hurt-invulnerability window inside applyDamage is the throttle —
    // a separate scene-level contact cooldown did the same job twice.
    if (this.player.isInvulnerable) return;
    const dealt = this.player.applyDamage(enemy.damage);
    if (dealt > 0) {
      this.cameras.main.shake(80, 0.004);
      this.floatText(this.player.x, this.player.y - 20, `-${dealt}`, '#ff6b6b');
    }
  }

  private aliveEnemyCount(): number {
    return (this.enemies.getChildren() as Enemy[]).filter((e) => e.active && e.isAlive).length;
  }

  private spawnWave(count: number): void {
    const room = Math.max(0, MAX_ENEMIES - this.aliveEnemyCount());
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const elite = this.floor >= 3 && Math.random() < 0.08 + this.floor * 0.01;
      const kind = this.pickEnemyKind();
      const pos = this.spawnPointAwayFromPlayer(220);
      if (!pos) break;
      const enemy = new Enemy(this, pos.x, pos.y, kind, this.floor, elite);
      this.enemies.add(enemy);
    }
  }

  private pickEnemyKind(): EnemyKind {
    const r = Math.random();
    if (this.floor >= 3 && r < 0.18) return 'brute';
    if (this.floor >= 2 && r < 0.45) return 'spitter';
    return 'crawler';
  }

  private spawnPointAwayFromPlayer(minDist: number): { x: number; y: number } | null {
    const clear = (x: number, y: number): boolean => {
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < minDist) return false;
      // 每侧预留一格，覆盖当前所有敌人（含精英）的物理体积及原点偏移。
      return this.walls.getChildren().every((wall) => {
        const body = wall.body as Phaser.Physics.Arcade.StaticBody;
        return x + TILE <= body.left || x - TILE >= body.right ||
          y + TILE <= body.top || y - TILE >= body.bottom;
      });
    };
    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.Between(TILE * 2, this.mapW - TILE * 2);
      const y = Phaser.Math.Between(TILE * 2, this.mapH - TILE * 2);
      // Never inside a pillar — physics would shove them out or wedge them in.
      if (this.pointInWall(x, y)) continue;
      // clear() 同时校验“离玩家足够远”和“与所有墙体 body 保持安全边距”。
      if (clear(x, y)) return { x, y };
    }
    // 随机重试失败仍只接受验证过的空地，无空地则跳过本次生成。
    for (let y = TILE * 2; y <= this.mapH - TILE * 2; y += TILE) {
      for (let x = TILE * 2; x <= this.mapW - TILE * 2; x += TILE) {
        if (clear(x, y)) return { x, y };
      }
    }
    return null;
  }

  private advanceFloor(): void {
    this.floor += 1;
    this.floorTimer = 0;
    this.floorKills = 0;
    this.spawnTimer = 0;
    this.player.heal(Math.floor(this.player.stats.maxHp * 0.2));
    this.showBanner(`${t('run_floor_up')} ${this.floor}`, UI.teal);
    this.cameras.main.flash(180, 40, 20, 70);
    this.cameras.main.shake(120, 0.003);
    if (this.groundImage) {
      const tint =
        this.floor >= 6 ? 0xb89ad8 : this.floor >= 4 ? 0xc4b5fd : 0xffffff;
      this.groundImage.setTint(tint);
    }
    this.spawnWave(4 + this.floor);
  }

  private spawnProjectile(
    x: number,
    y: number,
    dx: number,
    dy: number,
    damage: number,
    fromEnemy: boolean,
    speed: number,
    lifeMs = 2200,
    crit = false,
  ): void {
    const key = fromEnemy ? 'proj_ember' : 'proj_seed';
    const sprite = this.add.image(x, y, key).setScale(2).setDepth(11);
    sprite.setRotation(Math.atan2(dy, dx));
    this.projectiles.push({
      sprite,
      vx: dx * speed,
      vy: dy * speed,
      damage,
      life: lifeMs,
      fromEnemy,
      crit,
    });
  }

  private updateProjectiles(delta: number): void {
    const dt = delta / 1000;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= delta;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;

      let hit = false;
      if (p.fromEnemy && !this.player.dead) {
        const d = Phaser.Math.Distance.Between(
          p.sprite.x,
          p.sprite.y,
          this.player.x,
          this.player.y,
        );
        if (d < 18) {
          const dealt = this.player.applyDamage(p.damage);
          if (dealt > 0) {
            this.floatText(this.player.x, this.player.y - 20, `-${dealt}`, '#ff6b6b');
          }
          hit = true;
        }
      } else if (!p.fromEnemy) {
        for (const enemy of this.enemies.getChildren() as Enemy[]) {
          if (!enemy.active || !enemy.isAlive) continue;
          const d = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, enemy.x, enemy.y);
          if (d < 14) {
            const len = Math.hypot(p.vx, p.vy) || 1;
            // Light knockback only — melee-level shove would let a kiter
            // stunlock everything from safety.
            this.hitEnemy(enemy, p.damage, p.vx / len, p.vy / len, p.crit, 120, 60);
            hit = true;
            break;
          }
        }
      }

      if (
        p.life <= 0 ||
        hit ||
        // Spitters can no longer snipe through pillars.
        this.pointInWall(p.sprite.x, p.sprite.y) ||
        p.sprite.x < 0 ||
        p.sprite.y < 0 ||
        p.sprite.x > this.mapW ||
        p.sprite.y > this.mapH
      ) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private cleanupEnemies(): void {
    const list = this.enemies.getChildren() as Enemy[];
    for (const e of list) {
      // takeDamage() calls disableBody(true, true) which sets active=false,
      // so the old `!e.isAlive && e.active` guard never matched and corpses
      // piled up in the group for the whole run.
      if (!e.isAlive) e.destroy();
    }
  }

  private syncHudScale(): void {
    // 抵消中心缩放对固定 HUD 的平移，使设计坐标始终映射到同一屏幕位置。
    this.hudRoot.setPosition((this.scale.width - GAME_WIDTH) / 2, (this.scale.height - GAME_HEIGHT) / 2);
    this.cameras.main.centerOn(this.player.x, this.player.y);
  }

  private addHudObjects(objects: Phaser.GameObjects.GameObject[]): void {
    const fixScroll = (object: Phaser.GameObjects.GameObject): void => {
      const fixed = object as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor;
      fixed.setScrollFactor(0);
      if (object instanceof Phaser.GameObjects.Container) object.list.forEach(fixScroll);
    };
    objects.forEach(fixScroll);
    this.hudRoot.add(objects);
  }

  private createHud(): void {
    // HUD 整体挂在 hudRoot 里，由 syncHudScale 统一抵消相机缩放位移。
    const existing = new Set(this.children.list);
    const plate = this.add.graphics().setScrollFactor(0).setDepth(490);
    plate.fillStyle(0x0b0914, 0.55);
    plate.fillRoundedRect(8, 8, 320, 72, 6);
    plate.lineStyle(1, UI.stroke, 0.5);
    plate.strokeRoundedRect(8, 8, 320, 72, 6);

    const heart = this.add
      .image(18, 16, 'ui_heart')
      .setOrigin(0, 0)
      .setScale(2)
      .setScrollFactor(0)
      .setDepth(500);

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(500);
    this.cdBar = this.add.graphics().setScrollFactor(0).setDepth(500);
    this.progressBar = this.add.graphics().setScrollFactor(0).setDepth(500);

    this.hudText = this.add
      .text(18, 52, '', {
        fontSize: '12px',
        color: UI.textDim,
        fontFamily: UI_FONT,
      })
      .setScrollFactor(0)
      .setDepth(500);

    const rightPlate = this.add.graphics().setScrollFactor(0).setDepth(490);
    rightPlate.fillStyle(0x0b0914, 0.55);
    rightPlate.fillRoundedRect(GAME_WIDTH - 188, 8, 180, 44, 6);
    rightPlate.lineStyle(1, UI.stroke, 0.5);
    rightPlate.strokeRoundedRect(GAME_WIDTH - 188, 8, 180, 44, 6);

    this.floorText = this.add
      .text(GAME_WIDTH - 20, 14, '', {
        fontSize: '15px',
        color: '#c9b6ff',
        fontFamily: UI_FONT,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(500);

    const classLabel = this.add
      .text(
        16,
        GAME_HEIGHT - 22,
        `${i18n.className(saveSystem.selectedClass)} · ${t('run_stage')} ${saveSystem.seedStage}`,
        {
          fontSize: '12px',
          color: UI.textMute,
          fontFamily: UI_FONT,
        },
      )
      .setScrollFactor(0)
      .setDepth(500);

    this.bannerText = this.add
      .text(GAME_WIDTH / 2, 90, '', {
        fontSize: '28px',
        color: UI.text,
        fontFamily: UI_FONT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(520)
      .setAlpha(0);

    this.pauseButton = createTextButton(this, GAME_WIDTH - 62, 92, t('run_pause'), () => {
      if (!this.paused) this.togglePause();
    }, { width: 108, height: 48, fontSize: '14px', depth: 530 });
    this.addHudObjects(this.children.list.filter((object) => !existing.has(object)));
  }

  private updateHud(): void {
    const s = this.player.stats;
    const ratio = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1);

    this.hpBar.clear();
    this.hpBar.fillStyle(0x1a1424, 0.95);
    this.hpBar.fillRect(42, 18, 200, 14);
    this.hpBar.fillStyle(ratio > 0.35 ? UI.teal : UI.accentHot, 1);
    this.hpBar.fillRect(42, 18, Math.max(0, 200 * ratio), 14);
    this.hpBar.lineStyle(1, UI.stroke, 1);
    this.hpBar.strokeRect(42, 18, 200, 14);

    this.cdBar.clear();
    const cds = [
      { ready: this.player.attackReady, color: UI.accentHot, x: 42 },
      { ready: this.player.dashReady, color: UI.teal, x: 112 },
      { ready: this.player.skillReady, color: UI.accent, x: 182 },
    ];
    for (const c of cds) {
      this.cdBar.fillStyle(c.ready ? c.color : 0x2a2340, c.ready ? 0.95 : 0.7);
      this.cdBar.fillRect(c.x, 36, 60, 5);
    }

    // Floor progress (time or kills, whichever is higher)
    const killGoal = Math.max(1, this.floor * 12);
    const byTime = this.floorTimer / FLOOR_DURATION_MS;
    const byKill = this.floorKills / killGoal;
    const prog = Phaser.Math.Clamp(Math.max(byTime, byKill), 0, 1);
    this.progressBar.clear();
    this.progressBar.fillStyle(0x1a1424, 0.9);
    this.progressBar.fillRect(GAME_WIDTH - 176, 36, 156, 6);
    this.progressBar.fillStyle(UI.accent, 0.95);
    this.progressBar.fillRect(GAME_WIDTH - 176, 36, 156 * prog, 6);

    const ready = t('run_ready');
    const cool = '..';
    // setText forces a full texture re-upload — only touch it on change.
    const line = `${t('menu_hp')} ${Math.ceil(s.hp)}/${s.maxHp}   ${t('run_kills')} ${this.kills}   ${t('run_atk')} ${
      this.player.attackReady ? ready : cool
    }  ${t('run_dash')} ${this.player.dashReady ? ready : cool}  ${t('run_skill')} ${
      this.player.skillReady ? ready : cool
    }`;
    if (line !== this.lastHudLine) {
      this.lastHudLine = line;
      this.hudText.setText(line);
    }
    const floorLine = `${t('run_floor')} ${this.floor}`;
    if (floorLine !== this.lastFloorLine) {
      this.lastFloorLine = floorLine;
      this.floorText.setText(floorLine);
    }
  }

  private showBanner(msg: string, color: number): void {
    const hex = '#' + color.toString(16).padStart(6, '0');
    this.bannerText.setText(msg);
    this.bannerText.setColor(hex);
    this.bannerText.setAlpha(0);
    this.bannerText.setScale(0.85);
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 1,
      scale: 1,
      duration: 220,
      hold: 700,
      onComplete: () => {
        this.tweens.add({
          targets: this.bannerText,
          alpha: 0,
          duration: 280,
        });
      },
    });
  }

  private floatText(x: number, y: number, msg: string, color: string): void {
    const label = this.add
      .text(x, y, msg, {
        fontSize: '12px',
        color,
        fontFamily: UI_FONT,
      })
      .setOrigin(0.5)
      .setDepth(200);
    this.tweens.add({
      targets: label,
      y: y - 28,
      alpha: 0,
      duration: 500,
      onComplete: () => label.destroy(),
    });
  }

  private togglePause(): void {
    if (this.ended || (this.paused && isPortraitBlocked())) return;
    this.paused = !this.paused;
    this.pauseButton.setVisible(!this.paused);
    if (this.paused) {
      this.physics.world.pause();
      // Avoid anims.pauseAll() — global and can break later scenes/UI.
      this.player.setVelocity(0, 0);
      this.setActorsAnimsPaused(true);
      this.virtualVisibleBeforePause = this.virtual?.isVisible ?? false;
      this.virtual?.setSuspended(true);
      this.buildPauseMenu();
    } else {
      this.physics.world.resume();
      this.setActorsAnimsPaused(false);
      this.destroyPauseMenu();
      this.input.enabled = true;
      this.pausedByPortrait = false;
      this.virtual?.setSuspended(false);
      // Restore touch controls as they were — previously they stayed hidden
      // after unpausing until the next touch.
      if (this.virtualVisibleBeforePause) this.virtual?.show();
    }
  }

  /** Freeze walk cycles while paused (per-sprite, never the global manager). */
  private setActorsAnimsPaused(flag: boolean): void {
    if (this.player) {
      if (flag) this.player.anims.pause();
      else this.player.anims.resume();
    }
    for (const e of this.enemies.getChildren() as Enemy[]) {
      if (!e.active) continue;
      if (flag) e.anims.pause();
      else e.anims.resume();
    }
  }

  /** Auto-pause when a touch device rotates to portrait (DOM overlay covers the game). */
  pauseForPortrait(): void {
    if (this.ended || this.paused) return;
    this.pausedByPortrait = true;
    this.togglePause();
  }

  /** Undo pauseForPortrait — never touches a pause the user asked for. */
  resumeFromPortrait(): void {
    if (!this.pausedByPortrait) return;
    this.pausedByPortrait = false;
    if (this.paused) this.togglePause();
  }

  private destroyPauseMenu(): void {
    const extra = this.pauseRoot?.getData('extra') as Phaser.GameObjects.GameObject[] | undefined;
    extra?.forEach((o) => {
      try {
        o.destroy();
      } catch {
        /* ignore */
      }
    });
    this.pauseRoot?.destroy(true);
    this.pauseRoot = undefined;
  }

  private buildPauseMenu(): void {
    this.destroyPauseMenu();

    // Visual root only — buttons stay top-level for reliable hit testing.
    const root = this.add.container(0, 0).setScrollFactor(0).setDepth(900);

    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05040a, 0.72)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive(); // block world clicks while paused

    const panel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 220, 0x14101f, 0.96)
      .setScrollFactor(0)
      .setDepth(901)
      .setStrokeStyle(1, UI.strokeBright, 0.8);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, t('run_paused'), {
        fontSize: '26px',
        color: UI.text,
        fontFamily: UI_FONT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(902);

    root.add([dim, panel, title]);

    const resume = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 10,
      t('run_resume'),
      () => this.togglePause(),
      { width: 220, height: 42, color: 0x1f2d3d, stroke: UI.teal, depth: 920 },
    );
    resume.setScrollFactor(0, 0, true);

    const quit = createTextButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 66,
      t('run_quit'),
      () => {
        this.paused = false;
        this.physics.world.resume();
        this.destroyPauseMenu();
        this.endRun(true);
      },
      { width: 220, height: 42, color: 0x3a1a22, stroke: UI.accentHot, depth: 920 },
    );
    quit.setScrollFactor(0, 0, true);
    this.addHudObjects([root, resume, quit]);

    root.setData('extra', [resume, quit]);
    this.pauseRoot = root;
  }

  private drawFloor(): void {
    // Ground AND wall visuals baked into one texture — thousands of tile
    // Images become a single draw. Baked once per boot (tile art never
    // changes between runs), scene restarts just reuse it.
    const key = 'run_ground_baked';
    if (!this.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = this.mapW;
      canvas.height = this.mapH;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      for (let ty = 0; ty < this.mapRows; ty++) {
        for (let tx = 0; tx < this.mapCols; tx++) {
          const variant = (tx * 3 + ty * 7) % 4;
          const src = this.textures.get(`tile_floor_${variant}`).getSourceImage() as
            | HTMLCanvasElement
            | HTMLImageElement;
          ctx.drawImage(src, 0, 0, 16, 16, tx * TILE, ty * TILE, TILE, TILE);
          if ((tx + ty) % 17 === 0) {
            ctx.fillStyle = 'rgba(196, 181, 253, 0.18)';
            ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
          }
        }
      }

      const wallSrc = this.textures.get('tile_wall').getSourceImage() as
        | HTMLCanvasElement
        | HTMLImageElement;
      for (const [tx, ty, w, h] of this.getWallBlocks()) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            ctx.drawImage(wallSrc, 0, 0, 16, 16, (tx + x) * TILE, (ty + y) * TILE, TILE, TILE);
          }
        }
      }

      this.textures.addCanvas(key, canvas);
    }
    this.groundImage = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  /** Wall layout in tile units [tx, ty, w, h]: border ring + inner pillars. */
  private getWallBlocks(): Array<readonly [number, number, number, number]> {
    return [
      [0, 0, this.mapCols, 1],
      [0, this.mapRows - 1, this.mapCols, 1],
      [0, 0, 1, this.mapRows],
      [this.mapCols - 1, 0, 1, this.mapRows],
      ...PILLARS,
    ];
  }

  private buildWalls(): void {
    this.walls = this.physics.add.staticGroup();
    this.wallRects = [];
    // Physics only — the visuals are baked into the ground texture above.
    for (const [tx, ty, wTiles, hTiles] of this.getWallBlocks()) {
      const w = wTiles * TILE;
      const h = hTiles * TILE;
      const body = this.add.rectangle(tx * TILE + w / 2, ty * TILE + h / 2, w, h, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.walls.add(body);
      this.wallRects.push(new Phaser.Geom.Rectangle(tx * TILE, ty * TILE, w, h));
    }
  }

  private pointInWall(x: number, y: number): boolean {
    for (const rect of this.wallRects) {
      if (rect.contains(x, y)) return true;
    }
    return false;
  }

  private endRun(abandoned: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.paused = false;

    try {
      this.physics.world.resume();
    } catch {
      /* ignore */
    }
    this.destroyPauseMenu();
    this.virtual?.setSuspended(true);
    this.pauseButton.setVisible(false);
    this.input.enabled = false;

    runState.deathSettled = false;
    runState.lastRun = {
      floor: this.floor,
      kills: this.kills,
      timeAliveSec: this.timeAlive,
      damageDealt: this.damageDealt,
      classId: this.player.classId,
    };

    if (abandoned) {
      // Manual quit — skip the death ceremony, settle fast.
      this.cameras.main.fadeOut(250, 8, 4, 12);
      this.time.delayedCall(300, () => this.scene.start('Death'));
    } else {
      this.showBanner(t('death_title'), UI.accentHot);
      this.cameras.main.fadeOut(500, 8, 4, 12);
      this.time.delayedCall(650, () => this.scene.start('Death'));
    }
  }

  private shutdown(): void {
    this.events.off('render-scale-changed', this.syncHudScale, this);
    // 场景每局重启都会重新 setupInput，这里解绑，避免监听叠加。
    this.offKeyHandlers?.();
    this.offKeyHandlers = undefined;
    this.pendingDash = false;
    this.pendingSkill = false;
    try {
      this.physics.world.resume();
    } catch {
      /* ignore */
    }
    this.input.enabled = true;
    this.destroyPauseMenu();
  }
}
