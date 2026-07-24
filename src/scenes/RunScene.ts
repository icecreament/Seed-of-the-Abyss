import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { Player } from '../entities/Player';
import { Enemy, type EnemyKind } from '../entities/Enemy';
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
}

const TILE = 32;
const MAX_ENEMIES = 28;
const FLOOR_DURATION_MS = 45000;

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
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  private floor = 1;
  private kills = 0;
  private floorKills = 0;
  private damageDealt = 0;
  private timeAlive = 0;
  private spawnTimer = 0;
  private floorTimer = 0;
  private ended = false;
  private paused = false;
  private contactCd = 0;

  private hpBar!: Phaser.GameObjects.Graphics;
  private cdBar!: Phaser.GameObjects.Graphics;
  private progressBar!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private pauseRoot?: Phaser.GameObjects.Container;
  private projectiles: Projectile[] = [];
  private groundImage?: Phaser.GameObjects.Image;

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
    this.contactCd = 0;
    this.projectiles = [];
    this.pauseRoot = undefined;

    this.physics.world.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setBackgroundColor(0x0b0914);
    this.cameras.main.setZoom(1);
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
    this.virtual = new VirtualControls(this);

    this.createHud();
    attachRunVignette(this);
    this.spawnWave(6);
    this.showBanner(`${t('run_floor')} 1`, UI.teal);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  update(_time: number, delta: number): void {
    if (this.ended || !this.player) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.togglePause();
    }
    if (this.paused) return;

    this.timeAlive += delta / 1000;
    this.floorTimer += delta;
    this.spawnTimer += delta;
    this.contactCd = Math.max(0, this.contactCd - delta);

    this.readInput();
    this.player.update(delta);

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
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyQ = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

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
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const adx = world.x - this.player.x;
    const ady = world.y - this.player.y;
    if (Math.hypot(adx, ady) > 4) {
      this.player.aimIntent.set(adx, ady);
    } else if (this.player.moveIntent.lengthSq() > 0.01) {
      this.player.aimIntent.copy(this.player.moveIntent);
    }

    this.player.wantAttack =
      pointer.leftButtonDown() || this.keySpace.isDown || this.virtual.attackHeld;
    this.player.wantDash =
      Phaser.Input.Keyboard.JustDown(this.keyShift) || this.virtual.dashPressed;
    this.player.wantSkill =
      Phaser.Input.Keyboard.JustDown(this.keyQ) || this.virtual.skillPressed;

    this.virtual.consumePresses();
  }

  private tryPlayerAttack(): void {
    const atk = this.player.tryAttack();
    if (!atk) return;

    const reach = this.player.stats.attackRange;
    const cx = this.player.x + atk.dir.x * reach * 0.55;
    const cy = this.player.y + atk.dir.y * reach * 0.55;

    const slash = this.add.sprite(cx, cy, 'fx_slash', 0);
    slash.setDepth(12);
    slash.setScale(2);
    slash.setRotation(Math.atan2(atk.dir.y, atk.dir.x));
    slash.play('fx_slash_play');
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

      const killed = enemy.takeDamage(atk.damage);
      enemy.applyKnockback(atk.dir.x, atk.dir.y, atk.crit ? 360 : 260, atk.crit ? 140 : 100);
      this.damageDealt += atk.damage;
      this.player.onHitEnemy(atk.damage);

      this.floatText(
        enemy.x,
        enemy.y - 18,
        atk.crit ? `${atk.damage}!` : `${atk.damage}`,
        atk.crit ? '#ffd56a' : '#ffffff',
      );

      if (killed) {
        this.kills += 1;
        this.floorKills += 1;
        this.spawnEssencePickup(enemy.x, enemy.y);
        if (enemy.elite) {
          this.floatText(enemy.x, enemy.y - 36, t('run_elite'), '#ffc4a8');
          this.player.heal(Math.floor(this.player.stats.maxHp * 0.08));
        }
      }
    }
  }

  private spawnEssencePickup(x: number, y: number): void {
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
    if (this.contactCd > 0) return;
    if (!this.player.isInvulnerable) {
      const dealt = this.player.applyDamage(enemy.damage);
      if (dealt > 0) {
        this.contactCd = 280;
        this.cameras.main.shake(80, 0.004);
        this.floatText(this.player.x, this.player.y - 20, `-${dealt}`, '#ff6b6b');
      }
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

  private spawnPointAwayFromPlayer(minDist: number): { x: number; y: number } {
    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.Between(TILE * 2, this.mapW - TILE * 2);
      const y = Phaser.Math.Between(TILE * 2, this.mapH - TILE * 2);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= minDist) {
        return { x, y };
      }
    }
    return {
      x: Phaser.Math.Between(TILE * 2, this.mapW - TILE * 2),
      y: Phaser.Math.Between(TILE * 2, this.mapH - TILE * 2),
    };
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
  ): void {
    const key = fromEnemy ? 'proj_ember' : 'proj_seed';
    const sprite = this.add.image(x, y, key).setScale(3).setDepth(11);
    sprite.setRotation(Math.atan2(dy, dx));
    this.projectiles.push({
      sprite,
      vx: dx * speed,
      vy: dy * speed,
      damage,
      life: 2200,
      fromEnemy,
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
      }

      if (
        p.life <= 0 ||
        hit ||
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
      if (!e.isAlive && e.active) e.destroy();
    }
  }

  private createHud(): void {
    const plate = this.add.graphics().setScrollFactor(0).setDepth(490);
    plate.fillStyle(0x0b0914, 0.55);
    plate.fillRoundedRect(8, 8, 320, 72, 6);
    plate.lineStyle(1, UI.stroke, 0.5);
    plate.strokeRoundedRect(8, 8, 320, 72, 6);

    this.add
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

    this.add
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
    this.hudText.setText(
      `${t('menu_hp')} ${Math.ceil(s.hp)}/${s.maxHp}   ${t('run_kills')} ${this.kills}   ${t('run_atk')} ${
        this.player.attackReady ? ready : cool
      }  ${t('run_dash')} ${this.player.dashReady ? ready : cool}  ${t('run_skill')} ${
        this.player.skillReady ? ready : cool
      }`,
    );
    this.floorText.setText(`${t('run_floor')} ${this.floor}`);
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
    if (this.ended) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause();
      // Avoid anims.pauseAll() — global and can break later scenes/UI.
      this.player.setVelocity(0, 0);
      this.virtual?.hide();
      this.buildPauseMenu();
    } else {
      this.physics.world.resume();
      this.destroyPauseMenu();
      this.input.enabled = true;
    }
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
    resume.setScrollFactor(0);

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
    quit.setScrollFactor(0);

    root.setData('extra', [resume, quit]);
    this.pauseRoot = root;
  }

  private drawFloor(): void {
    // Single baked ground texture instead of ~2k Image objects.
    const key = 'run_ground_baked';
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }

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

    this.textures.addCanvas(key, canvas);
    this.groundImage = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  private buildWalls(): void {
    this.walls = this.physics.add.staticGroup();

    const placeWallBlock = (cx: number, cy: number, wTiles: number, hTiles: number) => {
      const w = wTiles * TILE;
      const h = hTiles * TILE;
      for (let ty = 0; ty < hTiles; ty++) {
        for (let tx = 0; tx < wTiles; tx++) {
          this.add
            .image(
              cx - w / 2 + tx * TILE + TILE / 2,
              cy - h / 2 + ty * TILE + TILE / 2,
              'tile_wall',
            )
            .setScale(2)
            .setDepth(2);
        }
      }
      const body = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.walls.add(body);
    };

    placeWallBlock(this.mapW / 2, TILE / 2, this.mapCols, 1);
    placeWallBlock(this.mapW / 2, this.mapH - TILE / 2, this.mapCols, 1);
    placeWallBlock(TILE / 2, this.mapH / 2, 1, this.mapRows);
    placeWallBlock(this.mapW - TILE / 2, this.mapH / 2, 1, this.mapRows);

    const pillars: Array<[number, number, number, number]> = [
      [10, 8, 3, 6],
      [22, 18, 5, 2],
      [34, 7, 3, 7],
      [15, 24, 6, 2],
      [30, 22, 2, 5],
      [8, 16, 2, 4],
      [40, 14, 4, 3],
      [26, 10, 2, 2],
    ];
    for (const [tx, ty, w, h] of pillars) {
      placeWallBlock(tx * TILE + (w * TILE) / 2, ty * TILE + (h * TILE) / 2, w, h);
    }
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
    this.virtual?.hide();
    this.input.enabled = false;

    runState.deathSettled = false;
    runState.lastRun = {
      floor: this.floor,
      kills: this.kills,
      timeAliveSec: this.timeAlive,
      damageDealt: this.damageDealt,
      classId: this.player.classId,
    };
    void abandoned;

    this.showBanner(t('death_title'), UI.accentHot);
    this.cameras.main.fadeOut(500, 8, 4, 12);
    this.time.delayedCall(650, () => {
      this.scene.start('Death');
    });
  }

  private shutdown(): void {
    try {
      this.physics.world.resume();
    } catch {
      /* ignore */
    }
    this.input.enabled = true;
    this.destroyPauseMenu();
  }
}
