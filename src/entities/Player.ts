import Phaser from 'phaser';
import { CLASSES, HERO_TEXTURES, type ClassId } from '../data/classes';
import { awakenedHeroKey } from '../data/awakenings';
import { saveSystem, type PermanentStats } from '../systems/SaveSystem';
import { ThornBloomCast } from '../systems/ThornBloomCast';
import { wardenReleaseFrame } from '../systems/WardenRelease';
import { ReaverPursuit } from '../systems/ReaverPursuit';
import { reaverPounceFrame, reaverCutFrame } from '../systems/ReaverPounce';
import { ShadeReturn } from '../systems/ShadeReturn';
import { shadeAmbushFrame, shadeBackstepFrame } from '../systems/ShadeAction';
import { WardenReprisal, bulwarkPrevented } from '../systems/WardenReprisal';

export type CombatEvent = { type: 'dash' | 'skill' | 'hurt' | 'pursuit'; x: number; y: number }
  | { type: 'guard'; x: number; y: number; gained: number };

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
const HURT_INVULN_MS = 350;
/** Well above every dash boost so Arcade never clamps a dash back to walk speed. */
const BODY_MAX_SPEED = 640;

export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly classId: ClassId;
  stats: PlayerStats;
  private shadow: Phaser.GameObjects.Image;
  private readonly pursuit = new ReaverPursuit();
  private readonly reprisal = new WardenReprisal();
  private readonly shadeReturn = new ShadeReturn();
  get shadowReturnAvailable(): boolean { return this.classId==='shade' && !this.isDead && !this.combatStopped && this.shadeReturn.available; }
  get shadowReturnRemaining(): number { return this.shadowReturnAvailable ? this.shadeReturn.remaining : 0; }
  get shadowReturnDirection(): {x:number;y:number} | undefined { return this.shadowReturnAvailable ? this.shadeReturn.direction : undefined; }
  confirmAmbushHit(): boolean { return this.classId==='shade' && !this.isDead && !this.combatStopped && this.shadeReturn.confirmHit(); }
  finishAmbushStrike(): void { this.shadeReturn.closeStrike(); }
  cancelShadowReturn(): void { this.shadeReturn.clear(); this.cancelShadeAction(); }
  get reprisalDamage(): number { return this.classId==='warden' && !this.isDead && !this.combatStopped && this.reprisal.available ? this.reprisal.damage : 0; }
  get reprisalRemaining(): number { return this.reprisalDamage>0 ? this.reprisal.remaining : 0; }
  get reprisalCap(): number { return this.reprisal.cap; }
  cancelReprisal(): void { this.reprisal.cancel(); this.cancelWardenRelease(); }
  private pursuitWorld?: Phaser.Physics.Arcade.World;
  private combatStopped = false;
  get pursuitAvailable(): boolean { return this.classId === 'reaver' && this.pursuit.available && !this.isDead && !this.combatStopped; }
  get pursuitRemaining(): number { return this.pursuitAvailable ? this.pursuit.remaining : 0; }
  get isPursuing(): boolean { return this.pursuit.active; }
  get pursuitDirection(): {x:number;y:number} { return this.pursuit.active ? this.pursuit.direction : this.facingDir; }
  onEnemyKilled(): void { if (this.classId === 'reaver' && !this.isDead && !this.combatStopped) this.pursuit.earn(); }
  startPursuit(travel: number, paidWound = false): boolean {
    if (this.classId!=='reaver' || this.isDead || this.combatStopped || (!this.pursuitAvailable && !paidWound) || !this.attackReady || this.isDashing || !this.pursuit.start(this.moveIntent.x,this.moveIntent.y,travel,paidWound)) return false;
    this.attackBuffer=0;
    this.cancelReaverPose();this.reaverCutQueued=false;this.reaverPounceTravel=travel;
    this.renderReaverPounce();
    const v=this.pursuit.velocityForStep(this.pursuitStepMs());
    this.setVelocity(v.x,v.y);
    this.combatEvents.push({type:'pursuit',x:this.x,y:this.y});
    return true;
  }
  consumePursuitStrike(): {x:number;y:number} | null {
    const strike=this.pursuit.consumeStrike();this.reaverCutQueued=!!strike;return strike;
  }
  /** Menus zero velocity: restore before resuming physics, not one fixed step late. */
  resumePursuit(): void {
    if (!this.pursuit.active || this.combatStopped || this.isDead) return;
    const v=this.pursuit.velocityForStep(this.pursuitStepMs());
    this.setVelocity(v.x,v.y);
  }
  cancelPursuit(): void {
    const active=this.pursuit.active;
    this.pursuit.cancel();
    this.reaverCutQueued=false;this.reaverPounceTravel=0;this.cancelReaverPose();
    if (active) this.setVelocity(0,0);
  }
  /** End transitions resume physics: detach before that can revive old motion. */
  stopCombat(): void {
    this.combatStopped=true; this.cancelBloomCast(); this.cancelPursuit(); this.cancelReprisal(); this.cancelShadowReturn(); this.clearActionBuffers(); this.setVelocity(0,0);
    this.pursuitWorld?.off(Phaser.Physics.Arcade.Events.WORLD_STEP,this.onPursuitPhysicsStep,this);
  }
  private pursuitStepMs(): number { return 1000/(this.pursuitWorld?.fps || 60); }
  private onPursuitPhysicsStep(deltaSeconds: number): void {
    if (!this.pursuit.active || this.combatStopped || this.isDead) return;
    this.pursuit.advancePhysics(deltaSeconds*1000);
    const v=this.pursuit.velocityForStep(this.pursuitStepMs());
    this.setVelocity(v.x,v.y);
  }
  private facing = new Phaser.Math.Vector2(1, 0);
  private attackTimer = 0;
  private attackBuffer = 0;
  private dashBuffer = 0;
  private skillBuffer = 0;
  queueAttack(elapsedFrameMs = 0): void {
    // Scene input is sampled NOW, but updateEntity still consumes the preceding frame delta.
    // Rebase only this new edge so that its real 140ms window starts at the sample, not last frame.
    const elapsed=Number.isFinite(elapsedFrameMs)?Math.max(0,elapsedFrameMs):0;
    this.attackBuffer=140+elapsed;
  }
  get hasBufferedAttack(): boolean { return this.attackBuffer > 0; }
  clearActionBuffers(): void { this.attackBuffer=this.dashBuffer=this.skillBuffer=0; }

  private readonly bloomCast = new ThornBloomCast();
  /** Called once after actual seed damage, never on Q press or on an empty nova. */
  confirmBloomCast(): void {
    if(this.classId!=='thorn'||this.isDead||this.combatStopped||this.isDashing||this.hitFlashTimer>0)return;
    this.bloomCast.begin(this.combatPoseMotion());this.renderBloomCast();
  }
  private combatPoseMotion(): boolean {
    return saveSystem.feedback.impactMotion && !(typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  cancelBloomCast(): void {
    this.bloomCast.cancel();
    if(this.texture.key==='cast_thorn_bloom'||this.texture.key==='cast_thorn_bloom_awakened'){
      this.setTexture(this.texKey,0);
      if(!this.isDead&&!this.combatStopped)this.play(`${this.texKey}_idle`,true);
    }
  }
  private renderBloomCast(): boolean {
    const frame=this.bloomCast.frame;if(frame===undefined)return false;
    if(this.hitFlashTimer>0||this.isDashing||!this.combatPoseMotion()){this.bloomCast.cancel();return false;}
    const key=this.awakened?'cast_thorn_bloom_awakened':'cast_thorn_bloom';
    this.anims.stop();if(this.texture.key!==key||Number(this.frame.name)!==frame)this.setTexture(key,frame);
    return true;
  }
  private reaverPounceTravel = 0;
  private reaverCutDuration = 0;
  /** One-update visual handoff from an actually consumed pursuit; not attack authorization. */
  private reaverCutQueued = false;
  get reaverTravelTotal(): number { return this.reaverPounceTravel; }
  get reaverTravelRemaining(): number { return this.pursuit.travelRemaining; }
  get reaverCutRemaining(): number { return this.reaverCutDuration>0 ? this.attackPoseTimer : 0; }
  get reaverPoseFrame(): number | undefined {
    return this.pursuit.active ? reaverPounceFrame(this.pursuit.travelRemaining,this.reaverPounceTravel)
      : reaverCutFrame(this.reaverCutRemaining,this.reaverCutDuration);
  }
  private cancelReaverPose(): void {
    const frame=reaverCutFrame(this.reaverCutRemaining,this.reaverCutDuration),duration=this.reaverCutDuration;
    this.reaverCutDuration=0;
    if(this.texture.key==='pounce_reaver'||this.texture.key==='pounce_reaver_awakened') {
      this.setTexture(this.texKey,0);
      if(!this.isDead&&!this.combatStopped) {
        const pose=this.hitFlashTimer>0?'hurt':this.isDashing||this.pursuit.moving?'dash':this.attackPoseTimer>0?'attack':'idle';
        this.play({key:`${this.texKey}_${pose}`,startFrame:pose==='attack'&&frame!==undefined?frame-2:0,
          ...(pose==='attack'&&duration>0?{frameRate:4000/duration}:{})},true);
      }
    }
  }
  private renderReaverPounce(): boolean {
    if(!this.pursuit.active&&this.reaverCutDuration<=0)return false;
    if(this.isDashing||!this.combatPoseMotion()){this.cancelReaverPose();return false;}
    const frame=this.reaverPoseFrame;
    if(frame===undefined){this.reaverCutDuration=0;return false;}
    if(this.hitFlashTimer>0)return false;
    if(this.pursuit.active&&Math.abs(this.pursuit.direction.x)>0.15)this.setFlipX(this.pursuit.direction.x<0);
    const key=this.awakened?'pounce_reaver_awakened':'pounce_reaver';
    this.anims.stop();if(this.texture.key!==key||Number(this.frame.name)!==frame)this.setTexture(key,frame);
    return true;
  }
  private shadeAmbushDuration = 0;
  private shadeBackstepPose = false;
  get shadeAmbushRemaining(): number { return this.shadeAmbushDuration>0 ? this.attackPoseTimer : 0; }
  get shadeBackstepRemaining(): number { return this.shadeBackstepPose ? this.dashActive : 0; }
  private cancelShadeAction(keepBackstep = false): void {
    const phase=shadeAmbushFrame(this.shadeAmbushRemaining,this.shadeAmbushDuration),duration=this.shadeAmbushDuration;
    this.shadeAmbushDuration=0;
    // As before, a still-active dash owns the body over an accepted ordinary attack.
    if(keepBackstep&&this.shadeBackstepPose&&this.isDashing)return;
    this.shadeBackstepPose=false;
    if(this.texture.key.startsWith('strike_shade_ambush')||this.texture.key.startsWith('step_shade_return')){
      this.setTexture(this.texKey,0);
      if(!this.isDead&&!this.combatStopped){
        const pose=this.hitFlashTimer>0?'hurt':this.isDashing?'dash':this.attackPoseTimer>0?'attack':'idle';
        this.play({key:`${this.texKey}_${pose}`,startFrame:pose==='attack'?phase??0:0,
          ...(pose==='attack'&&duration>0?{frameRate:4000/duration}:{})},true);
      }
    }
  }
  private renderShadeAction(): boolean {
    if(this.shadeAmbushDuration<=0&&!this.shadeBackstepPose)return false;
    if(!this.combatPoseMotion()||(this.isDashing&&!this.shadeBackstepPose)){this.cancelShadeAction();return false;}
    const frame=this.shadeBackstepPose?shadeBackstepFrame(this.dashActive,DASH_DURATION_MS):shadeAmbushFrame(this.shadeAmbushRemaining,this.shadeAmbushDuration);
    if(frame===undefined){this.shadeAmbushDuration=0;this.shadeBackstepPose=false;return false;}
    if(this.hitFlashTimer>0)return false;
    const key=(this.shadeBackstepPose?'step_shade_return':'strike_shade_ambush')+(this.awakened?'_awakened':'');
    this.anims.stop();if(this.texture.key!==key||Number(this.frame.name)!==frame)this.setTexture(key,frame);
    return true;
  }
  private attackPoseTimer = 0;
  private wardenReleaseDuration = 0;
  get wardenReleaseRemaining(): number { return this.wardenReleaseDuration > 0 ? this.attackPoseTimer : 0; }
  get wardenReleaseFrame(): number | undefined { return wardenReleaseFrame(this.wardenReleaseRemaining,this.wardenReleaseDuration); }
  private cancelWardenRelease(): void {
    const phase=this.wardenReleaseFrame, duration=this.wardenReleaseDuration;
    this.wardenReleaseDuration=0;
    if(this.texture.key==='strike_warden_reprisal'||this.texture.key==='strike_warden_reprisal_awakened') {
      this.setTexture(this.texKey,0);
      if(!this.isDead&&!this.combatStopped) {
        const pose=this.hitFlashTimer>0?'hurt':this.isDashing?'dash':this.attackPoseTimer>0?'attack':'idle';
        this.play({key:`${this.texKey}_${pose}`,startFrame:pose==='attack'?phase??0:0,
          ...(pose==='attack'?{frameRate:4000/Math.max(1,duration)}:{})},true);
      }
    }
  }
  private renderWardenRelease(): boolean {
    if(this.wardenReleaseDuration<=0)return false;
    const phase=this.wardenReleaseFrame;
    if(phase===undefined) { this.wardenReleaseDuration=0;return false; }
    if(this.isDashing||!this.combatPoseMotion()) { this.cancelWardenRelease();return false; }
    // An already-playing hurt cell keeps priority, but never delays the committed attack clock.
    if(this.hitFlashTimer>0)return false;
    const key=this.awakened?'strike_warden_reprisal_awakened':'strike_warden_reprisal';
    this.anims.stop();if(this.texture.key!==key||Number(this.frame.name)!==phase)this.setTexture(key,phase);
    return true;
  }
  private dashTimer = 0;
  private skillTimer = 0;
  private invulnTimer = 0;
  private hurtCueTimer = 0;
  /** Visual-only readout. It never extends or grants damage protection. */
  get hurtProtectionRemaining(): number { return this.isDead ? 0 : Math.min(this.hurtCueTimer, this.invulnTimer); }
  private dashActive = 0;
  private skillActive = 0;
  private hitFlashTimer = 0;
  private isDead = false;
  private texKey: string;
  private awakened = false;
  get isAwakened(): boolean { return this.awakened; }

  /** Cosmetic only; do not rebuild or resize the Arcade body when changing form. */
  setAwakened(value: boolean): void {
    if (this.awakened === value) return;
    this.awakened = value;
    const oldKey = this.texKey;
    const current = this.anims.currentAnim;
    const pose = current?.key.startsWith(`${oldKey}_`) ? current.key.slice(oldKey.length + 1) : 'idle';
    const index = Math.max(0, (this.anims.currentFrame?.index ?? 1) - 1);
    const paused = this.anims.isPaused;
    this.texKey = value ? awakenedHeroKey(this.classId) : HERO_TEXTURES[this.classId];
    this.play({ key: `${this.texKey}_${pose}`, startFrame: index }, true);
    this.renderBloomCast();
    this.renderWardenRelease();
    this.renderReaverPounce();
    this.renderShadeAction();
    if (paused) this.anims.pause();
  }
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
  forceAmbushCrit = false;
  private combatEvents: CombatEvent[] = [];

  drainCombatEvents(): CombatEvent[] { return this.combatEvents.splice(0); }
  refundCooldowns(dashMs: number, skillMs: number): void {
    this.dashTimer = Math.max(0, this.dashTimer - dashMs);
    this.skillTimer = Math.max(0, this.skillTimer - skillMs);
  }
  get skillIsActive(): boolean { return this.skillActive > 0; }


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
    // 640 > 所有冲刺/暗影步加成，因此不会截断位移，同时避免速度失控。
    body.setMaxSpeed(BODY_MAX_SPEED);

    if (classId === 'reaver') {
      this.pursuitWorld=scene.physics.world;
      this.pursuitWorld.on(Phaser.Physics.Arcade.Events.WORLD_STEP,this.onPursuitPhysicsStep,this);
    }

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

  /** Milliseconds remaining, exposed read-only for the real cooldown HUD. */
  cooldownRemaining(action: 'attack' | 'dash' | 'skill'): number {
    return action === 'attack' ? this.attackTimer : action === 'dash' ? this.dashTimer : this.skillTimer;
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

  get invulnerabilityRemaining(): number { return this.isDead ? 0 : Math.max(this.invulnTimer,this.dashActive); }
  get bulwarkRemaining(): number { return this.hasBulwark ? this.skillActive : 0; }
  get reprisalCanEarn(): boolean { return this.hasBulwark && !this.isDead && !this.combatStopped && this.reprisal.canEarn; }

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
   * Returns true only when the scene must settle an ambush before flushing its ready dash.
   */
  updateEntity(deltaMs: number, attackBeforeDash = false): boolean {
    if (this.isDead || this.combatStopped) {
      this.setVelocity(0, 0);
      this.shadow.setPosition(this.x, this.y + 6);
      this.skillFx?.setVisible(false);
      return false;
    }

    this.reaverCutQueued=false;
    this.pursuit.update(deltaMs);
    this.shadeReturn.update(deltaMs);
    this.reprisal.update(deltaMs);
    this.attackBuffer = Math.max(0,this.attackBuffer-deltaMs);
    this.dashBuffer = this.wantDash ? 140 : Math.max(0,this.dashBuffer-deltaMs);
    this.skillBuffer = this.wantSkill ? 160 : Math.max(0,this.skillBuffer-deltaMs);
    this.attackTimer = Math.max(0, this.attackTimer - deltaMs);
    this.attackPoseTimer = Math.max(0, this.attackPoseTimer - deltaMs);
    this.bloomCast.update(deltaMs);
    this.dashTimer = Math.max(0, this.dashTimer - deltaMs);
    this.skillTimer = Math.max(0, this.skillTimer - deltaMs);
    this.invulnTimer = Math.max(0, this.invulnTimer - deltaMs);
    this.hurtCueTimer = Math.max(0, this.hurtCueTimer - deltaMs);
    this.dashActive = Math.max(0, this.dashActive - deltaMs);
    this.skillActive = Math.max(0, this.skillActive - deltaMs);
    if (!this.hasBulwark) this.reprisal.closeGuard();
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaMs);

    if (this.aimIntent.lengthSq() > 0.01) {
      this.facing.copy(this.aimIntent).normalize();
    } else if (this.moveIntent.lengthSq() > 0.01) {
      this.facing.copy(this.moveIntent).normalize();
    }

    if (Math.abs(this.facing.x) > 0.15) {
      this.setFlipX(this.facing.x < 0);
    }

    if (this.pursuit.active && this.dashActive <= 0) {
      const v=this.pursuit.velocityForStep(this.pursuitStepMs());
      this.setVelocity(v.x,v.y);
    } else if (this.dashActive <= 0) {
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
    let pose = moving ? 'walk' : 'idle';
    // Shared by all professions: movement must not overwrite a combat pose.
    if (this.hitFlashTimer > 0) pose = 'hurt';
    else if (this.dashActive > 0 || this.pursuit.moving) pose = 'dash';
    else if (this.attackPoseTimer > 0) pose = 'attack';
    const animation = `${this.texKey}_${pose}`;
    if(!this.renderShadeAction()&&!this.renderReaverPounce()&&!this.renderWardenRelease()&&!this.renderBloomCast()) {
      const restore=this.texture.key!==this.texKey;
      if(restore)this.setTexture(this.texKey,0);
      if(restore||this.anims.currentAnim?.key!==animation)this.play(animation,true);
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

    // A deliberately earlier fresh ambush may settle before this same-frame dodge.
    // Never reorder a defensive dash-first edge, a held repeat, Q, or an active dash.
    const linkAmbush = attackBeforeDash && this.classId === 'shade' && this.isStealthed &&
      !this.isDashing && this.attackReady && this.hasBufferedAttack && this.skillBuffer <= 0 &&
      this.dashBuffer > 0 && this.dashReady;
    if (!linkAmbush) this.resolveBufferedDash();
    if (this.skillBuffer > 0 && this.skillReady) { this.skillBuffer=0; this.performSkill(); }
    return linkAmbush;
  }

  /** Finish an ordered input sample using only the original, unspent dash buffer. */
  resolveBufferedDash(): void {
    if (this.isDead || this.combatStopped) return;
    if (this.dashBuffer > 0 && this.dashReady) { this.dashBuffer=0; this.performDash(); }
  }

  tryAttack(direction?: {x:number;y:number}, freshPress = true): {
    origin: Phaser.Math.Vector2;
    dir: Phaser.Math.Vector2;
    damage: number;
    crit: boolean;
    /** True only on the attack that consumes Shadow Step stealth. */
    ambush: boolean;
    /** Guard-paid bonus on this one ordinary swing; never multiplied by the crit roll. */
    reprisal: number;
  } | null {
    const pursuitCut=this.reaverCutQueued&&!!direction;this.reaverCutQueued=false;
    if (this.isDead || this.combatStopped || this.pursuit.active || this.attackTimer > 0 || (this.classId==='shade' && this.isStealthed && this.dashActive>0)) return null;
    if (direction) { this.facing.set(direction.x,direction.y); if (Math.abs(direction.x)>0.15) this.setFlipX(direction.x<0); }
    this.cancelBloomCast();
    this.cancelWardenRelease();
    this.cancelReaverPose();
    this.cancelShadeAction(this.isDashing);
    this.attackBuffer = 0;
    this.attackTimer = this.stats.attackCooldown * (this.classId === 'reaver' && this.skillActive > 0 ? 0.8 : 1);
    this.attackPoseTimer = Math.min(250, this.attackTimer);
    if (this.dashActive <= 0 && this.hitFlashTimer <= 0) {
      // All four casting / swing cells fit even the Thorn's faster shot cadence.
      this.play({ key: `${this.texKey}_attack`, frameRate: 4000 / this.attackPoseTimer }, true);
    }

    let dmg = this.stats.damage;
    if (this.classId === 'reaver' && this.skillActive > 0) dmg *= 1.6;
    this.shadeReturn.closeStrike();
    const ambush = this.isStealthed;
    if (ambush) {
      dmg *= 2.2;
      this.skillActive = 0;
      this.shadeReturn.beginStrike(direction?.x??this.facing.x,direction?.y??this.facing.y);
    }

    const crit = (ambush && this.forceAmbushCrit) || Math.random() < this.stats.critChance;
    if (crit) dmg = Math.floor(dmg * 1.75);
    const reprisal=this.classId==='warden' && freshPress && !this.isDashing ? this.reprisal.consume() : 0;
    // This is the already-paid committed swing, including a legitimate miss. Never an extra hit.
    if(reprisal>0 && !this.isDashing && this.combatPoseMotion()) {
      this.wardenReleaseDuration=this.attackPoseTimer;
      this.renderWardenRelease();
    }

    if(pursuitCut&&this.classId==='reaver'&&!this.isDashing&&this.combatPoseMotion()) {
      this.reaverCutDuration=this.attackPoseTimer;this.renderReaverPounce();
    }

    if(ambush&&!this.isDashing&&this.combatPoseMotion()){
      this.shadeAmbushDuration=this.attackPoseTimer;this.renderShadeAction();
    }

    return {
      origin: new Phaser.Math.Vector2(this.x, this.y),
      dir: direction ? new Phaser.Math.Vector2(direction.x,direction.y) : this.facing.clone(),
      damage: Math.floor(dmg)+reprisal,
      crit,
      ambush,
      reprisal,
    };
  }

  applyDamage(amount: number): number {
    if (this.isDead || this.isInvulnerable) return 0;
    this.cancelBloomCast();
    this.cancelWardenRelease();
    const prevented=this.hasBulwark ? bulwarkPrevented(amount,this.stats.armor) : 0;
    if (this.hasBulwark) amount = Math.floor(amount * 0.25);
    const reduced = Math.max(1, amount - this.stats.armor);
    this.combatEvents.push({ type: 'hurt', x: this.x, y: this.y });
    this.cancelPursuit();
    this.cancelShadowReturn();
    this.stats.hp -= reduced;
    this.invulnTimer = HURT_INVULN_MS;
    this.hurtCueTimer = HURT_INVULN_MS;
    this.hitFlashTimer = HIT_FLASH_MS;
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.isDead = true;
      this.stopCombat();
      this.setVelocity(0, 0);
      this.setTint(0x555555);
      this.anims.stop();
    } else {
      const gained=this.reprisal.absorb(prevented);
      if (gained>0) this.combatEvents.push({type:'guard',x:this.x,y:this.y,gained});
      this.play(`${this.texKey}_hurt`, true);
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
    this.bloomCast.cancel();this.wardenReleaseDuration=0;this.reaverCutDuration=0;this.reaverCutQueued=false;
    this.pursuitWorld?.off(Phaser.Physics.Arcade.Events.WORLD_STEP,this.onPursuitPhysicsStep,this);
    this.pursuitWorld=undefined;
    this.pursuit.cancel();
    this.reprisal.cancel();
    this.cancelShadowReturn();
    this.shadow?.destroy();
    this.skillFx?.destroy();
    super.destroy(fromScene);
  }

  private performDash(): void {
    this.cancelShadeAction();
    this.cancelBloomCast();
    this.cancelWardenRelease();
    this.cancelPursuit();
    this.combatEvents.push({ type: 'dash', x: this.x, y: this.y });
    this.dashTimer = this.stats.dashCooldown;
    this.dashActive = DASH_DURATION_MS;
    if (this.hitFlashTimer <= 0) this.play(`${this.texKey}_dash`, true);
    this.invulnTimer = Math.max(this.invulnTimer, DASH_DURATION_MS);
    const back=this.classId==='shade' ? this.shadeReturn.consume() : undefined;
    const dir =
      this.moveIntent.lengthSq() > 0.01
        ? this.moveIntent.clone().normalize()
        : back ? new Phaser.Math.Vector2(back.x,back.y) : this.facing.clone();
    const boost = this.classId === 'shade' ? DASH_BOOST_SHADE : DASH_BOOST;
    this.setVelocity(dir.x * boost, dir.y * boost);
    if(back&&!(this.moveIntent.lengthSq()>0.01)&&this.combatPoseMotion()){
      this.shadeBackstepPose=true;this.renderShadeAction();
    }
  }

  private performSkill(): void {
    this.cancelPursuit();
    this.cancelShadowReturn();
    this.combatEvents.push({ type: 'skill', x: this.x, y: this.y });
    this.skillTimer = this.stats.skillCooldown;
    if (this.classId === 'warden') {
      this.reprisal.begin(this.stats.damage);
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
      if (this.hitFlashTimer <= 0) this.play(`${this.texKey}_dash`, true);
      this.invulnTimer = Math.max(this.invulnTimer, 400);
      const dir =
        this.moveIntent.lengthSq() > 0.01
          ? this.moveIntent.clone().normalize()
          : this.facing.clone();
      this.setVelocity(dir.x * SHADE_SKILL_BOOST, dir.y * SHADE_SKILL_BOOST);
    }
  }
}
