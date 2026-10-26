import Phaser from 'phaser';
import type { Player } from './Player';
import { EliteDuel, ELITE_DUEL, type EliteEvent } from '../systems/EliteDuel';
import { t } from '../i18n/i18n';
import { eliteHammerFrame } from '../systems/EliteHammerStance';
import { saveSystem } from '../systems/SaveSystem';
import { UI_FONT } from '../ui/theme';
import { RangedTell, type RangedEvent } from '../systems/RangedTell';
import { ContactRecovery } from '../systems/ContactRecovery';
import { MeleeTell } from '../systems/MeleeTell';
import { EnemyHitReaction, type EnemyHitKind } from '../systems/EnemyHitReaction';

const HIT_POSE_BASE_FRAMES:Record<string,number>={enemy_crawler:2,enemy_spitter:2,enemy_brute:2,enemy_brute_open:1};

export type EnemyShot = {x:number;y:number;origin?:{x:number;y:number}};

export type EnemyKind = 'crawler' | 'spitter' | 'brute';
/** A decoy exposes targeting information, never a fake Player entity. */
export type EnemyTarget = Pick<Player, 'x' | 'y' | 'dead' | 'isStealthed'>;

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
  private ranged?: RangedTell;
  private rangedInk?: Phaser.GameObjects.Graphics;
  get rangedTelegraph() { return this.ranged?.telegraph; }
  drainRangedEvents(): RangedEvent[] { return this.ranged?.drainEvents() ?? []; }
  private melee?: MeleeTell;
  private meleeInk?: Phaser.GameObjects.Graphics;
  private meleeWorld?: Phaser.Physics.Arcade.World;
  protected get usesMeleeIntent(): boolean { return true; }
  get meleePhase() { return this.contactRecovery.active ? 'recovery' : this.melee?.phase; }
  get meleeTelegraph() {
    if (this.melee?.phase !== 'windup') return undefined;
    const dir = this.melee.direction;
    return { x:this.x, y:this.y+8, dx:dir.x, dy:dir.y,
      length:this.melee.tuning.speed*this.melee.tuning.strike/1000+20, progress:this.melee.windupProgress };
  }
  private contactRecovery = new ContactRecovery();
  private contactInk?: Phaser.GameObjects.Graphics;
  get contactRecoveryRemaining(): number { return this.contactRecovery.remaining; }
  private knockbackMs = 0;
  private alive = true;
  private hitFlashMs = 0;
  private hitReaction = new EnemyHitReaction();
  private hitPoseBase?:{texture:string;frame:string|number};
  private spawnGraceMs = 0;
  private emergeInk?: Phaser.GameObjects.Graphics;
  private duel?: EliteDuel;
  private duelInk?: Phaser.GameObjects.Graphics;
  private duelLabel?: Phaser.GameObjects.Text;
  get isBreakableElite(): boolean { return !!this.duel; }
  get isExposed(): boolean { return !!this.duel?.exposed && this.alive; }
  get incomingDamageMultiplier(): number { return this.duel?.multiplier ?? 1; }
  get canDealContactDamage(): boolean { return !!this.melee?.striking && !this.contactRecovery.active; }
  canDealContactDamageTo(x:number,y:number): boolean {
    return this.canDealContactDamage && (!this.melee || this.melee.facing(x-this.x,y-this.y));
  }
  get eliteTelegraph(): {kind:'circle';x:number;y:number;radius:number;age:number;windup:number;fired:false} | undefined {
    return this.duel?.phase === 'windup' ? {kind:'circle',x:this.duel.x,y:this.duel.y,radius:ELITE_DUEL.radius,age:ELITE_DUEL.windup-this.duel.remaining,windup:ELITE_DUEL.windup,fired:false} : undefined;
  }
  /** Actual translated overhead metadata, separate from the sprite and windup ring. */
  get eliteOverlayBounds(): {x:number;y:number;width:number;height:number} | undefined {
    const label=this.duelLabel,duel=this.duel;
    if(!duel || !this.isTargetable || !this.active || !this.visible || !label?.active || !label.visible)return undefined;
    const bounds=label.getBounds(),half=duel.anchored?20:14;
    const left=Math.min(bounds.x,this.x-half),right=Math.max(bounds.right,this.x+half);
    const top=Math.min(bounds.y,this.y-72),bottom=Math.max(bounds.bottom,this.y-(duel.anchored?60:68));
    return {x:left,y:top,width:right-left,height:bottom-top};
  }
  drainEliteEvents(): EliteEvent[] { return this.duel?.drainEvents() ?? []; }

  protected shadow: Phaser.GameObjects.Image;
  private hpBar?: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: EnemyKind,
    floor: number,
    elite = false,
    wakeDelayMs = 0,
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

    if(kind==='spitter'){
      this.ranged=new RangedTell(elite?1100:1400);
      this.rangedInk=scene.add.graphics().setDepth(12);
    }
    if (elite && kind === 'brute') {
      this.duel = new EliteDuel(this.maxHp);
      this.duelInk = scene.add.graphics().setDepth(3);
      this.duelLabel = scene.add.text(x,y-53,'',{fontFamily:UI_FONT,fontSize:'11px',color:'#e5cfac',align:'center'})
        .setOrigin(0.5,1).setDepth(14).setStroke('#080b10',3);
    }
    // Root hammer damage already has a dedicated tell. The chapter boss opts out explicitly.
    if (!this.duel && this.usesMeleeIntent) {
      this.melee = new MeleeTell(kind);
      this.meleeInk = scene.add.graphics().setDepth(3);
      this.meleeWorld=scene.physics.world;
      this.meleeWorld.on(Phaser.Physics.Arcade.Events.WORLD_STEP,this.onMeleePhysicsStep,this);
    }
    if (elite) {
      this.hpBar = scene.add.graphics().setDepth(9);
    }

    this.play(`${def.texture}_walk`, true);
    if(wakeDelayMs>0){this.spawnGraceMs=wakeDelayMs;body.enable=false;this.setAlpha(0.1);this.emergeInk=scene.add.graphics().setDepth(3);}

  }

  get isTargetable(): boolean { return this.alive && this.spawnGraceMs <= 0; }

  get hitRadius(): number { return 14; }

  get isAlive(): boolean {
    return this.alive;
  }

  /** AI/collision behavior stays independent of the optional same-size visual pose. */
  updateAI(player: EnemyTarget, deltaMs: number, waypoint?: {x:number;y:number}, hasSight=true): EnemyShot | null {
    this.hitReaction.update(deltaMs);
    const shot=this.updateBehavior(player,deltaMs,waypoint,hasSight);
    this.applyHitPose();return shot;
  }

  private updateBehavior(player: EnemyTarget, deltaMs: number, waypoint?: {x:number;y:number}, hasSight=true): EnemyShot | null {
    this.updateHitFlash(deltaMs);
    if(this.spawnGraceMs>0){
      this.spawnGraceMs=Math.max(0,this.spawnGraceMs-deltaMs);this.setVelocity(0,0);
      const progress=1-this.spawnGraceMs/450;
      this.setAlpha(0.15+0.85*progress);
      this.emergeInk?.clear().lineStyle(2,0x9dae79,0.7).strokeEllipse(this.x,this.y+6,38+12*progress,18+6*progress);
      this.emergeInk?.lineBetween(this.x-9,this.y+6,this.x+9,this.y+6);
      if(!this.spawnGraceMs){(this.body as Phaser.Physics.Arcade.Body).enable=true;this.setAlpha(1);this.emergeInk?.destroy();this.emergeInk=undefined;}
      else return null;
    }
    if (!this.alive || player.dead) {
      this.ranged?.cancel();this.rangedInk?.clear();
      this.melee?.cancel();this.meleeInk?.clear();
      this.contactRecovery.cancel();this.contactInk?.clear();
      this.setVelocity(0, 0);
      if (this.shadow.active) this.shadow.setPosition(this.x, this.y + 4);
      this.drawHpBar();
      return null;
    }

    this.knockbackMs = Math.max(0, this.knockbackMs - deltaMs);

    if (this.duel) {
      const engage = !this.contactRecovery.active && hasSight && !player.isStealthed && Math.hypot(player.x-this.x,player.y-this.y) <= ELITE_DUEL.engageRange;
      this.duel.update(deltaMs,this.x,this.y,engage);
      this.updateElitePresentation();
      if (this.duel.anchored) {
        this.knockbackMs=0;this.setVelocity(0,0);
        this.shadow.setPosition(this.x,this.y+4).setFlipX(this.flipX);
        this.drawHpBar();return null;
      }
    }

    if (this.contactRecovery.active) {
      const step = this.contactRecovery.update(deltaMs);
      if (this.knockbackMs <= 0) {
        const speed = this.kind === 'brute' ? 95 : this.kind === 'spitter' ? 130 : 150;
        this.setVelocity(step.x * speed, step.y * speed);
      }
      this.updateContactPresentation();
      this.shadow.setPosition(this.x, this.y + 4).setFlipX(this.flipX);
      this.drawHpBar();
      return null;
    }

    if (this.melee) {
      const wasActive = this.melee.active;
      const previous = this.melee.phase;
      this.melee.update(deltaMs,player.x-this.x,player.y-this.y,
        this.knockbackMs <= 0 && hasSight && !player.isStealthed);
      if (previous === 'ready' && this.melee.phase === 'windup') {
        // Choosing a close bite withdraws a pending shot; it is not an earned interrupt.
        this.ranged?.withdraw(); this.updateRangedPresentation();
      }
      if (wasActive || this.melee.active) {
        if (this.knockbackMs > 0) {
          if (this.melee.striking) this.melee.miss();
        } else {
          const velocity=this.melee.velocityForStep(1000/this.scene.physics.world.fps);
          this.setVelocity(velocity.x,velocity.y);
        }
        const dir = this.melee.direction;
        if (Math.abs(dir.x)>0.1) this.setFlipX(dir.x<0);
        this.updateMeleePresentation(); this.updateContactPresentation();
        this.shadow.setPosition(this.x,this.y+4).setFlipX(this.flipX);
        this.drawHpBar(); return null;
      }
    }

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
    const route = !hasSight && waypoint && Math.hypot(waypoint.x-player.x,waypoint.y-player.y)>2;
    const sx=(waypoint?.x??player.x)-this.x,sy=(waypoint?.y??player.y)-this.y,slen=Math.hypot(sx,sy)||1;

    if (Math.abs(dx) > 4) this.setFlipX(dx < 0);

    if (this.kind === 'spitter' && this.ranged) {
      const origin={x:this.x+(dx<0?-1:1)*8*this.scaleX,y:this.y-13*this.scaleY};
      const shot=this.ranged.update(deltaMs,origin,player,hasSight&&!stealthed&&dist<=this.attackRange,hasSight&&!stealthed);
      this.updateRangedPresentation();
      if(this.ranged.winding || shot){
        this.setVelocity(0,0);
        if(this.ranged.winding && this.rangedTelegraph)this.setFlipX(this.rangedTelegraph.x<0);
      } else if (route || dist > this.attackRange * 0.85) {
        this.setVelocity((sx / slen) * this.speed * track, (sy / slen) * this.speed * track);
      } else if (dist < this.attackRange * 0.55) {
        this.setVelocity((-dx / dist) * this.speed * 0.8, (-dy / dist) * this.speed * 0.8);
      } else {
        this.setVelocity(0, 0);
      }
      this.shadow.setPosition(this.x, this.y + 4);
      this.shadow.setFlipX(this.flipX);
      this.drawHpBar();

      return shot;
    }

    if (dist > 20) {
      this.setVelocity((sx / slen) * this.speed * track, (sy / slen) * this.speed * track);
    } else {
      this.setVelocity(0, 0);
    }

    this.shadow.setPosition(this.x, this.y + 4);
    this.shadow.setFlipX(this.flipX);
    this.drawHpBar();
    return null;
  }

  /** Called only after this enemy really hurt a surviving player. No damage or rewards. */
  recoverFromContact(playerX: number, playerY: number): boolean {
    if (!this.isTargetable || this.duel || !this.contactRecovery.begin(this.x-playerX, this.y-playerY)) return false;
    this.melee?.landed(); this.updateMeleePresentation();
    // Switching from a mouth shot to a body strike cancels the shot, not a player interrupt.
    this.ranged?.withdraw();
    this.updateRangedPresentation();
    // A player hit may already own the velocity when physics reports this overlap.
    if (this.knockbackMs > 0) this.contactRecovery.stopRecoil();
    else this.setVelocity(0, 0);
    this.contactInk ??= this.scene.add.graphics().setDepth(9);
    this.updateContactPresentation();
    return true;
  }

  private updateContactPresentation(): void {
    const g = this.contactInk?.clear();
    const recovery = this.contactRecovery.active ? this.contactRecovery.progress : this.melee?.recoveryProgress ?? 0;
    if (!g || !recovery || !this.alive) return;
    const half = 7 + 5 * recovery, y = this.y + 12;
    // A small closing jaw under the attacker, never another filled danger circle.
    g.lineStyle(3, 0x080b10, 0.9).lineBetween(this.x-half, y-3, this.x-4, y+1).lineBetween(this.x+half, y-3, this.x+4, y+1);
    g.lineStyle(1, 0xdab89a, 0.85).lineBetween(this.x-half, y-3, this.x-4, y+1).lineBetween(this.x+half, y-3, this.x+4, y+1);
  }

  private onMeleePhysicsStep(deltaSeconds:number): void {
    if(!this.alive || this.melee?.phase!=='strike' || this.knockbackMs>0 || this.contactRecovery.active)return;
    this.melee.advancePhysics(deltaSeconds*1000);
    const velocity=this.melee.velocityForStep(deltaSeconds*1000);
    this.setVelocity(velocity.x,velocity.y);
  }

  private updateMeleePresentation(): void {
    const melee=this.melee,g=this.meleeInk;
    if(!melee || !g)return;
    g.clear();
    if(!this.alive || !melee.active || this.contactRecovery.active){
      if(this.alive && !this.anims.isPlaying)this.play(`${DEFS[this.kind].texture}_walk`,true);
      return;
    }
    this.anims.stop();this.setFrame(melee.phase==='strike'?0:1);
    if(melee.phase==='recovery'){
      this.contactInk ??= this.scene.add.graphics().setDepth(9);
      return;
    }
    const {x:dx,y:dy}=melee.direction,x=this.x,y=this.y+8;
    const length=melee.tuning.speed*melee.tuning.strike/1000+20;
    const alpha=melee.phase==='windup'?0.6+0.3*melee.windupProgress:0.45;
    const color=this.kind==='brute'?0xf0c386:this.kind==='spitter'?0xc1c998:0xe9a386;
    const tx=x+dx*length,ty=y+dy*length;
    g.lineStyle(4,0x080b10,0.9).lineBetween(x+dx*9,y+dy*9,tx,ty);
    g.lineStyle(1,color,alpha).lineBetween(x+dx*9,y+dy*9,tx,ty);
    for(const side of [-1,1]){
      g.lineStyle(3,0x080b10,0.9).lineBetween(tx,ty,tx-dx*11-dy*side*7,ty-dy*11+dx*side*7);
      g.lineStyle(2,color,alpha).lineBetween(tx,ty,tx-dx*11-dy*side*7,ty-dy*11+dx*side*7);
    }
    if(melee.phase==='windup'){
      const r=5+8*melee.windupProgress;
      g.lineStyle(2,0xffe0b5,alpha).lineBetween(x+dx*9-dy*r,y+dy*9+dx*r,x+dx*9+dy*r,y+dy*9-dx*r);
    }
  }

  /** Called only after confirmed HP loss; never a gameplay stagger or an action interrupt. */
  reactToHit(kind:EnemyHitKind,enabled:boolean):void {
    if(!enabled||!this.canShowHitPose()){this.clearHitPose();return;}
    this.hitReaction.begin(kind);this.applyHitPose();
  }
  private canShowHitPose():boolean {
    return this.alive&&this.spawnGraceMs<=0&&
      this.texture.key in HIT_POSE_BASE_FRAMES&&
      this.melee?.phase!=='strike';
  }
  private applyHitPose():void {
    let pose=this.hitReaction.pose;
    // Most actors are neutral: no frame write or per-frame object allocation on this path.
    if(pose===undefined&&!this.hitPoseBase)return;
    const key=this.texture.key,count=HIT_POSE_BASE_FRAMES[key]??2;
    if(Number.isInteger(Number(this.frame.name))&&Number(this.frame.name)<count&&
      (this.hitPoseBase?.texture!==key||this.hitPoseBase.frame!==this.frame.name))
      this.hitPoseBase={texture:key,frame:this.frame.name};
    if(!this.canShowHitPose()){this.hitReaction.clear();pose=undefined;}
    if(pose===undefined){
      if(Number(this.frame.name)>=count&&this.hitPoseBase?.texture===key)this.setFrame(this.hitPoseBase.frame);
      this.hitPoseBase=undefined;return;
    }
    // Windups keep their mouth/weapon commitment and every original tell. A slight
    // brace is not an interrupt; a live strike always retains its original frame.
    const warning=!!this.rangedTelegraph||this.melee?.phase==='windup'||this.duel?.phase==='windup';
    this.setFrame(count+(warning?3:pose));
  }
  private clearHitPose():void {this.hitReaction.clear();this.applyHitPose();}

  applyKnockback(dirX: number, dirY: number, force = 280, durationMs = 120): void {
    if (!this.alive || this.duel?.anchored) return;
    if(force>0 && durationMs>0){
      this.contactRecovery.stopRecoil();
      if(this.melee?.striking){this.melee.miss();this.updateMeleePresentation();}
      if(this.ranged?.interrupt())this.updateRangedPresentation();
    }
    const len = Math.hypot(dirX, dirY) || 1;
    this.knockbackMs = durationMs;
    this.setVelocity((dirX / len) * force, (dirY / len) * force);
  }

  takeDamage(amount: number): boolean {
    if (!this.isTargetable) return false;
    this.hp -= amount;
    this.setTintFill(0xffffff);
    this.hitFlashMs=75;
    if (this.hp <= 0) {
      this.alive = false;
      this.clearHitPose();
      this.hp = 0;
      this.duel?.cancel();this.duelInk?.clear();this.duelLabel?.setVisible(false);
      this.ranged?.cancel();this.rangedInk?.clear();
      this.melee?.cancel();this.meleeInk?.clear();
      this.contactRecovery.cancel();this.contactInk?.clear();
      this.shadow.destroy();
      this.hpBar?.destroy();
      this.hpBar = undefined;
      this.disableBody(true, true);
      return true;
    }
    this.duel?.hit(amount);
    if (this.duel?.anchored) {this.knockbackMs=0;this.setVelocity(0,0);}
    this.updateElitePresentation();
    this.drawHpBar();
    return false;
  }

  private updateRangedPresentation(): void {
    if(!this.ranged || !this.rangedInk)return;
    const g=this.rangedInk.clear(),tell=this.ranged.telegraph;
    if(!tell){if(this.alive && !this.anims.isPlaying)this.play('enemy_spitter_walk',true);return;}
    this.anims.stop();this.setFrame(1);
    const {x:dx,y:dy,origin:o,progress}=tell,len=72;
    // Short grounded aim marks, not a full-screen laser or an extra damage area.
    g.lineStyle(1,0x080b10,0.9).lineBetween(o.x,o.y,o.x+dx*len,o.y+dy*len);
    g.lineStyle(2,0xefbc86,0.8).lineBetween(o.x+dx*8,o.y+dy*8,o.x+dx*len,o.y+dy*len);
    for(const side of [-1,1])g.lineStyle(1,0xf2c497,0.8).lineBetween(o.x+dx*len,o.y+dy*len,o.x+dx*(len-9)-dy*side*5,o.y+dy*(len-9)+dx*side*5);
    g.fillStyle(0xffdfae,0.8).fillCircle(o.x,o.y,2+progress*3);
    g.fillStyle(0x0c1019,1).fillRect(this.x-17,this.y-35,34,4);
    g.fillStyle(0xf1c18e,1).fillRect(this.x-17,this.y-35,34*progress,4);
  }

  private updateElitePresentation(): void {
    const duel=this.duel,g=this.duelInk,label=this.duelLabel;
    if(!duel || !g || !label)return;
    g.clear();
    if(!this.alive || duel.phase==='cancelled'){label.setVisible(false);return;}
    const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pose=eliteHammerFrame(duel,saveSystem.feedback.impactMotion&&!reduced);
    const texture=pose===undefined?'enemy_brute':'enemy_root_hammer';
    if(this.texture.key!==texture){this.anims.stop();this.setTexture(texture,0);}
    if(pose!==undefined){this.anims.stop();this.setFrame(pose);}
    else if(!this.anims.isPlaying)this.play('enemy_brute_walk',true);
    const text=duel.phase==='windup' ? t('elite_windup',{current:Math.floor(duel.pressure),total:duel.threshold})
      : duel.exposed ? t('elite_exposed',{time:(duel.remaining/1000).toFixed(1)}) : t('elite_brute');
    if(label.text!==text)label.setText(text);
    label.setPosition(this.x,this.y-78).setVisible(this.spawnGraceMs<=0);
    label.setColor(duel.exposed?'#f3d38e':duel.phase==='windup'?'#f0a18a':'#c7b998');
    if(duel.phase==='windup') {
      const {x,y}=duel,r=ELITE_DUEL.radius;
      g.fillStyle(0xe27758,0.055).fillCircle(x,y,r);
      g.lineStyle(2,0xe99a77,0.9).strokeCircle(x,y,r);
      g.lineStyle(3,0xffd4a2,0.9).beginPath().arc(x,y,r-5,-Math.PI/2,-Math.PI/2+duel.windupProgress*Math.PI*2,false).strokePath();
      for(let i=0;i<4;i++){const a=i*Math.PI/2;g.lineBetween(x+Math.cos(a)*(r-7),y+Math.sin(a)*(r-7),x+Math.cos(a)*(r+3),y+Math.sin(a)*(r+3));}
      g.fillStyle(0x12151c,1).fillRect(this.x-20,this.y-64,40,4);
      g.fillStyle(0xe8d6a2,1).fillRect(this.x-20,this.y-64,40*duel.pressure/duel.threshold,4);
    } else if(duel.exposed){
      g.lineStyle(2,0xf3d38e,0.85);
      for(const side of [-1,1])g.lineBetween(this.x+side*23,this.y-20,this.x+side*28,this.y-12).lineBetween(this.x+side*28,this.y-12,this.x+side*23,this.y-4);
      g.fillStyle(0x12151c,1).fillRect(this.x-20,this.y-64,40,4);
      g.fillStyle(0xf3d38e,1).fillRect(this.x-20,this.y-64,40*duel.exposureProgress,4);
    }
  }

  /** Terminal run/actor cleanup. Physics may resume for the death transition. */
  stopCombat(): void {
    this.clearHitPose();
    this.melee?.cancel();this.meleeInk?.clear();
    this.contactRecovery.cancel();this.contactInk?.clear();
    this.ranged?.cancel();this.rangedInk?.clear();
    this.duel?.cancel();this.duelInk?.clear();this.duelLabel?.setVisible(false);
    this.meleeWorld?.off(Phaser.Physics.Arcade.Events.WORLD_STEP,this.onMeleePhysicsStep,this);
    this.knockbackMs=0;this.setVelocity(0,0);
  }

  protected updateHitFlash(delta: number): void {
    if(this.hitFlashMs<=0)return;
    this.hitFlashMs=Math.max(0,this.hitFlashMs-delta);
    if(this.hitFlashMs===0&&this.alive){if(this.elite)this.setTint(0xffc4a8);else this.clearTint();}
  }

  private drawHpBar(): void {
    if (!this.hpBar || !this.alive) return;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const w = 28, y=this.y-(this.duel?72:28);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x1a1020, 0.85);
    this.hpBar.fillRect(this.x - w / 2, y, w, 4);
    this.hpBar.fillStyle(0xe24b5a, 1);
    this.hpBar.fillRect(this.x - w / 2, y, w * ratio, 4);
  }

  destroy(fromScene?: boolean): void {
    this.hitReaction.clear();
    this.emergeInk?.destroy();
    this.duel?.cancel();this.duelInk?.destroy();this.duelLabel?.destroy();
    this.ranged?.cancel();this.rangedInk?.destroy();
    this.meleeWorld?.off(Phaser.Physics.Arcade.Events.WORLD_STEP,this.onMeleePhysicsStep,this);
    this.meleeWorld=undefined;
    this.melee?.cancel();this.meleeInk?.destroy();
    this.contactRecovery.cancel();this.contactInk?.destroy();
    if (this.shadow?.active) this.shadow.destroy();
    this.hpBar?.destroy();
    super.destroy(fromScene);
  }
}
