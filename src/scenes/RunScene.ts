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
import { ChapterBoss } from '../entities/ChapterBoss';
import { CombatAudio } from '../systems/CombatAudio';
import { KillChain, PLAYER_PROJECTILE_RADIUS, meleeArcContains, segmentCircleEntry, segmentRectEntry } from '../systems/CombatFeel';
import { RANGED_WINDUP_MS, RANGED_SHOT_SPEED, RANGED_SHOT_LIFETIME } from '../systems/RangedTell';
import { WARDEN_BULWARK_RADIUS } from '../systems/WardenReprisal';
import { WardenRootlines, type RootlineWave } from '../systems/WardenRootline';
import { GUARD_OPPORTUNITY, findGuardOpportunity, type GuardOpportunity, type GuardSource } from '../systems/GuardOpportunity';
import { BLOODBRAND, remainingBleedPulses, cashedBleedDamage } from '../systems/Bloodbrand';
import { BloodbrandFocus } from '../systems/BloodbrandFocus';
import { findRelayTarget, relayPulses, relayDuration, relayDebtPriority, relayMarkLayout, findMeleeDebtTarget } from '../systems/ReaverRelay';
import { THORN_BLOOM, bloomSummary, seedMarkLayout } from '../systems/ThornBloom';
import { findGraftTarget } from '../systems/ThornGraft';
import { thornBloomCue, type ThornBloomCue } from '../systems/ThornBloomCue';
import { pursuitTravel, pursuitCueStage, type PursuitCueStage } from '../systems/ReaverPursuit';
import { ArenaNavigation } from '../systems/ArenaNavigation';
import { CombatPresentation } from '../ui/CombatPresentation';
import { CombatTextPresentation } from '../ui/CombatTextPresentation';
import type { CombatTextKind } from '../systems/CombatText';
import { CombatHudFocus, projectCombatRect, type FocusRect, type PeekLayer } from '../ui/CombatHudFocus';
import { RunBuild, MUTATIONS, mutationName, mutationDescription, type Mutation } from '../systems/RunBuild';
import { CLASSES } from '../data/classes';
import { AWAKENINGS, isAwakened, portraitKey } from '../data/awakenings';
import { VirtualControls } from '../input/VirtualControls';
import { InputEdgeGuard } from '../input/InputEdgeGuard';
import { WorldPointerAttack } from '../input/WorldPointerAttack';
import { AmbushInputOrder } from '../input/AmbushInputOrder';
import { i18n, t } from '../i18n/i18n';
import { saveSystem } from '../systems/SaveSystem';
import { runState } from '../systems/RunState';
import { attachRunVignette } from '../ui/SceneDecor';
import { UI, UI_FONT } from '../ui/theme';
import { createTextButton } from '../ui/TextButton';
import { drawRootFrame, drawAbilityGlyph, drawBloomGlyph } from '../ui/RootFrame';

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  fromEnemy: boolean;
  crit: boolean;
  basic: boolean;
}

const TILE = 32;
const MAX_ENEMIES = 28;
const FLOOR_DURATION_MS = 45000;
const SHADE_SHATTER_RADIUS = 110;

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
  private hudFocus = new CombatHudFocus();
  private abilityShade!: Phaser.GameObjects.Graphics;
  private combat?: CombatPresentation;
  private combatText?: CombatTextPresentation;
  private audio?: CombatAudio;
  private navigation?: ArenaNavigation;
  private chain = new KillChain();
  private chainText?: Phaser.GameObjects.Text;
  private pursuitText?: Phaser.GameObjects.Text;
  private chainBar?: Phaser.GameObjects.Graphics;
  private soundButton?: Phaser.GameObjects.Container;
  private soundButtonText?: Phaser.GameObjects.Text;
  private hitStopMs = 0;
  private hitStopCooldown = 0;
  private pendingAttack = false;
  private readonly ambushInputs = new AmbushInputOrder();
  private orderedAmbushDash = false;
  // Keep identities across Run restarts; queued events from an old run are not new presses.
  private readonly keyEdges = new InputEdgeGuard();
  private readonly worldAttack = new WorldPointerAttack();

  private build?: RunBuild;
  private boss?: ChapterBoss;
  private choosing = false;
  private choiceRoot?: Phaser.GameObjects.Container;
  private choices: Mutation[] = [];
  private offChoiceKey?: () => void;
  private buildText?: Phaser.GameObjects.Text;
  private heroPortrait!: Phaser.GameObjects.Image;
  private awakeningText!: Phaser.GameObjects.Text;
  private bossText?: Phaser.GameObjects.Text;
  private bossCueText?: Phaser.GameObjects.Text;
  private bossBar?: Phaser.GameObjects.Graphics;
  private marksInk?: Phaser.GameObjects.Graphics;
  private marks = new Map<Enemy, { seeds: number; bleed: number; tick: number; relay?: true }>();
  private attackCount = 0;
  private pursuitBrand?: { target: Enemy; pulses: number };
  private readonly bloodFocus = new BloodbrandFocus();
  private pursuitCue?: { target: Enemy; travel: number; pulses: number; stage: PursuitCueStage };
  private meleeDebtCue?: { target: Enemy; pulses: number; stage: PursuitCueStage };
  private guardCue?: GuardOpportunity & {stage:'ready'|'hold'};
  private ramReady = false;
  private dashBurstPending = false;
  private thornPulse = 0;
  private spiteCooldown = 0;
  private rangedStats = {starts:0,shots:0,interrupted:0,cancelled:0,killedWindups:0,peakWinding:0};
  private eliteIntroduced = false;
  private eliteStats = {windups:0,breaks:0,slams:0,avoided:0,damage:0};
  private decoy?: { x: number; y: number; life: number };

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
  private killsText!: Phaser.GameObjects.Text;
  private elapsedText!: Phaser.GameObjects.Text;
  private floorProgressText!: Phaser.GameObjects.Text;
  private abilityRoot!: Phaser.GameObjects.Container;
  private identityRoot!: Phaser.GameObjects.Container;
  private abilityTexts: Phaser.GameObjects.Text[] = [];
  private abilityNames: Phaser.GameObjects.Text[] = [];
  private abilityGlyphs!: Phaser.GameObjects.Graphics;
  private bloomGlyphKey = '';
  private hpTrail = 1;
  private bannerText!: Phaser.GameObjects.Text;
  private pauseRoot?: Phaser.GameObjects.Container;
  private hudRoot!: Phaser.GameObjects.Container;
  private pauseButton!: Phaser.GameObjects.Container;
  private projectiles: Projectile[] = [];
  private readonly rootlines = new WardenRootlines<Enemy>();
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
    this.hudFocus = new CombatHudFocus();
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
    this.rootlines.clear();
    this.pauseRoot = undefined;
    this.choosing = false;
    this.choiceRoot = undefined;
    this.choices = [];
    this.boss = undefined;
    this.marks = new Map();
    this.attackCount = 0;
    this.pursuitBrand=undefined;this.bloodFocus.clear();
    this.pursuitCue=undefined;this.meleeDebtCue=undefined;this.guardCue=undefined;
    this.ramReady = false;
    this.dashBurstPending = false;
    this.thornPulse = 0;
    this.spiteCooldown = 0;
    this.rangedStats = {starts:0,shots:0,interrupted:0,cancelled:0,killedWindups:0,peakWinding:0};
    this.eliteIntroduced = false;
    this.eliteStats = {windups:0,breaks:0,slams:0,avoided:0,damage:0};
    this.decoy = undefined;
    this.chain = new KillChain();
    this.hitStopMs = this.hitStopCooldown = 0;
    this.pendingAttack = false;this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;

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

    this.build = new RunBuild(classId);
    this.combat = new CombatPresentation(this,()=>saveSystem.feedback.impactMotion &&
      !(typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
    this.combatText?.destroy();
    this.combatText = new CombatTextPresentation(this,()=>saveSystem.feedback.impactMotion &&
      !(typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
    this.audio = new CombatAudio(()=>saveSystem.feedback.sfxVolume);
    this.marksInk = this.add.graphics().setDepth(14);

    this.enemies = this.physics.add.group({ runChildUpdate: false, createCallback: child=>{
      // Arcade Group.add reapplies enable=true; restore the emergence grace after its defaults.
      const enemy=child as Enemy;
      if(enemy.body)enemy.body.enable=enemy.isTargetable;
    } });
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
    this.virtual = new VirtualControls(this,(action,time)=>this.ambushInputs.record(action,time));

    this.createHud();
    this.createChapterHud();
    this.addHudObjects([attachRunVignette(this), this.virtual.root]);
    if (isTouchLikeDevice()) this.virtual.show();
    this.spawnWave(8);
    this.showBanner(`${t('run_floor')} 1`, UI.teal);
    // Device already in portrait: start paused behind the rotate overlay.
    if (isPortraitBlocked()) this.pauseForPortrait();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  update(_time: number, delta: number): void {
    if (!this.player) return;
    this.updateHudFocus(delta);
    if (this.ended) { this.combat?.update(delta,this.player,false); this.combatText?.update(delta); return; }

    // ESC 由 setupInput 的 keydown 监听处理（见 onPauseKey），不再逐帧轮询。
    if (this.paused || this.choosing) return;
    // Own the freeze explicitly: no delayed resume can accidentally unpause a menu.
    this.hitStopCooldown=Math.max(0,this.hitStopCooldown-delta);
    if(this.hitStopMs>0){
      const consumed=Math.min(delta,this.hitStopMs);this.hitStopMs-=consumed;delta-=consumed;
      if(this.hitStopMs>0)return;
      this.physics.world.resume();this.setActorsAnimsPaused(false);
      if(delta<=0)return;
    }
    this.chain.update(delta);

    this.timeAlive += delta / 1000;
    this.bloodFocus.update(delta);
    this.floorTimer += delta;
    this.spawnTimer += delta;

    this.readInput(delta);
    const finishAmbushDash = this.player.updateEntity(delta,this.orderedAmbushDash);
    // A lethal physics contact wins over queued skill/mutation procs in this frame.
    if (this.player.dead) { this.endRun(false); return; }
    if (!this.player.isPursuing && this.pursuitBrand) {
      this.bloodFocus.resolve('cancelled');this.pursuitBrand=undefined;
    }
    this.consumeCombatEvents();
    this.combat?.setRequiemProgress(this.build?.has('reaver_cleave') ? this.attackCount%3 : null);
    this.combat?.update(delta, this.player);
    this.combatText?.update(delta);
    this.updateMutations(delta);
    if (this.ended) return;

    // Thorn skill: the player entity only raises the flag, the scene owns
    // the projectile list and fires the ring.
    if (this.player.pendingNova) {
      this.player.pendingNova = false;
      this.fireNova();
    }

    const pursuitStrike=this.player.consumePursuitStrike();
    if (pursuitStrike) this.tryPlayerAttack(false,pursuitStrike);
    if (this.player.wantAttack || this.player.hasBufferedAttack) {
      this.tryPlayerAttack(!this.player.hasBufferedAttack);
    }

    if (finishAmbushDash && !this.ended) {
      this.player.resolveBufferedDash();
      this.consumeCombatEvents();
      // The hit may have paused actors before the buffered dash changed their animation.
      if (this.hitStopMs>0) this.setActorsAnimsPaused(true);
    }

    if (this.ended) return;
    const list = this.enemies.getChildren() as Enemy[];
    for (const enemy of list) {
      if (!enemy.active || !enemy.isAlive) continue;
      const target = this.decoy && !(enemy instanceof ChapterBoss)
        ? { x: this.decoy.x, y: this.decoy.y, dead: false, isStealthed: false } : this.player;
      const route=enemy instanceof ChapterBoss?undefined:this.navigation?.waypoint(enemy.x,enemy.y,target.x,target.y);
      const shot = enemy.updateAI(target, delta, route, this.navigation?.clearLine(enemy.x,enemy.y,target.x,target.y)??true);
      this.consumeEliteEvents(enemy);
      this.consumeRangedEvents(enemy);
      if(this.player.dead){this.endRun(false);return;}
      if (shot) {
        this.spawnProjectile(shot.origin?.x??enemy.x, shot.origin?.y??enemy.y, shot.x, shot.y, enemy.damage, true, RANGED_SHOT_SPEED, RANGED_SHOT_LIFETIME);
      }
    }

    this.updateProjectiles(delta);
    this.updateRootlines(delta);
    this.cleanupEnemies();
    if (this.ended) return;

    const spawnInterval = Math.max(1100, 1800 - this.floor * 110);
    if (!this.boss && this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      const count = 1 + Math.floor(this.floor / 2);
      this.spawnWave(count);
    }

    const killGoal = this.floor * 12;
    if (!this.boss && !this.player.dead && (this.floorTimer >= FLOOR_DURATION_MS || this.floorKills >= killGoal)) {
      this.advanceFloor();
    }

    this.updateHud(delta);

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
    kb.on('keydown-SPACE',this.onAttackKey);
    kb.on('keydown-M',this.onSoundKey);
    this.input.on('pointerdown',this.onAttackPointer);
    this.input.on('pointerup',this.onAttackRelease);
    this.input.on('pointerupoutside',this.onAttackRelease);
    this.game.events.on(Phaser.Core.Events.BLUR,this.onPointerFocusLost);
    this.game.events.on(Phaser.Core.Events.HIDDEN,this.onPointerFocusLost);
    this.offKeyHandlers = () => {
      kb.off('keydown-ESC', this.onPauseKey);
      kb.off('keydown-SHIFT', this.onDashKey);
      kb.off('keydown-Q', this.onSkillKey);
      kb.off('keydown-SPACE',this.onAttackKey);
      kb.off('keydown-M',this.onSoundKey);
      this.input.off('pointerdown',this.onAttackPointer);
      this.input.off('pointerup',this.onAttackRelease);
      this.input.off('pointerupoutside',this.onAttackRelease);
      this.game.events.off(Phaser.Core.Events.BLUR,this.onPointerFocusLost);
      this.game.events.off(Phaser.Core.Events.HIDDEN,this.onPointerFocusLost);
    };
  }

  /** ESC 暂停/继续。事件驱动，快速点按也不会被帧边界丢掉。 */
  private onPauseKey = (event: KeyboardEvent): void => {
    if (!this.keyEdges.accept(event) || this.ended) return;
    this.togglePause();
  };

  private onDashKey = (event: KeyboardEvent): void => {
    if (!this.keyEdges.accept(event) || this.ended || this.paused || this.choosing) return;
    this.pendingDash = true;
    this.ambushInputs.record('dash',event.timeStamp);
  };

  private onSkillKey = (event: KeyboardEvent): void => {
    if (!this.keyEdges.accept(event) || this.ended || this.paused || this.choosing) return;
    this.pendingSkill = true;
    this.ambushInputs.record('skill',event.timeStamp);
  };

  private onAttackKey = (event:KeyboardEvent):void => {
    // OS key-repeat is still a hold, not a fresh deliberate stealth break.
    if(this.keyEdges.accept(event)&&!event.repeat&&!this.ended&&!this.paused&&!this.choosing) {
      this.pendingAttack=true;
      this.ambushInputs.record('attack',event.timeStamp);
    }
  };
  private onAttackPointer = (pointer:Phaser.Input.Pointer):void => {
    // TextButton stops propagation on UI down. Only a world-origin press earns hold.
    if(!pointer.wasTouch&&pointer.button===0&&!this.ended&&!this.paused&&!this.choosing) {
      this.worldAttack.press(pointer.id);
      this.pendingAttack=true;
      this.ambushInputs.record('attack',pointer.event?.timeStamp);
    }
  };
  private onAttackRelease = (pointer:Phaser.Input.Pointer):void => {
    // Releasing RMB or another finger must not cancel a still-held LMB gesture.
    if(!pointer.wasTouch&&!pointer.leftButtonDown())this.worldAttack.release(pointer.id);
  };
  private onPointerFocusLost = ():void => {
    this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;this.pendingAttack=false;
    if(this.player){this.player.wantAttack=false;this.player.clearActionBuffers();}
  };
  private onSoundKey = (event:KeyboardEvent):void => {if(this.keyEdges.accept(event)&&!this.ended)this.toggleSound();};
  private toggleSound():void {
    saveSystem.setFeedback({sfxVolume:saveSystem.feedback.sfxVolume>0?0:0.55});
    this.audio?.refreshVolume();this.updateSoundLabel();
  }
  private updateSoundLabel():void {this.soundButtonText?.setText(saveSystem.feedback.sfxVolume>0?'SFX ON':'SFX OFF');}
  private requestHitStop(duration:number):void {
    if(this.ended||this.paused||this.choosing||this.hitStopCooldown>0&&this.hitStopMs<=0)return;
    this.hitStopMs=Math.min(55,Math.max(this.hitStopMs,duration));this.hitStopCooldown=90;
    this.combat?.update(0,this.player,false);
    this.physics.world.pause();this.setActorsAnimsPaused(true);
  }
  private shakeCamera(duration:number,intensity:number):void {if(saveSystem.feedback.impactMotion)this.cameras.main.shake(duration,Math.min(0.004,intensity));}
  private flashCamera(duration:number,r:number,g:number,b:number):void {if(saveSystem.feedback.impactMotion)this.cameras.main.flash(duration,r,g,b);}

  private readInput(elapsedFrameMs = 0): void {
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
      } else {
        const target=(this.enemies.getChildren() as Enemy[]).filter(e=>e.active&&e.isTargetable&&Math.hypot(e.x-this.player.x,e.y-this.player.y)<=this.player.stats.attackRange+180&&(!this.navigation||this.navigation.clearLine(this.player.x,this.player.y,e.x,e.y)))
          .sort((a,b)=>Math.hypot(a.x-this.player.x,a.y-this.player.y)-Math.hypot(b.x-this.player.x,b.y-this.player.y))[0];
        if(target)this.player.aimIntent.set(target.x-this.player.x,target.y-this.player.y);
        else if(this.player.moveIntent.lengthSq()>0.01)this.player.aimIntent.copy(this.player.moveIntent);
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

    if(this.pendingAttack || this.virtual.attackPressed)this.player.queueAttack(elapsedFrameMs);
    this.pendingAttack=false;
    this.player.wantAttack =
      (!pointer.wasTouch && this.worldAttack.held(pointer.id,pointer.leftButtonDown())) || this.keySpace.isDown || this.virtual.attackHeld;
    this.player.wantDash = this.pendingDash || this.virtual.dashPressed;
    this.player.wantSkill = this.pendingSkill || this.virtual.skillPressed;
    this.orderedAmbushDash = this.ambushInputs.consume() && this.player.wantDash;
    // 缓冲只消费一次：读到就清，避免下一帧重复触发。
    this.pendingDash = false;
    this.pendingSkill = false;

    this.virtual.consumePresses();
  }

  /** A new press commits freely; an existing hold must not waste Shadow Step on air. */
  private tryPlayerAttack(heldRepeat = false, direction?: {x:number;y:number}): void {
    // A fresh close cut may settle a wound without a retreat ritual. The upgrade is explicit;
    // ordinary Bloodbrand / held repeats retain their old behavior, and no input is synthesized.
    const meleeDebt=!heldRepeat && !direction && this.findReaverMeleeDebt();
    if (!heldRepeat && !direction && !meleeDebt && this.tryReaverPursuit()) return;
    if (heldRepeat && this.player.isStealthed && !this.hasAmbushOpportunity()) return;
    let brand=direction ? this.pursuitBrand : undefined;
    if (direction) this.pursuitBrand=undefined;
    const atk = this.player.tryAttack(direction,!heldRepeat);
    if (!atk) { if (brand) this.bloodFocus.resolve('cancelled'); return; }

    try {
      if(atk.ambush&&this.player.classId==='shade')this.shatterHostileProjectiles(atk.origin.x,atk.origin.y,SHADE_SHATTER_RADIUS);
      this.audio?.play('attack',this.player.classId);
      this.combat?.attack(this.player, Math.atan2(atk.dir.y, atk.dir.x), atk.crit);
      if (atk.reprisal>0) this.combat?.reprisalSwing(this.player,Math.atan2(atk.dir.y,atk.dir.x));
      this.attackCount++;
      this.combat?.setRequiemProgress(this.build?.has('reaver_cleave') ? this.attackCount%3 : null);
      if (this.ramReady && this.build?.has('warden_ram')) {
        this.ramReady = false;
        this.areaDamage(this.player.x, this.player.y, 120, this.player.stats.damage, 0x4ecdc4);
      }
      if (atk.ambush && this.player.isAwakened) this.combat?.signature(this.player, Math.atan2(atk.dir.y,atk.dir.x));
      if (this.build?.has('reaver_cleave') && this.attackCount % 3 === 0) {
        this.combat?.signature(this.player, Math.atan2(atk.dir.y,atk.dir.x));
        this.areaDamage(this.player.x, this.player.y, 110, this.player.stats.damage * 0.9, 0xff6b6b);
      }
      if (this.ended) return;
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
          true,
        );
        if (this.build?.has('thorn_fork')) {
          const angle = Math.atan2(atk.dir.y, atk.dir.x);
          for (const side of [-1, 1]) this.spawnProjectile(sx, sy, Math.cos(angle+side*0.24), Math.sin(angle+side*0.24), Math.max(1,Math.floor(atk.damage*0.5)), false, speed, (rangePx/speed)*1000, false, true);
        }
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

      // Reserve only after this ordinary attack was accepted and its pre-swing ring resolved.
      // A ring-killed target never spends or transfers debt on behalf of the basic swing.
      if (!heldRepeat && !direction) brand=this.commitReaverMeleeDebt(atk.origin,atk.dir);
      const list = this.enemies.getChildren() as Enemy[];
      let reprisalHit=false, woundHit=false;
      const rootlineHits = atk.reprisal>0 && this.player.classId==='warden' && this.build?.has('warden_rootline') && this.build.has('warden_thorns') ? new Set<Enemy>() : undefined;
      for (const enemy of list) {
        if (!enemy.active || !enemy.isTargetable || !meleeArcContains(
          enemy.x-atk.origin.x, enemy.y-atk.origin.y, atk.dir.x, atk.dir.y, reach, enemy.hitRadius,
        )) continue;

        // Committed pursuit / reprisal swings still need sight on their actual hit.
        if ((direction || atk.reprisal>0 || brand?.target===enemy) && this.navigation && !this.navigation.clearLine(atk.origin.x,atk.origin.y,enemy.x,enemy.y)) continue;
        const hpBefore=enemy.hp;
        this.hitEnemy(
          enemy,
          atk.damage,
          atk.dir.x,
          atk.dir.y,
          atk.crit,
          atk.crit || atk.reprisal>0 ? 360 : 260,
          atk.crit || atk.reprisal>0 ? 140 : 100,
          true,
          brand?.target===enemy ? brand.pulses : 0,
          !!brand && !direction,
          atk.reprisal>0 || atk.ambush,
        );
        if(enemy.hp<hpBefore)rootlineHits?.add(enemy);
        if(atk.ambush&&enemy.hp<hpBefore)this.reactEnemyHit(enemy,'ambush');
        if(atk.reprisal>0&&enemy.hp<hpBefore)this.reactEnemyHit(enemy,'reprisal');
        if (atk.ambush && enemy.hp<hpBefore && this.player.confirmAmbushHit()) {
          this.combat?.shadowOpening(enemy.x,enemy.y,Math.atan2(atk.dir.y,atk.dir.x));
          this.audio?.play('ambush','shade',0,(enemy.x-this.player.x)/500);
        }
        if (brand?.target===enemy && enemy.hp<hpBefore) woundHit=true;
        if (atk.reprisal>0 && enemy.hp<hpBefore && !reprisalHit) {
          reprisalHit=true;
          this.audio?.play('reprisal','warden',0,(enemy.x-this.player.x)/500);
          this.floatText(this.player.x,this.player.y-53,t('warden_counter_hit'),'#d7ebcd');
          this.requestHitStop(40);
        }
      }
      if(rootlineHits && !this.ended)this.launchRootline(atk.origin.x,atk.origin.y,atk.dir.x,atk.dir.y,atk.damage,rootlineHits);
      // Observe only the original paid target's actual basic HP loss, never a nearby ring hit.
      // Close cuts transfer after all ordinary recipients have been marked, so the same
      // swing cannot immediately overwrite its newly inherited debt with a side hit.
      if (brand && woundHit && !direction) this.relayBloodbrand(brand.target,brand.pulses);
      if (brand) this.bloodFocus.resolve(woundHit?'hit':brand.target.active&&brand.target.isTargetable?'miss':'lost');
    } finally {
      if(atk.ambush)this.player.finishAmbushStrike();
    }
  }

  /** The upgrade adds a single paid wound to an otherwise ordinary aimed melee swing. */
  private findReaverMeleeDebt(origin: {x:number;y:number} = this.player, aim: {x:number;y:number} = this.player.facingDir): {target:Enemy;pulses:number} | undefined {
    const p=this.player;
    if (p.classId!=='reaver' || p.dead || p.isDashing || p.isPursuing || this.ended || this.choosing ||
        !this.build?.has('reaver_relay') || !this.build.has('reaver_bleed')) return;
    return findMeleeDebtTarget(origin,aim,p.stats.attackRange,this.enemies.getChildren() as Enemy[],
      enemy=>this.marks.get(enemy),(sx,sy,tx,ty)=>!this.navigation || this.navigation.clearLine(sx,sy,tx,ty));
  }

  /** Called only for an accepted FRESH ordinary basic, never a held repeat, ring, Q or DOT. */
  private commitReaverMeleeDebt(origin: {x:number;y:number}, aim: {x:number;y:number}): {target:Enemy;pulses:number} | undefined {
    if (this.paused) return;
    const choice=this.findReaverMeleeDebt(origin,aim);
    if (!choice) return;
    const mark=this.marks.get(choice.target)!;
    mark.bleed=0;delete mark.relay;
    if (!mark.seeds) this.marks.delete(choice.target);
    this.bloodFocus.begin(choice.pulses);
    return choice;
  }

  /** The same read-only selection drives both commitment and the local opportunity cue.
   * Guide mode only asks what would happen if the player moved toward each candidate.
   * It does not turn the actual aim, move the player or grant an attack.
   */
  private findReaverPursuitChoice(guide = false): { target: Enemy; travel: number; pulses: number } | undefined {
    const p=this.player;
    const bloodbrand=p.classId==='reaver' && !!this.build?.has('reaver_bleed');
    if (p.classId!=='reaver' || p.dead || (!p.pursuitAvailable && !bloodbrand) || p.isDashing || p.isPursuing || this.ended || this.choosing) return;
    const aim=p.facingDir, move=p.moveIntent;
    const meleeBlocked=(this.enemies.getChildren() as Enemy[]).some(enemy => enemy.active && enemy.isTargetable &&
      meleeArcContains(enemy.x-p.x,enemy.y-p.y,aim.x,aim.y,p.stats.attackRange,enemy.hitRadius));
    if(meleeBlocked && !this.build?.has('reaver_relay'))return;
    let choice: { target: Enemy; travel: number; pulses: number } | undefined, closest=Infinity;
    for (const enemy of this.enemies.getChildren() as Enemy[]) {
      if (!enemy.active || !enemy.isTargetable || !this.navigation?.clearLine(p.x,p.y,enemy.x,enemy.y)) continue;
      const mark=this.marks.get(enemy);
      const pulses=bloodbrand && mark ? remainingBleedPulses(mark.bleed,mark.tick) : 0;
      if (!p.pursuitAvailable && !pulses) continue;
      // Only an explicitly paid wound may override ordinary melee priority; no free kill-ticket leap.
      if(meleeBlocked && !pulses)continue;
      const dx=enemy.x-p.x, dy=enemy.y-p.y;
      const travel=pursuitTravel(dx,dy,guide?dx:move.x,guide?dy:move.y,aim.x,aim.y,p.stats.attackRange,enemy.hitRadius);
      if (travel===null) continue;
      // Rank only eligible targets: inherited debt > ordinary wound > unmarked kill ticket.
      // This same selection drives the guide; it grants no aim, movement or attack permission.
      const priority=this.build?.has('reaver_relay') && choice
        ? relayDebtPriority(pulses,mark?.relay===true)-relayDebtPriority(choice.pulses,this.marks.get(choice.target)?.relay===true) : 0;
      if (priority>0 || priority===0 && Math.hypot(dx,dy)<closest) { choice={target:enemy,travel,pulses}; closest=Math.hypot(dx,dy); }
    }
    return choice;
  }

  /** A fresh press + forward movement may spend an earned approach, never an existing hold. */
  private tryReaverPursuit(): boolean {
    const p=this.player;
    if (!p.attackReady || this.paused) return false;
    const choice=this.findReaverPursuitChoice();
    if (!choice || !p.startPursuit(choice.travel,choice.pulses>0)) return false;
    this.bloodFocus.clear();
    if (choice.pulses>0) {
      // Payment happens at commitment. A miss never refunds or transfers this reservation.
      this.pursuitBrand={target:choice.target,pulses:choice.pulses};
      this.bloodFocus.begin(choice.pulses);
      const mark=this.marks.get(choice.target)!;mark.bleed=0;delete mark.relay;
      if (!mark.seeds) this.marks.delete(choice.target);
    }
    return true;
  }

  /** Use exactly the actual swing / shatter predicates, not an extra aim assist or range. */
  private hasAmbushOpportunity(): boolean {
    const p = this.player, dir = p.facingDir;
    return (this.enemies.getChildren() as Enemy[]).some(enemy =>
      enemy.active && enemy.isTargetable && meleeArcContains(
        enemy.x-p.x, enemy.y-p.y, dir.x, dir.y, p.stats.attackRange, enemy.hitRadius,
      )) || this.projectiles.some(projectile =>
        this.canShatterProjectile(projectile, p.x, p.y, SHADE_SHATTER_RADIUS));
  }

  private canShatterProjectile(projectile: Projectile, x: number, y: number, radius: number): boolean {
    return projectile.fromEnemy && projectile.sprite.active && projectile.life > 0 &&
      Math.hypot(projectile.sprite.x-x, projectile.sprite.y-y) <= radius &&
      (!this.navigation || this.navigation.clearLine(x,y,projectile.sprite.x,projectile.sprite.y));
  }

  /** One local counterplay payoff per stealth break, never per ordinary swing. */
  private shatterHostileProjectiles(x: number, y: number, radius: number): number {
    if(this.ended||this.player.dead)return 0;
    let cleared=0;
    for(let i=this.projectiles.length-1;i>=0;i--){
      const projectile=this.projectiles[i];
      if(!this.canShatterProjectile(projectile,x,y,radius))continue;
      this.combat?.impact(projectile.sprite.x,projectile.sprite.y,0xc9b6f8);
      projectile.sprite.destroy();this.projectiles.splice(i,1);cleared++;
    }
    if(cleared>0){
      this.combat?.pulse(x,y,radius,0xc9b6f8,250);
      this.audio?.play('parry','shade');
      this.floatText(x,y-46,`${t('feel_parry')} × ${cleared}`,'#d7c6ff');
      this.requestHitStop(24);
    }
    return cleared;
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
    basic = false,
    bleedPulses = 0,
    deferRelay = false,
    payoffText = false,
  ): void {
    if (!enemy.isTargetable || this.ended) return;
    const exposed = enemy.isExposed;
    const incoming=enemy.incomingDamageMultiplier ?? 1;
    const ripped=bleedPulses>0 && this.player.classId==='reaver' && !!this.build?.has('reaver_bleed');
    damage = Math.max(1, Math.floor(damage * incoming)) + (ripped ? cashedBleedDamage(this.player.stats.damage,bleedPulses,incoming) : 0);
    const graft = basic && this.player.classId==='thorn' && this.build?.has('thorn_graft') && this.build.has('thorn_seeds') &&
      this.marks.get(enemy)?.seeds===THORN_BLOOM.maxSeeds;
    const hpBefore=enemy.hp;
    const actual = Math.min(hpBefore, damage);
    const winding=!!enemy.rangedTelegraph;
    const killed = enemy.takeDamage(damage);
    if(killed&&winding)this.rangedStats.killedWindups++;
    this.consumeEliteEvents(enemy);
    enemy.applyKnockback(dirX, dirY, knockForce, knockMs);
    this.consumeRangedEvents(enemy);
    this.damageDealt += actual;
    this.player.onHitEnemy(actual);
    if (enemy.hp<hpBefore) {
      if (basic || ripped || payoffText) {
        // Radial seed payoffs carry no travel vector; orient their local shell away from the caster.
        const dx=dirX || dirY ? dirX : enemy.x-this.player.x;
        const dy=dirX || dirY ? dirY : enemy.y-this.player.y;
        this.combat?.contact(enemy.x, enemy.y-8, this.player.classId, dx, dy,
          ripped || payoffText ? 'payoff' : crit ? 'critical' : 'normal');
      } else this.combat?.impact(enemy.x, enemy.y-8, CLASSES[this.player.classId].color, crit);
    }
    if (ripped) { this.combat?.rip(enemy.x,enemy.y,Math.atan2(dirY,dirX)); this.floatText(enemy.x,enemy.y-40,t('reaver_rip_hit'),'#efb5a0'); }
    if(enemy.hp<hpBefore){
      this.audio?.play(ripped?'rip':crit?'crit':'hit',this.player.classId,0,(enemy.x-this.player.x)/500);
      if(basic||ripped||crit)this.reactEnemyHit(enemy,ripped?'rip':crit?'critical':this.player.classId);
    }
    if(crit||basic&&this.player.classId!=='thorn')this.requestHitStop(crit?32:this.player.classId==='warden'?24:14);
    if (basic && !killed && this.build && ((this.build.has('reaver_bleed') && !ripped) || this.build.has('thorn_seeds'))) {
      const mark = this.marks.get(enemy) ?? { seeds: 0, bleed: 0, tick: 1000 };
      if (this.build.has('reaver_bleed') && !ripped) { mark.bleed = BLOODBRAND.duration; delete mark.relay; }
      if (this.build.has('thorn_seeds')) {
        const previous=mark.seeds;
        mark.seeds = Math.min(THORN_BLOOM.maxSeeds, mark.seeds+1);
        if (previous<THORN_BLOOM.maxSeeds && mark.seeds===THORN_BLOOM.maxSeeds) {
          const layout=seedMarkLayout(enemy.x,enemy.y,enemy.hitRadius,mark.seeds);
          if(layout)this.combat?.bloomRipe(layout.slots[1].x,layout.slots[1].y);
          this.audio?.play('seed','thorn',0,(enemy.x-this.player.x)/500);
        }
      }
      this.marks.set(enemy, mark);
    }

    if (graft && enemy.hp<hpBefore && !(killed && enemy===this.boss)) this.graftSeed(enemy);
    if (basic && ripped && !deferRelay && enemy.hp<hpBefore && !(killed && enemy===this.boss)) this.relayBloodbrand(enemy,bleedPulses);

    // Exact original-target HP loss; typography never authorizes damage or a proc.
    if (enemy.hp<hpBefore) this.floatText(
      enemy.x,
      enemy.y - 18,
      crit ? `${actual}!` : `${actual}`,
      crit || exposed ? '#ffd56a' : payoffText || ripped
        ? ({warden:'#d7ebcd',reaver:'#efb5a0',shade:'#dcc8ff',thorn:'#e5dda0'}[this.player.classId]) : '#ffffff',
      payoffText || ripped ? 'payoff' : crit ? 'critical' : 'normal',
      enemy,
    );

    if (killed) {
      if (enemy !== this.boss) this.player.onEnemyKilled();
      const combo=this.chain.kill();
      this.combat?.defeat(enemy,dirX,dirY,enemy===this.boss);
      this.audio?.play('kill',this.player.classId,combo,(enemy.x-this.player.x)/500);
      this.requestHitStop(enemy.elite?48:35);
      if(combo>=5&&combo%5===0){this.audio?.play('combo',this.player.classId);this.combat?.pulse(this.player.x,this.player.y,85,CLASSES[this.player.classId].color);}
      this.kills += 1;
      this.floorKills += 1;
      this.spawnEssenceFx(enemy.x, enemy.y);
      this.marks.delete(enemy);
      if (this.build?.has('shared_feast')) this.player.heal(3);
      if (this.build?.has('shared_haste')) this.player.refundCooldowns(350,350);
      if (this.build?.has('shade_ambush')) this.player.refundCooldowns(400,0);
      if (enemy === this.boss) { this.endRun(false, !this.player.dead); return; }
      if (enemy.elite) {
        this.floatText(enemy.x, enemy.y - 36, t('run_elite'), '#ffc4a8');
        this.player.heal(Math.floor(this.player.stats.maxHp * 0.08));
      }
    }
  }

  /** Only actual original-target wound-paid BASIC HP loss may seed another hunt. */
  private relayBloodbrand(source:Enemy,paidPulses:number): Enemy | undefined {
    const pulses=relayPulses(paidPulses);
    if(!pulses || this.ended || this.player.dead || this.player.classId!=='reaver' || !this.build?.has('reaver_relay') || !this.build.has('reaver_bleed'))return;
    const target=findRelayTarget(source,this.enemies.getChildren() as Enemy[],e=>{
      const mark=this.marks.get(e);return mark?remainingBleedPulses(mark.bleed,mark.tick):0;
    },(sx,sy,tx,ty)=>!this.navigation || this.navigation.clearLine(sx,sy,tx,ty));
    if(!target)return;
    const mark=this.marks.get(target) ?? {seeds:0,bleed:0,tick:BLOODBRAND.interval};
    mark.bleed=relayDuration(pulses);mark.tick=BLOODBRAND.interval;mark.relay=true;
    this.marks.set(target,mark);
    this.combat?.relayBloodbrand(source.x,source.y-16,target.x,target.y-16);
    this.floatText(target.x,target.y-62,`${mutationName(MUTATIONS.find(m=>m.id==='reaver_relay')!)} ×${pulses}`,'#efb5a0');
    return target;
  }

  /** Only called after a real basic HP loss on a target that was ripe BEFORE this hit. */
  private graftSeed(source: Enemy): Enemy | undefined {
    if (this.ended || this.player.dead || this.player.classId!=='thorn' || !this.build?.has('thorn_graft') || !this.build.has('thorn_seeds')) return;
    const target=findGraftTarget(source,this.enemies.getChildren() as Enemy[],
      e=>this.marks.get(e)?.seeds ?? 0,e=>e.active && e.isTargetable,
      (sx,sy,tx,ty)=>!this.navigation || this.navigation.clearLine(sx,sy,tx,ty));
    if (!target) return;
    const mark=this.marks.get(target) ?? { seeds: 0, bleed: 0, tick: 1000 };
    mark.seeds=Math.min(THORN_BLOOM.maxSeeds,mark.seeds+1);
    this.marks.set(target,mark);
    this.combat?.graftSeed(source.x,source.y-16,target.x,target.y-16);
    if (mark.seeds===THORN_BLOOM.maxSeeds) {
      const layout=seedMarkLayout(target.x,target.y,target.hitRadius,mark.seeds);
      if(layout)this.combat?.bloomRipe(layout.slots[1].x,layout.slots[1].y);
      this.audio?.play('seed','thorn',0,(target.x-this.player.x)/500);
    }
    return target;
  }

  private consumeRangedEvents(enemy: Enemy): void {
    for(const event of enemy.drainRangedEvents?.() ?? []){
      if(this.ended || this.paused || this.choosing || this.player.dead || !enemy.isAlive)continue;
      if(event.type==='start'){
        this.rangedStats.starts++;
        const count=(this.enemies.getChildren() as Enemy[]).filter(e=>e.isTargetable&&e.rangedTelegraph).length;
        this.rangedStats.peakWinding=Math.max(this.rangedStats.peakWinding,count);
        if(Math.hypot(enemy.x-this.player.x,enemy.y-this.player.y)<400)this.audio?.play('tell','thorn',0,(enemy.x-this.player.x)/500);
      }else if(event.type==='fire')this.rangedStats.shots++;
      else if(event.type==='cancel')this.rangedStats.cancelled++;
      else {
        this.rangedStats.interrupted++;
        this.floatText(enemy.x,enemy.y-45,t('ranged_interrupt'),'#e9d4a5');
        this.combat?.impact(enemy.x,enemy.y-20,0xe9c591);
      }
    }
  }

  private consumeEliteEvents(enemy: Enemy): void {
    for(const event of enemy.drainEliteEvents?.() ?? []) {
      if(this.ended || this.paused || this.choosing || !enemy.isAlive || this.player.dead)continue;
      const {x,y,radius}=event;
      if(event.type==='windup'){
        this.eliteStats.windups++;
        this.audio?.play('tell',this.player.classId,0,(x-this.player.x)/500);
      } else if(event.type==='break'){
        this.eliteStats.breaks++;
        this.audio?.play('break',this.player.classId,0,(x-this.player.x)/500);
        this.combat?.impact(x,y-15,0xf3d38e,true);
        this.combat?.pulse(x,y,48,0xf3d38e,260);
        this.floatText(x,y-62,t('elite_break'),'#ffe2a0');
        this.requestHitStop(40);
      } else {
        this.eliteStats.slams++;
        this.audio?.play('hit','warden',0,(x-this.player.x)/500);
        this.combat?.pulse(x,y,radius,0xe3a17c,300);
        this.combat?.impact(x,y,0xe3a17c,true);
        const inRange=Math.hypot(this.player.x-x,this.player.y-y)<=radius;
        const visible=!this.navigation || this.navigation.clearLine(x,y,this.player.x,this.player.y);
        const dealt=inRange&&visible ? this.player.applyDamage(enemy.damage) : 0;
        if(dealt>0){
          this.eliteStats.damage+=dealt;
          this.floatText(this.player.x,this.player.y-20,`-${dealt}`,'#ff9a86');
          this.shakeCamera(80,0.003);
        } else this.eliteStats.avoided++;
      }
    }
  }

  /** Thorn skill: short-range 8-way ring for peeling mobs off the kiter. */
  private reactEnemyHit(enemy:Enemy,kind:import('../systems/EnemyHitReaction').EnemyHitKind):void {
    const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    enemy.reactToHit(kind,saveSystem.feedback.impactMotion&&!reduced);
  }

  private fireNova(): void {
    if (this.build?.has('thorn_seeds')) {
      let hitTargets=0;
      for (const [enemy,mark] of [...this.marks]) {
        if (!enemy.isAlive || !mark.seeds) continue;
        const count=mark.seeds, before=enemy.hp; mark.seeds=0;
        this.hitEnemy(enemy,this.player.stats.damage*THORN_BLOOM.damageRatio*count,0,0,false,0,0,false,0,false,true);
        // Actual seed damage only: no flourish/sound for rejected damage, no extra hit or AoE.
        if (enemy.hp<before) {
          hitTargets++;
          this.reactEnemyHit(enemy,'bloom');
          // Preserve the awakened class flower, now only after actual seed damage.
          this.combat?.signature(this.player,0,enemy.x,enemy.y,24+count*7);
          this.combat?.bloomDetonate(enemy.x,enemy.y,count,this.player.isAwakened);
        }
      }
      this.marksInk?.clear();
      if (hitTargets>0 && !this.ended) {
        this.player.confirmBloomCast();
        this.audio?.play('bloom','thorn');
        this.floatText(this.player.x,this.player.y-67,`${t('thorn_bloom_hit')} × ${hitTargets}`,'#e5dda0');
        this.requestHitStop(36);
      }
    }
    if (this.ended) return;
    this.areaDamage(this.player.x,this.player.y,100,this.player.stats.damage*2.2,0x97d77f,330);
    if(this.ended)return;
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
      .setDepth(4)
      .setScale(2);
    ring.play('fx_nova_play');
    ring.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => ring.destroy());
    // Keep the local nova below the actor; no full-screen green flash hiding release/hazards.
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
    if (this.ended || this.paused || this.choosing || !enemy.isTargetable || this.player.dead) return;
    if (this.player.isDashing || enemy.canDealContactDamageTo(this.player.x,this.player.y) === false || enemy instanceof ChapterBoss && enemy.isExposed) return;
    // The hurt-invulnerability window inside applyDamage is the throttle —
    // a separate scene-level contact cooldown did the same job twice.
    if (this.player.isInvulnerable) return;
    const dealt = this.player.applyDamage(enemy.damage);
    if (dealt > 0) {
      if (!this.player.dead && !(enemy instanceof ChapterBoss)) {
        enemy.recoverFromContact(this.player.x, this.player.y);
        this.consumeRangedEvents(enemy);
      }
      this.shakeCamera(80, 0.004);
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
      const introduce = this.floor === 3 && !this.eliteIntroduced;
      let elite = this.floor >= 3 && Math.random() < 0.08 + this.floor * 0.01;
      const kind = introduce ? 'brute' : this.pickEnemyKind();
      if(introduce) elite=true;
      else if(kind==='brute' && (this.enemies.getChildren() as Enemy[]).some(e=>e.isAlive&&e.isBreakableElite))elite=false;
      const pos = this.spawnPointAwayFromPlayer(240,460);
      if (!pos) break;
      const enemy = new Enemy(this, pos.x, pos.y, kind, this.floor, elite,450);
      this.enemies.add(enemy);
      if(introduce)this.eliteIntroduced=true;
    }
  }

  private pickEnemyKind(): EnemyKind {
    const r = Math.random();
    if (this.floor >= 3 && r < 0.18) return 'brute';
    if (this.floor >= 2 && r < 0.45) return 'spitter';
    return 'crawler';
  }

  private spawnPointAwayFromPlayer(minDist: number, maxDist?:number): { x: number; y: number } | null {
    const clear = (x: number, y: number): boolean => {
      const distance=Phaser.Math.Distance.Between(x,y,this.player.x,this.player.y);
      if(distance<minDist || maxDist!==undefined&&distance>maxDist)return false;
      // 每侧预留一格，覆盖当前所有敌人（含精英）的物理体积及原点偏移。
      return this.walls.getChildren().every((wall) => {
        const body = wall.body as Phaser.Physics.Arcade.StaticBody;
        return x + TILE <= body.left || x - TILE >= body.right ||
          y + TILE <= body.top || y - TILE >= body.bottom;
      });
    };
    for (let i = 0; i < 24; i++) {
      const angle=maxDist===undefined?0:Math.random()*Math.PI*2;
      const radius=maxDist===undefined?0:minDist+Math.random()*(maxDist-minDist);
      const x = maxDist===undefined?Phaser.Math.Between(TILE * 2, this.mapW - TILE * 2):Math.round(Phaser.Math.Clamp(this.player.x+Math.cos(angle)*radius,64,this.mapW-64));
      const y = maxDist===undefined?Phaser.Math.Between(TILE * 2, this.mapH - TILE * 2):Math.round(Phaser.Math.Clamp(this.player.y+Math.sin(angle)*radius,64,this.mapH-64));
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

  private createChapterHud(): void {
    this.chainText=this.add.text(640,171,'',{fontFamily:UI_FONT,fontSize:'20px',color:'#e8c886',fontStyle:'bold'}).setOrigin(0.5).setDepth(520);
    this.chainBar=this.add.graphics().setDepth(519);
    this.pursuitText=this.add.text(640,207,'',{fontFamily:UI_FONT,fontSize:'12px',color:'#edafa0',stroke:'#080b10',strokeThickness:3}).setOrigin(0.5).setDepth(520);
    this.hudFocus.register({x:410,y:197,width:460,height:22},[{target:this.pursuitText,minimum:0.15}]);
    this.addHudObjects([this.pursuitText]);
    this.soundButton=createTextButton(this,962,94,'',()=>this.toggleSound(),{width:76,height:30,fontSize:'10px',stroke:UI.root,depth:530});
    this.soundButtonText=this.soundButton.list.find(o=>o.type==='Text') as Phaser.GameObjects.Text;
    this.updateSoundLabel();this.addHudObjects([this.chainText,this.chainBar,this.soundButton]);
    this.buildText=this.add.text(640,30,t('chapter_name'),{fontFamily:UI_FONT,fontSize:'12px',color:UI.textDim,align:'center',wordWrap:{width:540}}).setOrigin(0.5,0).setDepth(500);
    this.bossText=this.add.text(640,52,'',{fontFamily:UI_FONT,fontSize:'16px',color:'#ddd3b4'}).setOrigin(0.5,0).setDepth(500);
    this.bossBar=this.add.graphics().setDepth(500);
    this.bossCueText=this.add.text(640,101,'',{fontFamily:UI_FONT,fontSize:'12px',color:'#a9a1ac'}).setOrigin(0.5,0).setDepth(500).setStroke('#070a10',2);
    const chainRoot=this.add.container(0,0,[this.chainText,this.chainBar]).setDepth(520);
    this.hudFocus.register({x:350,y:20,width:580,height:96},[
      {target:this.buildText,minimum:0.16},{target:this.bossText,minimum:0.24},
      {target:this.bossBar,minimum:0.50},{target:this.bossCueText,minimum:0.65},
    ]);
    this.hudFocus.register({x:560,y:160,width:160,height:38},[{target:chainRoot,minimum:0.18}]);
    this.registerButtonFocus(this.soundButton,76,30);
    this.addHudObjects([this.buildText,this.bossText,this.bossBar,this.bossCueText,chainRoot]);
  }

  private consumeCombatEvents(): void {
    for (const event of this.player.drainCombatEvents()) {
      if (event.type==='pursuit') {
        this.audio?.play('dash','reaver');
        this.combat?.ghost(this.player,event.x,event.y,120);
      } else if (event.type==='dash') {
        this.audio?.play('dash',this.player.classId);
        this.combat?.ghost(this.player,event.x,event.y);
        if (this.build?.has('warden_ram')) this.ramReady=true;
        if (this.build?.has('shared_dash')) this.dashBurstPending=true;
      } else if (event.type==='guard') {
        this.audio?.play('parry','warden');
        this.combat?.impact(event.x,event.y-14,0xa4d7c6);
        this.floatText(event.x,event.y-69,t('warden_guard_gain',{damage:event.gained}),'#b9e5d4');
      } else if (event.type==='skill') {
        this.audio?.play('skill',this.player.classId);
        this.combat?.skill(this.player,event.x,event.y);
        if(this.player.classId==='warden')this.areaDamage(event.x,event.y,WARDEN_BULWARK_RADIUS,this.player.stats.damage*1.75,0x89d9c7,400);
        if(this.player.classId==='reaver')this.areaDamage(event.x,event.y,108,this.player.stats.damage,0xf48b82,190);
        if (this.build?.has('shade_decoy')) {
          this.decoy={x:event.x,y:event.y,life:2000};
          this.combat?.ghost(this.player,event.x,event.y,2000);
          this.combat?.pulse(event.x,event.y,38,0xb794f6,700);
        }
      } else {
        this.audio?.play('hurt',this.player.classId);
        this.combat?.impact(event.x,event.y,0xff9a86,true);
        if (!this.player.dead && this.build?.has('shared_spite') && this.spiteCooldown<=0) {
          this.spiteCooldown=1000;
          this.areaDamage(this.player.x,this.player.y,100,this.player.stats.damage*0.8,0xf5b9a0);
        }
      }
    }
  }

  private updateMutations(delta: number): void {
    this.spiteCooldown=Math.max(0,this.spiteCooldown-delta);
    if (this.decoy) { this.decoy.life-=delta; if(this.decoy.life<=0) this.decoy=undefined; }
    if (this.dashBurstPending && !this.player.isDashing) {
      this.dashBurstPending=false;
      this.areaDamage(this.player.x,this.player.y,100,this.player.stats.damage*0.75,CLASSES[this.player.classId].color);
    }
    this.thornPulse-=delta;
    if (this.build?.has('warden_thorns') && this.player.hasBulwark && this.thornPulse<=0) {
      this.thornPulse=600;
      this.combat?.signature(this.player);
      this.areaDamage(this.player.x,this.player.y,110,this.player.stats.damage*0.65,0x79cfc0);
    }
    const g=this.marksInk?.clear();
    for (const [enemy,mark] of this.marks) {
      if (!enemy.active || !enemy.isAlive) { this.marks.delete(enemy); continue; }
      if (mark.bleed>0) {
        const activeDelta=Math.min(delta,mark.bleed);
        mark.bleed=Math.max(0,mark.bleed-delta); mark.tick-=activeDelta;
        if(mark.tick<=0) {
          const pulses=1+Math.floor(-mark.tick/BLOODBRAND.interval);
          mark.tick+=pulses*BLOODBRAND.interval;
          for (let i=0;i<pulses && enemy.isAlive && !this.ended;i++) this.hitEnemy(enemy,this.player.stats.damage*BLOODBRAND.ratio,0,0,false,0,0);
        }
      }
      if (!enemy.isAlive) continue;
      const pods=seedMarkLayout(enemy.x,enemy.y,enemy.hitRadius,mark.seeds);
      if(g && pods) {
        for(const [i,slot] of pods.slots.entries()) {
          const filled=i<pods.count,color=pods.full?0xe5d995:0xaed58d;
          g.fillStyle(0x101914,0.95).fillRect(slot.x-4,slot.y-6,8,11);
          g.lineStyle(1,filled?color:0x52634d,filled?1:0.65).beginPath()
            .moveTo(slot.x,slot.y-4).lineTo(slot.x+3,slot.y-1).lineTo(slot.x+2,slot.y+3)
            .lineTo(slot.x-2,slot.y+3).lineTo(slot.x-3,slot.y-1).closePath().strokePath();
          if(filled) {
            g.fillStyle(color,1).fillRect(slot.x-1,slot.y-2,2,4);
            g.lineBetween(slot.x,slot.y-4,slot.x,slot.y-6);
          }
        }
        if(pods.full)g.lineStyle(1,0xe5d995,1).lineBetween(pods.bounds.left, pods.bounds.bottom,pods.bounds.right,pods.bounds.bottom);
      }
      if(mark.relay && !remainingBleedPulses(mark.bleed,mark.tick)) delete mark.relay;
      if(mark.bleed>0) {
        const pulses=remainingBleedPulses(mark.bleed,mark.tick);
        const relay=mark.relay ? relayMarkLayout(enemy.x,enemy.y,enemy.hitRadius,pulses) : undefined;
        if (g && relay) {
          // Essential identity, not impact motion: remains readable in comfort mode and pause.
          const {x,y}=relay;
          g.fillStyle(0x21151c,1).lineStyle(1,0xf0c9ac,1).beginPath()
            .moveTo(x,y-6).lineTo(x+6,y).lineTo(x,y+6).lineTo(x-6,y).closePath().fillPath().strokePath();
          g.lineStyle(2,0xe99083,1).beginPath().moveTo(x+2,y-3).lineTo(x-2,y+1)
            .lineTo(x+1,y+3).lineTo(x+3,y+1).strokePath();
          for(const pip of relay.pips)g.fillStyle(0x21151c,1).fillRect(pip.x-1,pip.y-1,5,5)
            .fillStyle(0xf0c9ac,1).fillRect(pip.x,pip.y,3,3);
        } else if (!relay) {
          for (let i=0;i<Math.min(4,pulses);i++) g?.fillStyle(0xe37878,0.9).fillRect(enemy.x-7+i*5,enemy.y-enemy.hitRadius-14,3,6);
        }
      }
      if(!mark.seeds && mark.bleed<=0) this.marks.delete(enemy);
    }
  }

  private areaDamage(x:number,y:number,radius:number,damage:number,color:number,force=150): void {
    this.combat?.pulse(x,y,radius,color);
    for(const enemy of this.enemies.getChildren() as Enemy[]) {
      if(!enemy.active || !enemy.isTargetable || Math.hypot(enemy.x-x,enemy.y-y)>radius+enemy.hitRadius) continue;
      const len=Math.hypot(enemy.x-x,enemy.y-y)||1;
      this.hitEnemy(enemy,damage,(enemy.x-x)/len,(enemy.y-y)/len,false,force,force>250?160:90);
    }
  }

  private openMutationChoice(): void {
    if(!this.build) return;
    this.choices=this.build.offer();
    if(!this.choices.length) { this.beginNextFloor(); return; }
    this.choosing=true;
    this.clearRootlines();
    this.player.cancelPursuit();
    this.player.cancelReprisal();
    this.player.cancelShadowReturn();
    this.player.cancelBloomCast();
    this.pursuitBrand=undefined;this.bloodFocus.clear();
    this.clearPursuitCue();
    this.audio?.setSuspended(true);
    this.pendingAttack=false;this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;this.player.clearActionBuffers();
    this.pendingDash=this.pendingSkill=false;
    this.player.wantAttack=this.player.wantDash=this.player.wantSkill=false;
    this.physics.world.pause(); this.player.setVelocity(0,0); this.setActorsAnimsPaused(true);
    this.virtualVisibleBeforePause=this.virtual.isVisible; this.virtual.setSuspended(true);
    this.pauseButton.setVisible(false);
    const root=this.add.container(0,0).setDepth(950);
    const dim=this.add.rectangle(640,360,1280,720,0x070a10,0.93).setInteractive();
    root.add(dim);
    const label=(x:number,y:number,text:string,size:string,color:string=UI.text)=>this.add.text(x,y,text,{fontFamily:UI_FONT,fontSize:size,color,align:'center',wordWrap:{width:1000}}).setOrigin(0.5);
    root.add(label(640,150,t('mutation_kicker',{floor:this.floor}),'12px',UI.textGood));
    root.add(label(640,190,t('mutation_title'),'30px'));
    root.add(label(640,230,t('mutation_subtitle'),'13px',UI.textDim));
    this.choices.forEach((m,i)=>{
      const accent=m.owner==='shared'?UI.bone:CLASSES[this.player.classId].color;
      const card=createTextButton(this,320+i*320,410,'',()=>this.chooseMutation(i),{width:294,height:302,stroke:accent,depth:960});
      card.setData('mutation-id',m.id);
      const emblem=this.add.graphics();
      emblem.lineStyle(2,accent,0.7).strokeCircle(0,-93,22);
      emblem.lineStyle(1,accent,0.6).lineBetween(-55,-93,-29,-93).lineBetween(29,-93,55,-93);
      for(const side of [-1,1]) emblem.lineBetween(side*35,-93,side*43,-104);
      const awakening = m.id === AWAKENINGS[this.player.classId].mutation;
      const mark = awakening
        ? this.add.image(0,-94,portraitKey(this.player.classId,true)).setScale(0.30)
        : label(0,-93,m.mark,'19px',UI.textGood);
      if (awakening) {
        const title = AWAKENINGS[this.player.classId].name[i18n.current === 'en' ? 1 : 0];
        const badge = label(0,-12,`${t('awakening_tag')} · ${title}`,'11px',UI.textGood);
        badge.setWordWrapWidth(264);
        card.add(badge);
      }
      const name=label(0,-44,mutationName(m),'19px'); name.setWordWrapWidth(264);
      let descSize=isTouchLikeDevice()?18:14;
      const desc=label(0,38,mutationDescription(m),`${descSize}px`,UI.textDim);
      // Advanced wrap also splits long CJK runs, instead of overflowing adjacent cards.
      desc.setWordWrapWidth(244,true).setLineSpacing(isTouchLikeDevice()?5:7);
      while (desc.height>128 && descSize>14) desc.setFontSize(--descSize);
      const type=label(0,-131,m.owner==='shared'?t('mutation_shared'):i18n.className(this.player.classId),'10px',UI.textDim);
      card.add([emblem,mark,name,desc,type,label(0,126,`[ ${i+1} ]  ${t('mutation_choose')}`,'12px',UI.textGood)]);
      root.add(card);
    });
    root.add(label(640,608,t('mutation_hint'),'12px',UI.textDim));
    this.choiceRoot=root; this.addHudObjects([root]);
    const onKey=(event:KeyboardEvent)=>{if(/^[123]$/.test(event.key) && this.keyEdges.accept(event)) this.chooseMutation(Number(event.key)-1);};
    this.input.keyboard?.on('keydown',onKey);
    this.offChoiceKey=()=>this.input.keyboard?.off('keydown',onKey);
  }

  private chooseMutation(index:number): void {
    if(!this.choosing || this.ended || isPortraitBlocked()) return;
    const choice=this.choices[index];
    if(!choice || !this.build?.acquire(choice.id)) return;
    this.player.forceAmbushCrit=this.build.has('shade_ambush');
    const awakenedBefore = this.player.isAwakened;
    this.player.setAwakened(isAwakened(this.player.classId, this.build.owned));
    this.heroPortrait.setTexture(portraitKey(this.player.classId,this.player.isAwakened));
    const awakeningName = AWAKENINGS[this.player.classId].name[i18n.current === 'en' ? 1 : 0];
    this.awakeningText.setText(this.player.isAwakened ? awakeningName : '').setVisible(this.player.isAwakened);
    this.closeMutationChoice();
    this.buildText?.setText(this.build.owned.map(id=>mutationName(MUTATIONS.find(m=>m.id===id)!)).join('  ·  '));
    this.beginNextFloor();
    this.audio?.setSuspended(false);
    this.physics.world.resume(); this.setActorsAnimsPaused(false);
    this.pendingDash=this.pendingSkill=false;
    this.virtual.setSuspended(false);
    if(this.virtualVisibleBeforePause) this.virtual.show();
    this.pauseButton.setVisible(true);
    // Do not carry a click on a choice card into a ranged attack in the next room.
    this.player.wantAttack=false;
    if (!awakenedBefore && this.player.isAwakened) {
      this.combat?.awaken(this.player);
      this.showBanner(`${t('awakening_tag')} · ${awakeningName}`,CLASSES[this.player.classId].color);
    }
  }

  private closeMutationChoice(): void {
    this.offChoiceKey?.(); this.offChoiceKey=undefined;
    this.choiceRoot?.destroy(true); this.choiceRoot=undefined;
    this.choosing=false; this.choices=[];
  }

  private enterBossArena(): void {
    this.groundImage?.destroy(); this.drawFloor(); this.buildWalls(true);
    this.player.setPosition(896,790); (this.player.body as Phaser.Physics.Arcade.Body).reset(896,790);
    this.cameras.main.stopFollow();
    this.cameras.main.centerOn(896,608);
    this.boss=new ChapterBoss(this,896,540,{
      damagePlayer:damage=>{
        const dealt=this.player.applyDamage(damage);
        if(dealt>0) {this.floatText(this.player.x,this.player.y-20,`-${dealt}`,'#ff9a86');this.shakeCamera(85,0.003);}
      },
      shoot:(x,y,dx,dy,damage,speed)=>this.spawnProjectile(x,y,dx,dy,damage,true,speed,4200),
      phaseChanged:()=>{this.showBanner(t('boss_phase_two'),0xe89975);this.combat?.pulse(this.boss!.x,this.boss!.y,180,0xeb927b,800);},
      exposed:wallImpact=>{
        this.audio?.play('break',this.player.classId);
        this.combat?.impact(this.boss!.x,this.boss!.y-40,0xf3cf8c,true);
        if(wallImpact){this.shakeCamera(100,0.003);this.combat?.pulse(this.boss!.x,this.boss!.y,90,0xf3cf8c,350);}
      },
    });
    this.enemies.add(this.boss);
    this.showBanner(t('boss_intro'),0xd4c39a);
  }

  private advanceFloor(): void {
    if (this.choosing || this.boss || this.ended || this.player.dead) return;
    this.openMutationChoice();
  }

  private beginNextFloor(): void {
    this.combatText?.clear();
    // Floor transitions must not inherit an old mouse gesture or queued strike.
    this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;this.pendingAttack=false;
    this.player.wantAttack=false;this.player.clearActionBuffers();
    this.hitStopMs=this.hitStopCooldown=0;
    this.chain.remaining=0;this.chain.count=0;
    this.player.cancelPursuit();
    this.player.cancelReprisal();
    this.player.cancelShadowReturn();
    this.player.cancelBloomCast();
    this.pursuitBrand=undefined;this.bloodFocus.clear();
    this.clearPursuitCue();
    this.floor += 1;
    this.enemies.clear(true,true);
    this.projectiles.forEach(p => p.sprite.destroy()); this.projectiles = [];
    this.clearRootlines();
    this.marks.clear(); this.marksInk?.clear(); this.decoy=undefined;
    this.floorTimer = 0;
    this.floorKills = 0;
    this.spawnTimer = 0;
    this.player.heal(Math.floor(this.player.stats.maxHp * 0.2));
    this.showBanner(`${t('run_floor_up')} ${this.floor}`, UI.teal);
    this.flashCamera(180, 40, 20, 70);
    this.shakeCamera(120, 0.003);
    if (this.groundImage) {
      const tint =
        this.floor >= 6 ? 0xb89ad8 : this.floor >= 4 ? 0xc4b5fd : 0xffffff;
      this.groundImage.setTint(tint);
    }
    if (this.floor === 4) this.enterBossArena();
    else this.spawnWave(4 + this.floor);
  }

  /** Called only by the accepted original paid swing, after collecting actual melee HP hits. */
  private launchRootline(x:number,y:number,dx:number,dy:number,damage:number,skipped:ReadonlySet<Enemy>): RootlineWave<Enemy> | undefined {
    if(this.ended || this.player.dead || this.player.classId!=='warden' || !this.build?.has('warden_rootline') || !this.build.has('warden_thorns'))return;
    return this.rootlines.launch(x,y,dx,dy,damage,skipped,180-this.projectiles.length);
  }

  private updateRootlines(delta:number): void {
    if(this.ended || this.player.dead){this.clearRootlines();return;}
    this.rootlines.step(delta,this.wallRects,this.enemies.getChildren() as Enemy[],(enemy,wave)=>{
      const hp=enemy.hp;
      // Secondary damage, not another basic swing/crit/charge/proc. Never double the paid melee hit.
      this.hitEnemy(enemy,wave.damage,wave.dx,wave.dy,false,0,0);
      if(enemy.hp<hp){
        this.reactEnemyHit(enemy,'reprisal');
        this.audio?.play('reprisal','warden',0,(enemy.x-this.player.x)/500);
      }
      return !this.ended && !this.player.dead;
    });
    this.combat?.showRootlines(this.rootlines.active);
  }

  private clearRootlines(): void { this.rootlines.clear();this.combat?.showRootlines([]); }

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
    basic = false,
  ): void {
    if (this.projectiles.length + this.rootlines.active.length >= 180) return;
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
      basic,
    });
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i],ax=p.sprite.x,ay=p.sprite.y;
      const dt=Math.min(delta,Math.max(0,p.life))/1000,bx=ax+p.vx*dt,by=ay+p.vy*dt;
      p.life-=delta;
      let entry=Infinity,target:Enemy|undefined,hitPlayer=false;
      for(const wall of this.wallRects){const t=segmentRectEntry(ax,ay,bx,by,wall);if(t!==null&&t<entry)entry=t;}
      if(p.fromEnemy&&!this.player.dead){
        const t=segmentCircleEntry(ax,ay,bx,by,this.player.x,this.player.y,PLAYER_PROJECTILE_RADIUS);
        if(t!==null&&t<entry){entry=t;hitPlayer=true;}
      }else if(!p.fromEnemy){
        for(const enemy of this.enemies.getChildren() as Enemy[]){
          if(!enemy.active||!enemy.isTargetable)continue;
          const t=segmentCircleEntry(ax,ay,bx,by,enemy.x,enemy.y,enemy.hitRadius);
          if(t!==null&&t<entry){entry=t;target=enemy;}
        }
      }
      const t=Number.isFinite(entry)?entry:1;
      p.sprite.setPosition(ax+(bx-ax)*t,ay+(by-ay)*t);
      if(hitPlayer){
        const dealt=this.player.applyDamage(p.damage);
        if(dealt>0)this.floatText(this.player.x,this.player.y-20,`-${dealt}`,'#ff6b6b');
      }else if(target){
        const len=Math.hypot(p.vx,p.vy)||1;
        this.hitEnemy(target,p.damage,p.vx/len,p.vy/len,p.crit,120,60,p.basic);
      }
      if(Number.isFinite(entry)||p.life<=0||bx<0||by<0||bx>this.mapW||by>this.mapH){p.sprite.destroy();this.projectiles.splice(i,1);}
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
    this.cameras.main.centerOn(this.boss ? 896 : this.player.x, this.boss ? 608 : this.player.y);
  }

  private registerButtonFocus(button: Phaser.GameObjects.Container, width: number, height: number): void {
    for(const child of button.list)if(child.type==='Text')(child as Phaser.GameObjects.Text).setStroke('#070a10',2);
    this.hudFocus.register({x:button.x-width/2,y:button.y-height/2,width,height},button.list.map(target=>({
      target:target as Phaser.GameObjects.Text,
      minimum:target.type==='Text'?0.90:target.type==='Rectangle'?0.10:0.25,
    })));
  }

  private updateHudFocus(delta: number): void {
    const enabled=!this.paused&&!this.choosing&&!this.ended;
    const focus: FocusRect[]=[];
    const camera=this.cameras.main,scale=this.scale.width/GAME_WIDTH;
    const protect=(sprite:Phaser.GameObjects.Sprite|Phaser.GameObjects.Image,padding=12)=>{
      if(sprite.active&&sprite.visible)focus.push(projectCombatRect(sprite.getBounds(),camera,scale,padding));
    };
    if(enabled){
      protect(this.player,18);
      for(const enemy of this.enemies.getChildren() as Enemy[]){
        if(enemy.isTargetable&&(enemy===this.boss||Math.hypot(enemy.x-this.player.x,enemy.y-this.player.y)<220)){
          protect(enemy);
          const overlay=enemy.eliteOverlayBounds;
          if(overlay)focus.push(projectCombatRect(overlay,camera,scale,4));
          const tell=enemy.eliteTelegraph;
          const aim=enemy.rangedTelegraph;
          const bite=enemy.meleeTelegraph;
          if(bite){const bx=bite.x+bite.dx*bite.length,by=bite.y+bite.dy*bite.length;focus.push(projectCombatRect({x:Math.min(bite.x,bx),y:Math.min(bite.y,by),width:Math.abs(bx-bite.x),height:Math.abs(by-bite.y)},camera,scale,12));}
          if(aim){const ax=aim.origin.x,ay=aim.origin.y,bx=ax+aim.x*72,by=ay+aim.y*72;focus.push(projectCombatRect({x:Math.min(ax,bx),y:Math.min(ay,by),width:Math.abs(bx-ax),height:Math.abs(by-ay)},camera,scale,8));}
          if(tell)focus.push(projectCombatRect({x:tell.x-tell.radius,y:tell.y-tell.radius,width:tell.radius*2,height:tell.radius*2},camera,scale,4));
        }
      }
      for(const projectile of this.projectiles){
        if(projectile.fromEnemy&&Math.hypot(projectile.sprite.x-this.player.x,projectile.sprite.y-this.player.y)<180)protect(projectile.sprite,16);
      }
    }
    this.hudFocus.update(focus,delta,enabled);
    this.virtual?.updateCombatFocus(focus,delta,enabled);
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
    const existing = new Set(this.children.list);
    this.hpTrail = 1;
    this.abilityTexts = [];
    this.abilityNames = [];
    this.bloomGlyphKey = '';
    const ink = (x: number, y: number, text: string, size = '12px', color: string = UI.textDim) =>
      this.add.text(x, y, text, { fontFamily: UI_FONT, fontSize: size, color }).setDepth(500);
    const plate = this.add.graphics().setDepth(490);
    drawRootFrame(plate, 20, 20, 304, 100, UI.teal);
    const progressPlate = this.add.graphics().setDepth(490);
    drawRootFrame(progressPlate, GAME_WIDTH - 256, 20, 236, 100, UI.accent);
    // A grounded gameplay portrait ties the HUD to the actual protagonist.
    plate.fillStyle(0x172429, 1).fillRect(35, 35, 54, 66);
    plate.lineStyle(1, UI.teal, 0.25).strokeRect(35, 35, 54, 66);
    const portrait = this.heroPortrait = this.add.image(62, 68, portraitKey(this.player.classId)).setScale(0.4).setDepth(500);
    this.awakeningText = ink(304, 97, '', '10px', UI.textGood).setOrigin(1,0).setVisible(false).setStroke('#070a10',2);
    const classLabel = ink(104, 32, i18n.className(this.player.classId), '17px', UI.text);
    const vitalLabel = ink(304, 35, t('run_vital'), '10px', UI.textGood).setOrigin(1, 0);
    this.hudText = ink(304, 57, '', '14px', UI.text).setOrigin(1, 0).setStroke('#070a10',2);
    this.killsText = ink(104, 96, '', '11px');
    this.hpBar = this.add.graphics().setDepth(500);

    this.floorText = ink(GAME_WIDTH - 236, 32, '', '18px', UI.text);
    this.elapsedText = ink(GAME_WIDTH - 36, 36, '00:00', '12px').setOrigin(1, 0).setStroke('#070a10',2);
    const progressLabel = ink(GAME_WIDTH - 236, 64, t('run_progress'), '10px');
    this.floorProgressText = ink(GAME_WIDTH - 124, 64, '0%', '10px', UI.textGood).setOrigin(1, 0).setStroke('#070a10',2);
    this.progressBar = this.add.graphics().setDepth(500);
    this.pauseButton = createTextButton(this, GAME_WIDTH - 62, 92, t('run_pause'), () => {
      if (!this.paused) this.togglePause();
    }, { width: 64, height: 32, fontSize: '12px', color: UI.panel, stroke: UI.root, depth: 530 });

    this.abilityRoot = this.add.container(0, 0).setDepth(500);
    const frames = this.add.graphics();
    const glyphs = this.abilityGlyphs = this.add.graphics();
    const abilityDecor: Phaser.GameObjects.GameObject[] = [];
    this.abilityShade = this.add.graphics();
    this.cdBar = this.add.graphics();
    this.abilityRoot.add([frames, glyphs, this.abilityShade, this.cdBar]);
    const labels = [t('run_atk'), t('run_dash'), t(`class_${this.player.classId}_skill`)];
    const keys = ['LMB', 'SHIFT', 'Q'];
    const accents = [UI.bone, UI.teal, UI.accent];
    for (let i = 0; i < 3; i++) {
      const x = 496 + i * 100;
      drawRootFrame(frames, x, 600, 88, 94, accents[i]);
      frames.fillStyle(UI.panelAlt, 1).fillRect(x+9, 607, keys[i].length * 6 + 10, 15);
      const key = ink(x+14, 609, keys[i], '9px');
      drawAbilityGlyph(glyphs, x+44, 637, i, accents[i]);
      const label = ink(x+44, 655, labels[i], '12px', UI.text).setOrigin(0.5, 0);
      const state = ink(x+44, 676, '', '10px', UI.textGood).setOrigin(0.5, 0).setStroke('#070a10',2);
      this.abilityRoot.add([key, label, state]);
      abilityDecor.push(key,label);
      this.abilityTexts.push(state);
      this.abilityNames.push(label);
    }
    this.identityRoot = this.add.container(0, 0).setDepth(500);
    const identity = this.add.graphics();
    drawRootFrame(identity, 20, 628, 222, 66, UI.teal, 0.88);
    const seed = this.add.image(46, 658, 'icon_seed').setScale(1);
    const name = ink(70, 640, i18n.className(this.player.classId), '14px', UI.text);
    const stage = ink(70, 665, `${t('run_seed_link')}  /  ${saveSystem.seedStage}`, '11px', UI.textGood);
    this.identityRoot.add([identity, seed, name, stage]);
    this.abilityRoot.setVisible(!isTouchLikeDevice());
    this.identityRoot.setVisible(!isTouchLikeDevice());

    this.bannerText = ink(GAME_WIDTH / 2, 132, '', '26px', UI.text).setOrigin(0.5).setAlpha(0).setDepth(520);
    const bannerRoot = this.add.container(0,0,[this.bannerText]).setDepth(520);
    this.hudFocus.register({x:20,y:20,width:304,height:100},[
      {target:plate,minimum:0.06},{target:portrait,minimum:0.12},{target:classLabel,minimum:0.22},
      {target:vitalLabel,minimum:0.22},{target:this.killsText,minimum:0.30},{target:this.awakeningText,minimum:0.22},
      {target:this.hpBar,minimum:0.85},{target:this.hudText,minimum:0.90},
    ]);
    this.hudFocus.register({x:1024,y:20,width:236,height:100},[
      {target:progressPlate,minimum:0.06},{target:this.floorText,minimum:0.30},
      {target:progressLabel,minimum:0.30},{target:this.floorProgressText,minimum:0.70},
      {target:this.elapsedText,minimum:0.70},{target:this.progressBar,minimum:0.70},
    ]);
    const abilityLayers: PeekLayer[] = [{target:frames,minimum:0.05},{target:glyphs,minimum:0.16},
      {target:this.abilityShade,minimum:0.06},{target:this.cdBar,minimum:0.85}];
    for(const target of abilityDecor)abilityLayers.push({target:target as Phaser.GameObjects.Text,minimum:0.30});
    for(const target of this.abilityTexts)abilityLayers.push({target,minimum:0.90});
    this.hudFocus.register({x:490,y:595,width:300,height:105},abilityLayers);
    this.hudFocus.register({x:20,y:628,width:222,height:66},[{target:this.identityRoot,minimum:0.08}]);
    this.hudFocus.register({x:300,y:118,width:680,height:54},[{target:bannerRoot,minimum:0.12}]);
    this.registerButtonFocus(this.pauseButton,64,32);
    // Only parent top-level objects: descendants must not be reparented out of their cards.
    this.addHudObjects(this.children.list.filter(object => !existing.has(object)));
  }

  private clearPursuitCue(): void {
    this.pursuitCue=undefined;this.meleeDebtCue=undefined;this.guardCue=undefined;
    this.combat?.showGuardOpportunity(this.player);
    this.combat?.showBloodbrandFocus(this.player);
    this.combat?.showShadeReturn(this.player);
    this.combat?.showPursuitOpportunity(this.player);
    this.combat?.clearReprisalCue();
    this.pursuitText?.setText('');
    if (this.player.classId === 'thorn' && this.abilityNames[2]) {
      this.updateBloomAbility(thornBloomCue({active:false,unlocked:false,summary:{targets:0,ripe:0},remaining:0}));
    }
  }

  private setPursuitLabel(text: string, alpha: number, color: string): void {
    const label=this.pursuitText;
    if (!label) return;
    if (label.text!==text) label.setText(text);
    if (label.style.color!==color) label.setColor(color);
    label.setAlpha(alpha);
  }

  private findWardenGuardOpportunity(): GuardOpportunity | undefined {
    const p=this.player,guard=p.hasBulwark;
    if(p.classId!=='warden' || p.dead || this.ended || this.paused || this.choosing || p.isDashing || p.reprisalDamage>0 || !(guard?p.reprisalCanEarn:p.skillReady))return;
    const self=this;
    function* sources():Generator<GuardSource> {
      for(const shot of self.projectiles)if(shot.fromEnemy)yield{x:shot.sprite.x,y:shot.sprite.y,vx:shot.vx,vy:shot.vy,life:shot.life,damage:shot.damage,active:shot.sprite.active,delay:0,kind:'projectile'};
      for(const enemy of self.enemies.getChildren() as Enemy[]) {
        const tell=enemy.rangedTelegraph;
        if(!enemy.active || !enemy.isTargetable || !tell)continue;
        yield{x:tell.origin.x,y:tell.origin.y,vx:tell.x*RANGED_SHOT_SPEED,vy:tell.y*RANGED_SHOT_SPEED,
          life:RANGED_SHOT_LIFETIME,damage:enemy.damage,delay:Math.max(0,1-tell.progress)*RANGED_WINDUP_MS,active:true,kind:'tell',body:{x:enemy.x,y:enemy.y,radius:enemy.hitRadius}};
      }
    }
    return findGuardOpportunity(sources(),this.wallRects,{x:p.x,y:p.y,hp:p.stats.hp,armor:p.stats.armor},{
      minETA:Math.max(guard?80:GUARD_OPPORTUNITY.minETA,p.invulnerabilityRemaining+GUARD_OPPORTUNITY.safety),
      maxETA:guard?Math.min(GUARD_OPPORTUNITY.maxETA,p.bulwarkRemaining-GUARD_OPPORTUNITY.safety):GUARD_OPPORTUNITY.maxETA,
      openingBlast:!guard,
    },this.cameras.main.worldView);
  }

  private currentBloomCue(): ThornBloomCue {
    return thornBloomCue({
      active: this.player.active && !this.player.dead && !this.ended && !this.choosing,
      unlocked: this.player.classId === 'thorn' && !!this.build?.has('thorn_seeds'),
      summary: bloomSummary(this.marks, e => e.active && e.isTargetable),
      remaining: this.player.cooldownRemaining('skill'),
    });
  }

  private updateBloomAbility(cue: ThornBloomCue): void {
    const name = cue.detonate ? t('thorn_bloom_action') : t('class_thorn_skill');
    const label = this.abilityNames[2];
    if (label.text !== name) {
      label.setText(name).setFontSize(12);
      if (label.width > 76) label.setFontSize(11);
    }
    const state = !cue.active ? '' : !cue.ready ? `${(this.player.cooldownRemaining('skill')/1000).toFixed(1)}s` :
      cue.detonate ? t(cue.ripe > 0 ? 'thorn_bloom_ripe_ready' : 'thorn_bloom_seeded_ready', {count:cue.ripe || cue.targets}) : t('run_ready');
    const color = !cue.ready ? UI.textDim : cue.emphasis ? '#e5dda0' : UI.textGood;
    const status = this.abilityTexts[2];
    if (status.text !== state) {
      status.setText(state).setFontSize(10);
      if (status.width > 76) status.setFontSize(9);
    }
    if (status.style.color !== color) status.setColor(color);
    this.virtual.updateSkillCue(cue.detonate ? t('thorn_bloom_action') : t('btn_skill'), cue.emphasis);
    const glyphKey = `${cue.detonate}:${cue.ripe > 0}:${cue.ready}`;
    if (this.bloomGlyphKey !== glyphKey) {
      this.bloomGlyphKey = glyphKey;
      const glyphs = this.abilityGlyphs.clear();
      drawAbilityGlyph(glyphs, 540, 637, 0, UI.bone);
      drawAbilityGlyph(glyphs, 640, 637, 1, UI.teal);
      if (cue.detonate) drawBloomGlyph(glyphs, 740, 637, cue.ripe > 0, cue.emphasis ? 0xe5dda0 : cue.ready ? 0x9dcc8b : 0x7f8c83);
      else drawAbilityGlyph(glyphs, 740, 637, 2, UI.accent);
    }
  }

  private updatePursuitCue(bloom?: ThornBloomCue): void {
    this.pursuitCue=undefined;this.meleeDebtCue=undefined;this.guardCue=undefined;
    this.combat?.showGuardOpportunity(this.player);
    this.combat?.showBloodbrandFocus(this.player);
    this.combat?.showShadeReturn(this.player);
    const p=this.player;
    if (p.dead || this.ended || this.choosing) { this.clearPursuitCue(); return; }
    if (p.classId==='warden') {
      this.combat?.showPursuitOpportunity(p);
      if (p.reprisalDamage>0) {
        const stage=p.hasBufferedAttack?'buffered':p.wantAttack?'release':!p.attackReady||p.isDashing?'recover':'ready';
        const name=this.build?.has('warden_rootline')?mutationName(MUTATIONS.find(m=>m.id==='warden_rootline')!):t('warden_counter');
        this.setPursuitLabel(`${name} +${p.reprisalDamage} · ${t(`warden_counter_${stage}`)}`,Math.min(1,p.reprisalRemaining/180),stage==='ready'?'#d7ebcd':'#aacbc4');
      } else {
        const opportunity=this.findWardenGuardOpportunity();
        if(opportunity) {
          const stage=p.hasBulwark?'hold':'ready';this.guardCue={...opportunity,stage};
          const key=isTouchLikeDevice()?t('warden_guard_touch'):'Q';
          this.setPursuitLabel(stage==='hold'?t('warden_guard_hold'):`${key} · ${t('warden_guard_ready')}`,1,stage==='hold'?'#ddd9ad':'#b9d9cd');
          this.combat?.showGuardOpportunity(p,this.guardCue);
        } else this.setPursuitLabel('',0,'#aacbc4');
      }
      return;
    }
    if (p.classId==='thorn') {
      this.combat?.showPursuitOpportunity(p);
      const cue=bloom ?? this.currentBloomCue();
      if (!cue.detonate) { this.setPursuitLabel('',0,'#adcc9c'); return; }
      const key=isTouchLikeDevice()?t('thorn_bloom_touch'):'Q';
      const action=cue.ready?`${key} ${t('thorn_bloom_ready')}`:`${key} ${(Math.ceil(p.cooldownRemaining('skill')/100)/10).toFixed(1)}s`;
      this.setPursuitLabel(`${t('thorn_seeded')} ${cue.targets} · ${t('thorn_ripe')} ${cue.ripe} · ${action} · ${t('thorn_bloom_range')}`,1,cue.emphasis?'#e5dda0':'#adcc9c');
      return;
    }
    if(p.classId==='shade') {
      this.combat?.showPursuitOpportunity(p);
      if(p.shadowReturnAvailable) {
        const moving=p.moveIntent.lengthSq()>0.01,dir=moving?p.moveIntent:p.shadowReturnDirection!;
        const length=Math.hypot(dir.x,dir.y)||1;
        this.combat?.showShadeReturn(p,{dx:dir.x/length,dy:dir.y/length,ready:p.dashReady,remaining:p.shadowReturnRemaining});
        const key=isTouchLikeDevice()?t('shade_return_touch'):'SHIFT';
        const text=p.dashReady?`${key} · ${t(moving?'shade_return_direction':'shade_return_back')}`:
          `${t('shade_return_wait')} · ${(Math.ceil(p.cooldownRemaining('dash')/100)/10).toFixed(1)}s`;
        this.setPursuitLabel(text,Math.min(1,p.shadowReturnRemaining/120),p.dashReady?'#d8c7f3':'#b2a6c4');
      } else this.setPursuitLabel(p.isStealthed&&!p.isDashing?t('shade_return_hidden'):'',1,'#b2a6c4');
      return;
    }
    if (p.isPursuing) {
      this.combat?.showPursuitOpportunity(p);
      const brand=this.pursuitBrand;
      if (brand) {
        const e=brand.target,v=this.cameras.main.worldView;
        if(e.active&&e.isTargetable&&v.contains(e.x,e.y)&&this.navigation?.clearLine(p.x,p.y,e.x,e.y))
          this.combat?.showBloodbrandFocus(p,{x:e.x,y:e.y,radius:e.hitRadius,pulses:brand.pulses});
      }
      this.setPursuitLabel(brand?t('reaver_focus_committed',{pulses:brand.pulses}):t('reaver_pursuit_active'),1,'#edafa0');
      return;
    }
    const melee=this.findReaverMeleeDebt();
    if (melee) {
      const stage=pursuitCueStage(true,p.wantAttack,p.hasBufferedAttack,p.cooldownRemaining('attack'));
      this.meleeDebtCue={...melee,stage};
      const source=t(this.marks.get(melee.target)?.relay?'reaver_cue_relay':'reaver_cue_wound');
      this.setPursuitLabel(`${source} · ${t(`reaver_melee_${stage}`)}`,stage==='ready'?1:0.85,stage==='ready'?'#ffe0bc':'#c7b2aa');
      this.combat?.showPursuitOpportunity(p,{x:melee.target.x,y:melee.target.y,radius:melee.target.hitRadius,travel:0,dx:0,dy:0,stage});
      return;
    }
    const actual=this.findReaverPursuitChoice();
    const choice=actual ?? this.findReaverPursuitChoice(true);
    const focus=this.bloodFocus.current;
    const inherited=!!choice && choice.pulses>0 && this.marks.get(choice.target)?.relay===true;
    // Show the next inherited target even while recovering; never label recovery as ready.
    // Ordinary wounds retain the original short outcome display.
    if(focus && focus.stage!=='committed' && !inherited && (!actual || !p.attackReady)) {
      this.combat?.showPursuitOpportunity(p);
      this.setPursuitLabel(t(`reaver_focus_${focus.stage}`,{pulses:focus.pulses}),Math.min(1,focus.remaining/90),focus.stage==='hit'?'#ffe0bc':'#c8aaa0');
      return;
    }
    if (!choice) {
      // No global wound reminder when there is no visible, aimed-at opportunity.
      this.combat?.showPursuitOpportunity(p);
      this.setPursuitLabel(p.pursuitAvailable?t('reaver_pursuit_wait'):'',Math.min(1,p.pursuitRemaining/200),'#bba5a0');
      return;
    }
    const stage=pursuitCueStage(!!actual,p.wantAttack,p.hasBufferedAttack,p.cooldownRemaining('attack'));
    this.pursuitCue={...choice,stage};
    const source=t(inherited?'reaver_cue_relay':choice.pulses>0?'reaver_cue_wound':'reaver_cue_kill');
    this.setPursuitLabel(`${source} · ${t(`reaver_cue_${stage}`)}`,stage==='ready'?1:0.85,stage==='ready'?'#ffe0bc':'#c7b2aa');
    const dir=actual?p.moveIntent:{x:choice.target.x-p.x,y:choice.target.y-p.y};
    this.combat?.showPursuitOpportunity(p,{
      x:choice.target.x,y:choice.target.y,radius:choice.target.hitRadius,
      travel:choice.travel,dx:dir.x,dy:dir.y,stage,
    });
  }

  private updateHud(delta = 16.67): void {
    const stats = this.player.stats;
    const bloom = this.player.classId === 'thorn' ? this.currentBloomCue() : undefined;
    this.updatePursuitCue(bloom);
    if(this.chainText&&this.chainBar){
      const count=this.chain.count;this.chainText.setText(count>=2?`${t('feel_chain')} × ${count}`:'').setAlpha(Math.min(1,this.chain.remaining/500));
      this.chainBar.clear();if(count>=2)this.chainBar.fillStyle(CLASSES[this.player.classId].color,0.75).fillRect(590,189,100*this.chain.remaining/this.chain.duration,2);
    }
    if (this.boss && this.bossBar && this.bossText) {
      this.bossBar.clear().fillStyle(0x181523,0.95).fillRect(430,78,420,12);
      this.bossBar.fillStyle(this.boss.isExposed?0xf4cf89:this.boss.phase===2?0xe68a68:0x8bad8b,1).fillRect(432,80,416*Math.max(0,this.boss.hp/this.boss.maxHp),8);
      this.bossText.setText(`${t('boss_name')}  ·  ${t('boss_phase')} ${this.boss.phase}`);
      this.bossCueText?.setText(t(`boss_cue_${this.boss.actionCue}`)).setColor(this.boss.isExposed?'#f4cf89':this.boss.actionCue==='volley'?'#c59be8':'#c0a69e');
    }
    const ratio = Phaser.Math.Clamp(stats.hp / stats.maxHp, 0, 1);
    this.hpTrail = Math.max(ratio, this.hpTrail - delta / 1400);
    this.hpBar.clear();
    this.hpBar.fillStyle(UI.panelAlt, 1).fillRect(104, 79, 200, 9);
    this.hpBar.fillStyle(UI.accentHot, 0.65).fillRect(104, 79, 200 * this.hpTrail, 9);
    this.hpBar.fillStyle(ratio > 0.35 ? UI.teal : UI.accentHot, 1).fillRect(104, 79, 200 * ratio, 9);
    // Segments remain readable without relying on a red/green color distinction.
    this.hpBar.lineStyle(1, UI.bg, 0.8);
    for (let i=1;i<5;i++) this.hpBar.lineBetween(104+i*40,79,104+i*40,88);
    const line = `${Math.ceil(stats.hp)} / ${stats.maxHp}`;
    if (line !== this.lastHudLine) {
      this.lastHudLine = line;
      this.hudText.setText(line);
      this.hudText.setColor(ratio > 0.35 ? UI.text : '#ff9f9a');
    }
    const kills = `${t('run_kills')}  ${this.kills}`;
    if (this.killsText.text !== kills) this.killsText.setText(kills);
    const time = Math.floor(this.timeAlive);
    const clock = `${String(Math.floor(time/60)).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`;
    if (this.elapsedText.text !== clock) this.elapsedText.setText(clock);

    const killGoal = Math.max(1, this.floor * 12);
    const progress = Phaser.Math.Clamp(this.boss ? 1-this.boss.hp/this.boss.maxHp : Math.max(this.floorTimer / FLOOR_DURATION_MS, this.floorKills / killGoal), 0, 1);
    this.progressBar.clear().fillStyle(UI.panelAlt, 1).fillRect(GAME_WIDTH-236, 88, 112, 5);
    this.progressBar.fillStyle(UI.accent, 1).fillRect(GAME_WIDTH-236, 88, 112 * progress, 5);
    const percent = this.boss ? t('boss_progress') : `${Math.floor(progress*100)}%`;
    if (this.floorProgressText.text !== percent) this.floorProgressText.setText(percent);
    const floorLine = this.boss ? t('boss_floor') : `${t('run_floor')}  ${String(this.floor).padStart(2,'0')} / 03`;
    if (floorLine !== this.lastFloorLine) {
      this.lastFloorLine = floorLine;
      this.floorText.setText(floorLine);
    }

    const touch = this.virtual.isVisible;
    this.abilityRoot.setVisible(!touch);
    this.identityRoot.setVisible(!touch);
    this.cdBar.clear();this.abilityShade.clear();
    const actions = ['attack', 'dash', 'skill'] as const;
    const accents = [UI.bone, UI.teal, UI.accent];
    actions.forEach((action, i) => {
      const remaining = this.player.cooldownRemaining(action);
      const duration = action === 'attack' ? stats.attackCooldown : action === 'dash' ? stats.dashCooldown : stats.skillCooldown;
      const ready = remaining <= 0;
      const fraction = Phaser.Math.Clamp(remaining / Math.max(1, duration), 0, 1);
      const x = 496 + i * 100;
      if (!ready) this.abilityShade.fillStyle(0x05060d, 0.75).fillRect(x+6, 624, 76, 28*fraction);
      this.cdBar.fillStyle(UI.panelAlt, 1).fillRect(x+12, 671, 64, 2);
      this.cdBar.fillStyle(accents[i], ready ? 0.9 : 0.45).fillRect(x+12, 671, 64*(1-fraction), 2);
      const label = ready ? t('run_ready') : `${(remaining/1000).toFixed(1)}s`;
      if (!(i === 2 && bloom) && this.abilityTexts[i].text !== label) this.abilityTexts[i].setText(label).setColor(ready ? UI.textGood : UI.textDim);
    });
    if (bloom) this.updateBloomAbility(bloom);
    if (touch) this.virtual.updateCooldowns(actions.map(action => {
      const duration = action === 'attack' ? stats.attackCooldown : action === 'dash' ? stats.dashCooldown : stats.skillCooldown;
      return 1 - Phaser.Math.Clamp(this.player.cooldownRemaining(action) / Math.max(1, duration), 0, 1);
    }));
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

  private floatText(x: number, y: number, msg: string, color: string, kind: CombatTextKind = 'notice', owner?: object): void {
    const hurt=/^-\d+$/.test(msg);
    this.combatText?.show({x,y,text:msg,color,kind:hurt?'hurt':kind,owner:owner??(hurt?this.player:undefined)});
  }

  private togglePause(): void {
    if (this.ended || this.choosing || (this.paused && isPortraitBlocked())) return;
    this.paused = !this.paused;
    this.audio?.setSuspended(this.paused);
    this.pendingAttack=false;this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;this.player.clearActionBuffers?.();
    this.pauseButton.setVisible(!this.paused);
    if (this.paused) {
      this.clearPursuitCue();
      this.physics.world.pause();
      // Avoid anims.pauseAll() — global and can break later scenes/UI.
      this.player.setVelocity(0, 0);
      this.setActorsAnimsPaused(true);
      this.virtualVisibleBeforePause = this.virtual?.isVisible ?? false;
      this.virtual?.setSuspended(true);
      this.buildPauseMenu();
    } else {
      if(this.hitStopMs>0){this.physics.world.pause();this.setActorsAnimsPaused(true);}
      else{this.player.resumePursuit();this.physics.world.resume();this.setActorsAnimsPaused(false);}
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
    const local=new Set<Phaser.GameObjects.GameObject>([...this.children.list,this.player,...this.enemies.getChildren()]);
    for(const object of local){
      const actor=object as Phaser.GameObjects.Sprite;
      if(!actor?.anims)continue;
      if(flag)actor.anims.pause();else actor.anims.resume();
    }
  }

  /** Auto-pause when a touch device rotates to portrait (DOM overlay covers the game). */
  pauseForPortrait(): void {
    if (this.ended || this.paused || this.choosing) return;
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
    root.add(this.add.text(640,492,t('feel_pause_hint'),{fontFamily:UI_FONT,fontSize:'12px',color:UI.textDim}).setOrigin(0.5).setScrollFactor(0));

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
    const key = this.floor === 4 ? 'run_boss_ground_baked' : 'run_ground_baked';
    if (!this.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = this.mapW;
      canvas.height = this.mapH;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      for (let ty = 0; ty < this.mapRows; ty++) {
        for (let tx = 0; tx < this.mapCols; tx++) {
          const variant = ((tx * 73856093 ^ ty * 19349663) >>> 4) % 4;
          const src = this.textures.get(`tile_floor_${variant}`).getSourceImage() as
            | HTMLCanvasElement
            | HTMLImageElement;
          ctx.drawImage(src, 0, 0, 16, 16, tx * TILE, ty * TILE, TILE, TILE);

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

      // Dry roots grow along the ruins, never across the central combat area.
      const rootLine = (ax: number, ay: number, bx: number, by: number, color: string, width = 2) => {
        const count = Math.max(Math.abs(bx-ax), Math.abs(by-ay));
        ctx.fillStyle = color;
        for (let i=0;i<=count;i++) {
          const t = count ? i/count : 0;
          ctx.fillRect(Math.round(ax+(bx-ax)*t), Math.round(ay+(by-ay)*t), width, width);
        }
      };
      for (const [tx, ty, w, h] of (this.floor === 4 ? [] : PILLARS)) {
        const x = tx*TILE+6, y = ty*TILE+6;
        const length = Math.min(h*TILE-12, 104);
        rootLine(x+8,y,x+2,y+length,'#161b22',4);
        rootLine(x+8,y,x+2,y+length,'#666650');
        rootLine(x+5,y+24,x+Math.min(w*TILE-12,36),y+10,'#77735a');
        rootLine(x+4,y+50,x+18,y+64,'#454d40');
        ctx.fillStyle = '#507b68'; ctx.fillRect(x+5,y+24,3,3);
      }
      if (this.floor === 4) {
        ctx.strokeStyle = '#48594d'; ctx.lineWidth = 3;
        for (const radius of [95,180,275]) {
          ctx.beginPath();
          for(let i=0;i<=48;i++) { const a=i/48*Math.PI*2; const x=this.mapW/2+Math.cos(a)*radius,y=this.mapH/2+Math.sin(a)*radius*0.75; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
          ctx.stroke();
        }
        ctx.fillStyle='#b0926b';
        for(let i=0;i<12;i++) {const a=i/12*Math.PI*2;ctx.fillRect(this.mapW/2+Math.cos(a)*180-3,this.mapH/2+Math.sin(a)*135-3,6,6);}
      }
      this.textures.addCanvas(key, canvas);
    }
    this.groundImage = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  /** Wall layout in tile units [tx, ty, w, h]: border ring + inner pillars. */
  private getWallBlocks(): Array<readonly [number, number, number, number]> {
    if (this.floor === 4) return [[0,0,56,12],[0,26,56,12],[0,12,16,14],[40,12,16,14]];
    return [
      [0, 0, this.mapCols, 1],
      [0, this.mapRows - 1, this.mapCols, 1],
      [0, 0, 1, this.mapRows],
      [this.mapCols - 1, 0, 1, this.mapRows],
      ...PILLARS,
    ];
  }

  private buildWalls(reuse = false): void {
    if (reuse && this.walls) this.walls.clear(true,true);
    else this.walls = this.physics.add.staticGroup();
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
    this.navigation=new ArenaNavigation(this.mapCols*2,this.mapRows*2,TILE/2,this.wallRects);
  }

  private pointInWall(x: number, y: number): boolean {
    for (const rect of this.wallRects) {
      if (rect.contains(x, y)) return true;
    }
    return false;
  }

  private endRun(abandoned: boolean, victory = false): void {
    if (this.ended) return;
    this.ended = true;
    this.hitStopMs=this.hitStopCooldown=0;
    this.player.clearActionBuffers?.();this.pendingAttack=false;
    if(victory)this.audio?.play('victory',this.player.classId);
    this.paused = false;
    this.closeMutationChoice();
    this.pursuitBrand=undefined;this.bloodFocus.clear();
    this.player.stopCombat();
    this.marks.clear();this.marksInk?.clear();
    this.clearRootlines();
    this.clearPursuitCue();
    for (const e of this.enemies.getChildren() as Enemy[]) e.stopCombat();

    try {
      this.physics.world.resume();
    } catch {
      /* ignore */
    }
    this.destroyPauseMenu();
    this.virtual?.setSuspended(true);
    this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;
    this.pauseButton.setVisible(false);
    this.input.enabled = false;

    runState.deathSettled = false;
    runState.lastRun = {
      floor: this.floor,
      kills: this.kills,
      timeAliveSec: this.timeAlive,
      damageDealt: this.damageDealt,
      classId: this.player.classId,
      outcome: victory ? 'victory' : abandoned ? 'abandoned' : 'death',
      mutations: [...(this.build?.owned ?? [])],
      bestChain:this.chain.best,
      eliteBreaks:this.eliteStats.breaks,
    };

    if (abandoned) {
      // Manual quit — skip the death ceremony, settle fast.
      this.cameras.main.fadeOut(250, 8, 4, 12);
      this.time.delayedCall(300, () => this.scene.start('Death'));
    } else {
      this.showBanner(t(victory ? 'chapter_victory' : 'death_title'), victory ? UI.teal : UI.accentHot);
      if(victory)this.time.delayedCall(800,()=>this.cameras.main.fadeOut(500,8,4,12));
      else this.cameras.main.fadeOut(500, 8, 4, 12);
      this.time.delayedCall(victory?1400:650, () => this.scene.start('Death'));
    }
  }

  private shutdown(): void {
    this.hudFocus.clear();
    this.audio?.destroy();this.audio=undefined;
    this.clearRootlines();
    this.hitStopMs=this.hitStopCooldown=0;this.pendingAttack=false;this.worldAttack.clear();this.ambushInputs.clear();this.orderedAmbushDash=false;
    this.closeMutationChoice();
    this.combat?.destroy(); this.combat=undefined;
    this.combatText?.destroy(); this.combatText=undefined;
    this.marks.clear();
    this.pursuitBrand=undefined;this.bloodFocus.clear();
    this.decoy=undefined;
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
