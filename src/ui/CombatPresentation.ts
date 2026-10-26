import Phaser from 'phaser';
import { CLASSES, type ClassId } from '../data/classes';
import { contactStrikeDuration, contactStrikeFrame, type ContactStrength } from './ContactStrike';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { PursuitCueStage } from '../systems/ReaverPursuit';
import { WARDEN_REPRISAL } from '../systems/WardenReprisal';
import type { GuardOpportunity } from '../systems/GuardOpportunity';
import type { RootlineView } from '../systems/WardenRootline';

type Effect = { x: number; y: number; age: number; duration: number; radius: number; kind: 'contact' | 'ring' | 'impact' | 'slash' | 'stab' | 'shards' | 'crown' | 'reap' | 'rift' | 'bloom' | 'rip' | 'bastion' | 'ripe' | 'podburst' | 'returncut' | 'graft' | 'relay'; color: number; angle: number; contactClass?: ClassId; contactStrength?: ContactStrength };
/** Bounded, scene-owned effects. Lifetimes advance only with combat, never via global timers. */
export class CombatPresentation {
  private ink: Phaser.GameObjects.Graphics;
  private effects: Effect[] = [];
  private hurtGuard: Phaser.GameObjects.Graphics;
  private ambushBlades: Phaser.GameObjects.Graphics;
  private pursuitBlades: Phaser.GameObjects.Graphics;
  private requiemBlades: Phaser.GameObjects.Graphics;
  private pursuitOpportunity: Phaser.GameObjects.Graphics;
  private reprisalShield: Phaser.GameObjects.Graphics;
  private guardOpportunity: Phaser.GameObjects.Graphics;
  private bloodbrandFocus: Phaser.GameObjects.Graphics;
  private shadeReturn: Phaser.GameObjects.Graphics;
  private requiemSteps = -1;
  private requiemFlash = 0;
  private ghosts: { image: Phaser.GameObjects.Image; life: number }[] = [];
  private trailTimer = 0;
  private corpses: {image:Phaser.GameObjects.Image;age:number;duration:number;vx:number;vy:number;scale:number;spin:number}[]=[];
  private stains: {x:number;y:number;age:number;radius:number}[]=[];
  private groundInk:Phaser.GameObjects.Graphics;
  private rootlineInk:Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, private motion:()=>boolean=()=>true) {
    this.ink = scene.add.graphics().setDepth(13);
    this.hurtGuard = scene.add.graphics().setDepth(14).setVisible(false);
    this.ambushBlades = scene.add.graphics().setDepth(12).setVisible(false);
    this.pursuitBlades=scene.add.graphics().setDepth(4).setVisible(false);
    this.requiemBlades=scene.add.graphics().setDepth(12).setVisible(false);
    this.pursuitOpportunity=scene.add.graphics().setDepth(12).setVisible(false);
    this.reprisalShield=scene.add.graphics().setDepth(12).setVisible(false);
    this.guardOpportunity=scene.add.graphics().setDepth(12).setVisible(false);
    this.bloodbrandFocus=scene.add.graphics().setDepth(12).setVisible(false);
    this.shadeReturn=scene.add.graphics().setDepth(4).setVisible(false);
    this.groundInk=scene.add.graphics().setDepth(2);
    this.rootlineInk=scene.add.graphics().setDepth(6).setVisible(false);
  }
  /** Actual projectile geometry stays visible in comfort mode; only the trailing roots are optional. */
  showRootlines(waves: readonly RootlineView[]): void {
    const g=this.rootlineInk.clear().setVisible(waves.length>0);
    for(const w of waves){
      const dx=w.dx,dy=w.dy,x=w.x,y=w.y-5;
      for(const [width,color]of [[5,0x0b1718],[2,0xd2e6bc]]){
        g.lineStyle(width,color,1).lineBetween(x-dx*9-dy*7,y-dy*9+dx*7,x+dx*6,y+dy*6)
          .lineBetween(x+dx*6,y+dy*6,x-dx*9+dy*7,y-dy*9-dx*7);
      }
      if(this.motion())for(const side of [-1,1]){
        const tx=x-dx*17,ty=y-dy*17;
        g.lineStyle(1,0x71b6a4,0.8).lineBetween(x-dx*5,y-dy*5,tx,ty)
          .lineBetween(tx,ty,tx-dx*7-dy*side*5,ty-dy*7+dx*side*5);
      }
    }
  }

  defeat(enemy:Enemy,dx:number,dy:number,boss=false):void {
    if(this.corpses.length>=24)this.corpses.shift()?.image.destroy();
    const image=this.scene.add.image(enemy.x,enemy.y,enemy.texture.key,enemy.frame.name).setOrigin(enemy.originX,enemy.originY)
      .setScale(enemy.scaleX,enemy.scaleY).setFlipX(enemy.flipX).setDepth(7).setTint(boss?0xe9d3a2:0xbfa990);
    const length=Math.hypot(dx,dy)||1;
    this.corpses.push({image,age:0,duration:boss?980:330,vx:dx/length*(boss?25:105),vy:dy/length*70-45,scale:enemy.scaleX,spin:dx<0?-0.8:0.8});
    if(this.stains.length>=35)this.stains.shift();this.stains.push({x:enemy.x,y:enemy.y+5,age:0,radius:boss?55:16});
    this.add({x:enemy.x,y:enemy.y-8,radius:boss?160:enemy.elite?48:30,color:boss?0xeed19d:0xb79e78,duration:boss?1000:420,kind:'shards',angle:Math.atan2(dy,dx)});
    if(boss){this.pulse(enemy.x,enemy.y,270,0xe5c89b,1000);this.pulse(enemy.x,enemy.y,160,0x91d6be,700);}
  }

  pulse(x: number, y: number, radius: number, color: number, duration = 380): void {
    this.add({ x, y, radius, color, duration, kind: 'ring', angle: 0 });
  }
  impact(x: number, y: number, color: number, crit = false): void {
    this.add({ x, y, radius: crit ? 30 : 17, color, duration: crit ? 240 : 150, kind: 'impact', angle: Math.random() * 6.28 });
  }
  /** One confirmed HP-loss contact replaces the shared spark, using the actual hit vector. */
  contact(x: number, y: number, id: ClassId, dx: number, dy: number, strength: ContactStrength): void {
    if (![x, y, dx, dy].every(Number.isFinite)) return;
    // The replaced spark consumed one shared RNG draw; keep gameplay RNG ordering intact.
    Math.random();
    this.add({ x, y, radius: 0, color: CLASSES[id].color, duration: contactStrikeDuration(id, strength),
      kind: 'contact', angle: Math.atan2(dy, dx), contactClass: id, contactStrength: strength });
  }
  /** One reused open marker; no filled lock-on circle or line through ground telegraphs. */
  showPursuitOpportunity(player: Player, cue?: {x:number;y:number;radius:number;travel:number;dx:number;dy:number;stage:PursuitCueStage}): void {
    const g=this.pursuitOpportunity.clear().setVisible(!!cue && !player.dead);
    if (!cue || player.dead) return;
    const ready=cue.stage==='ready', buffered=cue.stage==='buffered';
    const alpha=ready?0.95:buffered?0.75:0.45;
    const color=ready?0xffd2ae:buffered?0xe5b09a:0xb0918d;
    const outer=cue.radius+9, y=cue.y-5;
    // Side notches frame the body, leaving health, wound marks and the floor unobscured.
    for (const side of [-1,1]) {
      const x=cue.x+side*outer;
      for (const [width,tint] of [[4,0x171018],[2,color]]) {
        g.lineStyle(width,tint,alpha).lineBetween(x-side*6,y-8,x,y-8)
          .lineBetween(x,y-8,x,y+3).lineBetween(x,y+3,x-side*4,y+7);
      }
    }
    // A zero-travel ordinary melee opportunity frames its target but promises no landing.
    if ((ready || buffered) && cue.travel>0) {
      const length=Math.hypot(cue.dx,cue.dy)||1, dx=cue.dx/length,dy=cue.dy/length;
      const x=player.x+dx*cue.travel,y=player.y+dy*cue.travel+6;
      for (const [width,tint] of [[4,0x171018],[2,color]])
        g.lineStyle(width,tint,alpha).lineBetween(x-dx*5-dy*5,y-dy*5+dx*5,x,y)
          .lineBetween(x,y,x-dx*5+dy*5,y-dy*5-dx*5);
    }
  }

  /** Only the already-paid original target; cosmetic hooks, no lock-on or path. */
  showBloodbrandFocus(player: Player, cue?: {x:number;y:number;radius:number;pulses:number}): void {
    const valid=!!cue && !player.dead && [cue.x,cue.y,cue.radius,cue.pulses].every(Number.isFinite) && cue.radius>=0 && cue.pulses>0;
    const g=this.bloodbrandFocus.clear().setVisible(valid);
    if(!valid || !cue)return;
    const outer=cue.radius+12,y=cue.y-4;
    for(const side of [-1,1]) {
      const x=cue.x+side*outer;
      for(const [width,color]of [[5,0x171018],[2,0xf0b69c]])
        g.lineStyle(width,color,0.95).lineBetween(x-side*8,y-13,x,y-9)
          .lineBetween(x,y-9,x,y+7).lineBetween(x,y+7,x-side*7,y+12);
    }
    // Four is the real bleed phase maximum, never extra earned or refundable pulses.
    const count=Math.min(4,Math.floor(cue.pulses));
    for(let i=0;i<count;i++) {
      const x=cue.x+(i-(count-1)/2)*6,y=cue.y+cue.radius+7;
      g.lineStyle(3,0x171018,1).lineBetween(x-1,y+2,x+1,y-2);
      g.lineStyle(1,0xe89683,1).lineBetween(x-1,y+2,x+1,y-2);
    }
  }

  setRequiemProgress(steps: number | null): void {
    const next=steps===null ? -1 : Math.max(0,Math.min(2,Math.floor(steps)));
    if (this.requiemSteps===2 && next===0) this.requiemFlash=160;
    this.requiemSteps=next;
  }
  /** Local wound payoff, deliberately not the awakened ring-cleave signature. */
  rip(x: number, y: number, angle: number): void {
    this.add({x,y:y-12,radius:27,color:0xe59b8e,duration:220,kind:'rip',angle});
  }
  awaken(player: Player): void {
    this.pulse(player.x,player.y,82,CLASSES[player.classId].color,650);
    this.signature(player);
    this.impact(player.x,player.y-18,0xe8e0c9,true);
  }
  /** Called by the actual mutation proc, not by a keypress or attack animation. */
  signature(player: Player, angle = 0, x = player.x, y = player.y, radius = 110): void {
    if (!player.isAwakened) return;
    const kind = { warden: 'crown', reaver: 'reap', shade: 'rift', thorn: 'bloom' } as const;
    this.add({x,y,radius,color:CLASSES[player.classId].color,duration:player.classId==='shade'?240:420,kind:kind[player.classId],angle});
  }
  bloomRipe(x:number,y:number): void {
    this.add({x,y,radius:12,color:0xe5d995,duration:180,kind:'ripe',angle:0});
  }
  /** A short, unfilled twig links an actual overflow seed, never an automatic attack. */
  graftSeed(x:number,y:number,toX:number,toY:number): void {
    if (!this.motion()) return;
    this.add({x,y,radius:Math.hypot(toX-x,toY-y),color:0xaed58d,duration:160,kind:'graft',angle:Math.atan2(toY-y,toX-x)});
  }
  /** Optional paid-hit-to-debt accent; the actual existing bleed marks remain visible without motion. */
  relayBloodbrand(x:number,y:number,toX:number,toY:number): void {
    if(!this.motion())return;
    this.add({x,y,radius:Math.hypot(toX-x,toY-y),color:0xd4726b,duration:180,kind:'relay',angle:Math.atan2(toY-y,toX-x)});
  }
  bloomDetonate(x:number,y:number,count:number,awakened:boolean): void {
    this.add({x,y:y-12,radius:24+Math.min(3,count)*8,color:awakened?0xe3dc9c:0xb4d88e,duration:380,kind:'podburst',angle:0});
  }
  /** Open corners around one real projectile or committed emitter; no filled disc or future aim line. */
  showGuardOpportunity(player:Player,cue?:GuardOpportunity & {stage:'ready'|'hold'}):void {
    const g=this.guardOpportunity.clear().setVisible(!!cue && !player.dead);
    if(!cue || player.dead)return;
    const color=cue.stage==='hold'?0xddd9ad:0xa9d8c5;
    for(const side of [-1,1])for(const [width,tint]of [[4,0x101817],[2,color]]) {
      const x=cue.x+side*11;
      g.lineStyle(width,tint,0.95).lineBetween(x-side*4,cue.y-8,x,cue.y-8)
        .lineBetween(x,cue.y-8,x,cue.y+7).lineBetween(x,cue.y+7,x-side*4,cue.y+7);
    }
  }
  /** Direction of the next ordinary dash, not a promised safe path or a teleport anchor. */
  showShadeReturn(player:Player,cue?:{dx:number;dy:number;ready:boolean;remaining:number}):void {
    const g=this.shadeReturn.clear().setVisible(!!cue&&!player.dead);
    if(!cue||player.dead)return;
    const alpha=(cue.ready?0.85:0.4)*Math.min(1,cue.remaining/120),dx=cue.dx,dy=cue.dy;
    for(const offset of [19,27]) {
      const x=player.x+dx*offset,y=player.y+6+dy*offset;
      for(const [width,color]of [[4,0x110e1c],[2,0xc8b2ee]])
        g.lineStyle(width,color,alpha).lineBetween(x-dx*5-dy*4,y-dy*5+dx*4,x,y)
          .lineBetween(x,y,x-dx*5+dy*4,y-dy*5-dx*4);
    }
  }
  /** One small hit-confirmed crossed cut; no damage, flash or extra shake. */
  shadowOpening(x:number,y:number,angle:number):void {
    this.add({x,y:y-12,radius:28,color:0xd1baf4,duration:210,kind:'returncut',angle});
  }
  clearReprisalCue(): void { this.reprisalShield.clear().setVisible(false); }
  reprisalSwing(player: Player, angle: number): void {
    this.add({x:player.x,y:player.y,radius:player.stats.attackRange,color:0xa7d7c4,duration:230,kind:'bastion',angle});
  }
  attack(player: Player, angle: number, crit: boolean): void {
    const id = player.classId;
    const color = CLASSES[id].color;
    const kind = id === 'shade' || id === 'thorn' ? 'stab' : 'slash';
    this.add({ x: player.x, y: player.y, radius: player.stats.attackRange * (id === 'thorn' ? 0.2 : 1.05), color, duration: id === 'shade' ? 130 : 210, kind, angle });
    if (id === 'reaver') this.add({ x: player.x - Math.cos(angle)*6, y: player.y - Math.sin(angle)*6, radius: 43, color: 0xf8b9b1, duration: 170, kind: 'slash', angle: angle + 0.3 });
    if (crit && this.motion()) this.scene.cameras.main.shake(65, 0.0016);
  }
  skill(player: Player, x: number, y: number): void {
    // Thorn's real nova already owns the local ring/projectiles and paid seed burst.
    // Do not cover its hand release with an extra player-centred crit impact.
    if(player.classId==='thorn')return;
    this.pulse(x, y, player.classId === 'warden' ? 112 : 85, CLASSES[player.classId].color, 550);
    this.impact(x, y - 16, 0xeee5cd, true);
    if (player.classId === 'shade') this.ghost(player, x, y, 520);
    if(this.motion()) this.scene.cameras.main.shake(110, 0.002);
  }
  ghost(player: Player, x = player.x, y = player.y, life = 220): void {
    if (this.ghosts.length >= 18) return;
    const image = this.scene.add.image(x, y, player.texture.key, player.frame.name)
      .setOrigin(player.originX, player.originY).setScale(player.scaleX, player.scaleY)
      .setFlipX(player.flipX).setTint(CLASSES[player.classId].color).setAlpha(0.4).setDepth(9);
    this.ghosts.push({ image, life });
  }
  update(delta: number, player: Player, emitTrails=true): void {
    this.hurtGuard.clear().setVisible(!player.dead && player.hurtProtectionRemaining > 0);
    if (this.hurtGuard.visible) {
      const alpha = 0.35 + 0.45 * Math.min(1, player.hurtProtectionRemaining / 350);
      for (const side of [-1, 1]) {
        const x = player.x + side * 21;
        this.hurtGuard.lineStyle(4, 0x080b10, alpha).lineBetween(x-side*5, player.y-23, x, player.y-19).lineBetween(x, player.y-19, x, player.y+3);
        this.hurtGuard.lineStyle(2, 0xd7e4dc, alpha).lineBetween(x-side*5, player.y-23, x, player.y-19).lineBetween(x, player.y-19, x, player.y+3);
      }
    }
    // Two held blades, not a flashing aura: make the quiet strike readable without hiding tells.
    const blades = this.ambushBlades.clear().setVisible(!player.dead && player.isStealthed && !player.isDashing);
    if (blades.visible) {
      const dir = player.facingDir, sideX = -dir.y, sideY = dir.x;
      const alpha = player.attackReady ? 0.85 : 0.4;
      for (const side of [-1, 1]) {
        const x = player.x + sideX*side*13, y = player.y-14 + sideY*side*13;
        blades.lineStyle(4,0x100d1e,alpha).lineBetween(x-dir.x*5,y-dir.y*5,x+dir.x*11,y+dir.y*11);
        blades.fillStyle(0xb794f6,alpha).fillTriangle(x-sideX*2-dir.x*5,y-sideY*2-dir.y*5,
          x+sideX*2-dir.x*5,y+sideY*2-dir.y*5,x+dir.x*11,y+dir.y*11);
        blades.lineStyle(1,0xeee4ff,alpha).lineBetween(x,y,x+dir.x*10,y+dir.y*10);
      }
    }
    // Two open blood-blade chevrons. No filled circle hiding enemy ground tells.
    const pursuit=this.pursuitBlades.clear().setVisible(!player.dead && (player.pursuitAvailable || player.isPursuing));
    if (pursuit.visible) {
      const dir=player.pursuitDirection, alpha=player.isPursuing?0.9:Math.min(0.75,player.pursuitRemaining/300);
      for (const offset of [18,27]) {
        const x=player.x+dir.x*offset, y=player.y+4+dir.y*offset;
        pursuit.lineStyle(4,0x170f16,alpha).lineBetween(x-dir.x*5-dir.y*5,y-dir.y*5+dir.x*5,x,y).lineBetween(x,y,x-dir.x*5+dir.y*5,y-dir.y*5-dir.x*5);
        pursuit.lineStyle(2,0xe9a294,alpha).lineBetween(x-dir.x*5-dir.y*5,y-dir.y*5+dir.x*5,x,y).lineBetween(x,y,x-dir.x*5+dir.y*5,y-dir.y*5-dir.x*5);
      }
    }
    this.requiemFlash=Math.max(0,this.requiemFlash-delta);
    const cadence=this.requiemBlades.clear().setVisible(!player.dead&&player.classId==='reaver'&&this.requiemSteps>=0);
    if (cadence.visible) {
      for(let i=0;i<3;i++) {
        const x=player.x+(i-1)*9, y=player.y-51;
        const charged=this.requiemFlash>0 || i<this.requiemSteps;
        cadence.lineStyle(4,0x100d15,0.9).lineBetween(x-2,y+3,x+2,y-3);
        cadence.lineStyle(2,charged?0xec9d8a:this.requiemSteps===2?0xe2d2ba:0x675451,charged?0.95:0.6).lineBetween(x-2,y+3,x+2,y-3);
      }
    }
    const shield=this.reprisalShield.clear().setVisible(!player.dead&&player.reprisalDamage>0);
    if (shield.visible) {
      const x=player.x,y=player.y-45,alpha=Math.min(1,player.reprisalRemaining/180);
      const fraction=Math.min(1,player.reprisalDamage/Math.max(1,player.reprisalCap));
      shield.lineStyle(3,0x0b1519,alpha).beginPath().moveTo(x-7,y-6).lineTo(x+7,y-6).lineTo(x+6,y+3).lineTo(x,y+8).lineTo(x-6,y+3).closePath().strokePath();
      shield.lineStyle(1,0xc5e7d6,alpha).beginPath().moveTo(x-7,y-6).lineTo(x+7,y-6).lineTo(x+6,y+3).lineTo(x,y+8).lineTo(x-6,y+3).closePath().strokePath();
      shield.fillStyle(0xa7d7c4,alpha*0.85).fillRect(x-4,y+3-8*fraction,8,8*fraction);
      shield.lineStyle(3,0x0b1519,alpha).lineBetween(x-9,y+12,x+9,y+12);
      shield.lineStyle(1,0xc5e7d6,alpha).lineBetween(x-9,y+12,x-9+18*player.reprisalRemaining/WARDEN_REPRISAL.window,y+12);
    }
    this.trailTimer -= delta;
    if (emitTrails && player.isDashing && this.trailTimer <= 0) {
      this.ghost(player);
      this.trailTimer = player.classId === 'shade' ? 26 : 42;
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.life -= delta;
      if (g.life <= 0) { g.image.destroy(); this.ghosts.splice(i, 1); }
      else g.image.setAlpha(Math.min(0.4, g.life / 600));
    }
    const floor=this.groundInk.clear();
    for(let i=this.stains.length-1;i>=0;i--){const s=this.stains[i];s.age+=delta;if(s.age>=3400){this.stains.splice(i,1);continue;}floor.fillStyle(0x1a1223,Math.min(0.7,(3400-s.age)/800)).fillEllipse(s.x,s.y,s.radius*2,s.radius);floor.lineStyle(1,0x856c56,Math.min(0.3,(3400-s.age)/2000)).strokeEllipse(s.x,s.y,s.radius*2,s.radius);}
    for(let i=this.corpses.length-1;i>=0;i--){const c=this.corpses[i];c.age+=delta;const t=c.age/c.duration;
      if(t>=1){c.image.destroy();this.corpses.splice(i,1);continue;}
      c.image.x+=c.vx*delta/1000;c.image.y+=c.vy*delta/1000;c.vy+=145*delta/1000;
      c.image.setRotation(c.spin*t).setAlpha((1-t)**0.7).setScale(c.scale*(1-t*0.5),c.scale*(1-t*0.75));
    }
    const ink = this.ink.clear();
    const contactMotion = this.motion();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.age += delta;
      if (e.age >= e.duration) { this.effects.splice(i, 1); continue; }
      const t = e.age / e.duration, alpha = 1 - t;
      ink.lineStyle(e.kind === 'slash' ? 4 : 2, e.color, alpha);
      if (e.kind === 'contact') {
        for (const stroke of contactStrikeFrame(e.contactClass!, e.contactStrength!, e.age, e.angle, contactMotion)) {
          // A dark keyline preserves the cut through the existing white enemy hit flash.
          for (const [width, color] of [[stroke.width + 2, 0x080c12], [stroke.width, stroke.color]]) {
            ink.lineStyle(width, color, stroke.alpha).beginPath();
            stroke.points.forEach(([x, y], index) => {
              if (index === 0) ink.moveTo(e.x + x, e.y + y);
              else ink.lineTo(e.x + x, e.y + y);
            });
            ink.strokePath();
          }
        }
      } else if (e.kind === 'relay') {
        // Three short bone-red cuts travel toward the real recipient, not a filled beam or damage area.
        const dx=Math.cos(e.angle),dy=Math.sin(e.angle);
        for(let j=0;j<3;j++){
          const progress=Math.max(0,Math.min(1,t*1.45-j*0.13));
          const x=e.x+dx*e.radius*progress,y=e.y+dy*e.radius*progress;
          ink.lineStyle(j===0?2:1,j===0?0xf0c3aa:e.color,alpha).lineBetween(x-dx*7-dy*4,y-dy*7+dx*4,x+dx*4,y+dy*4)
            .lineBetween(x+dx*4,y+dy*4,x-dx*7+dy*4,y-dy*7-dx*4);
        }
      } else if (e.kind === 'graft') {
        const dx=Math.cos(e.angle),dy=Math.sin(e.angle),x=e.x+dx*e.radius,y=e.y+dy*e.radius;
        ink.lineStyle(1,e.color,alpha*0.8).lineBetween(e.x,e.y,x,y);
        for(const side of [-1,1]) {
          const mx=e.x+dx*e.radius*0.6,my=e.y+dy*e.radius*0.6;
          ink.lineBetween(mx,my,mx-dx*5-dy*side*4,my-dy*5+dx*side*4);
        }
        ink.fillStyle(e.color,alpha).fillRect(x-1,y-2,2,4);
      } else if (e.kind === 'bastion') {
        const dx=Math.cos(e.angle),dy=Math.sin(e.angle),reach=e.radius*(0.55+t*0.45),width=e.radius*(0.28+t*0.12);
        for (const offset of [0,-8]) {
          const x=e.x+dx*(reach+offset),y=e.y+dy*(reach+offset);
          ink.lineStyle(offset?2:4,offset?e.color:0xe2edcf,alpha).lineBetween(x-dx*12-dy*width,y-dy*12+dx*width,x,y)
            .lineBetween(x,y,x-dx*12+dy*width,y-dy*12-dx*width);
        }
      } else if (e.kind === 'returncut') {
        const r=e.radius*(0.45+t*0.55);
        for(const side of [-1,1]) {
          const a=e.angle+side*0.65,dx=Math.cos(a),dy=Math.sin(a);
          for(const [width,color]of [[5,0x130f20],[2,side===1?0xeee1ff:e.color]])
            ink.lineStyle(width,color,alpha).lineBetween(e.x-dx*r*0.7,e.y-dy*r*0.7,e.x+dx*r,e.y+dy*r);
        }
      } else if (e.kind === 'rip') {
        const dx=Math.cos(e.angle),dy=Math.sin(e.angle),spread=e.radius*(0.35+t*0.65);
        for(const side of [-1,1]) {
          const x=e.x-dy*side*spread*0.35,y=e.y+dx*side*spread*0.35;
          ink.lineStyle(3,side===1?0xf1c3ab:e.color,alpha).lineBetween(x-dx*spread,y-dy*spread,x+dx*spread,y+dy*spread);
          ink.lineBetween(x+dx*spread,y+dy*spread,x+dx*(spread-8)-dy*side*6,y+dy*(spread-8)+dx*side*6);
        }
      } else if (e.kind === 'crown') {
        // Six separate roots open outward, leaving the centre and enemy cues visible.
        for (let j=0;j<6;j++) {
          const a=j/6*Math.PI*2-Math.PI/2, r=e.radius*(0.62+t*0.30);
          const sx=e.x+Math.cos(a)*r*0.7, sy=e.y+Math.sin(a)*r*0.7;
          const tx=e.x+Math.cos(a)*r, ty=e.y+Math.sin(a)*r;
          ink.lineStyle(2,e.color,alpha*0.75).lineBetween(sx,sy,tx,ty);
          for(const side of [-1,1]) ink.lineBetween(tx,ty,tx-Math.cos(a+side*0.7)*14,ty-Math.sin(a+side*0.7)*14);
          ink.fillStyle(0xe8e0c9,alpha).fillRect(Math.round(tx)-1,Math.round(ty)-1,2,2);
        }
      } else if (e.kind === 'reap') {
        // Broken concentric blade arcs. No solid disc covering the fight.
        for(let j=0;j<3;j++) {
          const start=e.angle+j/3*Math.PI*2+t*1.2;
          ink.lineStyle(3,j===0?0xe8c7bd:e.color,alpha*0.85).beginPath();
          for(let k=0;k<=12;k++) {
            const a=start+k/12*1.35, r=e.radius*(0.66+t*0.34);
            const x=e.x+Math.cos(a)*r,y=e.y+Math.sin(a)*r;
            if(!k)ink.moveTo(x,y);else ink.lineTo(x,y);
          }
          ink.strokePath();
        }
      } else if (e.kind === 'rift') {
        const reach=Math.min(96,e.radius)*(0.5+t*0.5), dx=Math.cos(e.angle),dy=Math.sin(e.angle);
        for(const side of [-1,1]) {
          const offset=(1-t)*12*side, bx=e.x-dy*offset,by=e.y+dx*offset;
          ink.lineStyle(2,side===1?0xd0c9df:e.color,alpha).lineBetween(bx-dx*22,by-dy*22,bx+dx*reach,by+dy*reach);
          ink.lineBetween(bx+dx*reach,by+dy*reach,bx+dx*(reach-15)-dy*side*8,by+dy*(reach-15)+dx*side*8);
        }
      } else if (e.kind === 'ripe') {
        const r=4+e.radius*t;
        // A single short bud-opening accent. Full stacks remain readable without pulsing.
        for(const side of [-1,1])ink.lineStyle(2,e.color,alpha).lineBetween(e.x+side*4,e.y-4,e.x+side*r,e.y-8-t*3);
        ink.fillStyle(0xf1e9bc,alpha).fillRect(e.x-1,e.y-10-t*8,2,3);
      } else if (e.kind === 'podburst') {
        // Local split seed shells, not an area-damage disc or a chain to other targets.
        const r=e.radius*(0.45+t*0.55);
        for(let j=0;j<6;j++) {
          const a=j/6*Math.PI*2-Math.PI/2,dx=Math.cos(a),dy=Math.sin(a);
          const x=e.x+dx*r,y=e.y+dy*r*0.72;
          const length=10-t*3;
          ink.fillStyle(j%2?0xe9e1ad:0x9ac77e,alpha).beginPath().moveTo(x,y)
            .lineTo(x-dx*length-dy*3,y-dy*length+dx*3)
            .lineTo(x-dx*(length+3),y-dy*(length+3))
            .lineTo(x-dx*length+dy*3,y-dy*length-dx*3).closePath().fillPath();
          ink.lineStyle(1,e.color,alpha*0.65).lineBetween(x-dx*(length+6),y-dy*(length+6),x-dx*length,y-dy*length);
        }
        if(t<0.45)ink.lineStyle(2,0xf4edc5,alpha*(1-t/0.45)).lineBetween(e.x-5,e.y,e.x+5,e.y)
          .lineBetween(e.x,e.y-7,e.x,e.y+7);
      } else if (e.kind === 'bloom') {
        const r=Math.min(48,e.radius)*(0.45+t*0.55);
        for(let j=0;j<5;j++) {
          const a=j/5*Math.PI*2-Math.PI/2, tipX=e.x+Math.cos(a)*r,tipY=e.y+Math.sin(a)*r;
          ink.lineStyle(2,j%2?0xc7aa63:e.color,alpha*0.85).beginPath();
          ink.moveTo(e.x+Math.cos(a-0.5)*r*0.25,e.y+Math.sin(a-0.5)*r*0.25);
          ink.lineTo(e.x+Math.cos(a-0.32)*r*0.65,e.y+Math.sin(a-0.32)*r*0.65);
          ink.lineTo(tipX,tipY);
          ink.lineTo(e.x+Math.cos(a+0.32)*r*0.65,e.y+Math.sin(a+0.32)*r*0.65);
          ink.strokePath();
          ink.fillStyle(0xe8dfb1,alpha).fillRect(Math.round(tipX),Math.round(tipY),2,2);
        }
      } else if (e.kind === 'ring') {
        const r = e.radius * (0.25 + 0.75 * t);
        // Angular root corona rather than a soft, generic particle halo.
        ink.beginPath();
        for (let j = 0; j <= 24; j++) {
          const a = j / 24 * Math.PI * 2, rr = r + (j % 2 ? 4 : -2);
          const x = e.x + Math.cos(a)*rr, y = e.y + Math.sin(a)*rr*0.7;
          if (!j) ink.moveTo(x,y); else ink.lineTo(x,y);
        }
        ink.strokePath();
        for (let j = 0; j < 8; j++) {
          const a = j / 8 * Math.PI * 2;
          ink.lineBetween(e.x+Math.cos(a)*r, e.y+Math.sin(a)*r*0.7, e.x+Math.cos(a)*(r+12), e.y+Math.sin(a)*(r+12)*0.7);
        }
      } else if(e.kind === 'shards') {
        const pieces=e.radius>100?18:8;
        for(let j=0;j<pieces;j++){
          const a=e.angle+j/pieces*Math.PI*2,r=e.radius*(0.15+t)*(j%2?1:0.65);
          const x=e.x+Math.cos(a)*r,y=e.y+Math.sin(a)*r*0.65+t*t*24;
          ink.fillStyle(j%3?e.color:0xf4dfb8,alpha).fillRect(Math.round(x),Math.round(y),j%2?3:5,j%2?5:3);
          ink.lineStyle(1,e.color,alpha*0.5).lineBetween(x,y,x-Math.cos(a)*9,y-Math.sin(a)*6);
        }
      } else if (e.kind === 'impact') {
        for (let j = 0; j < 6; j++) {
          const a = e.angle + j / 6 * Math.PI * 2, r = e.radius * (0.25+t);
          ink.lineBetween(e.x+Math.cos(a)*r*0.4, e.y+Math.sin(a)*r*0.4, e.x+Math.cos(a)*r, e.y+Math.sin(a)*r);
          ink.fillStyle(0xfff0cb, alpha).fillRect(e.x+Math.cos(a)*r-1,e.y+Math.sin(a)*r-1,3,3);
        }
      } else if (e.kind === 'slash') {
        ink.beginPath();
        for (let j = 0; j <= 12; j++) {
          const a = e.angle - 1.05 + j / 12 * 2.1 + t*0.35;
          const x = e.x+Math.cos(a)*e.radius, y=e.y+Math.sin(a)*e.radius;
          if (!j) ink.moveTo(x,y); else ink.lineTo(x,y);
        }
        ink.strokePath();
      } else {
        const r = e.radius*(0.5+t);
        ink.lineStyle(3,e.color,alpha).lineBetween(e.x,e.y,e.x+Math.cos(e.angle)*r,e.y+Math.sin(e.angle)*r);
        for (const side of [-1,1]) ink.lineBetween(e.x+Math.cos(e.angle)*r,e.y+Math.sin(e.angle)*r,e.x+Math.cos(e.angle+side*0.3)*r*0.7,e.y+Math.sin(e.angle+side*0.3)*r*0.7);
      }
    }
  }
  private add(effect: Omit<Effect, 'age'>): void {
    if (this.effects.length >= 80) this.effects.shift();
    this.effects.push({ ...effect, age: 0 });
  }
  destroy(): void {
    this.rootlineInk.destroy();
    this.corpses.forEach(c=>c.image.destroy());this.corpses=[];this.stains=[];this.groundInk.destroy();
    this.ghosts.forEach(g => g.image.destroy()); this.ghosts=[]; this.effects=[]; this.ink.destroy(); this.hurtGuard.destroy(); this.ambushBlades.destroy(); this.pursuitBlades.destroy(); this.requiemBlades.destroy(); this.pursuitOpportunity.destroy(); this.reprisalShield.destroy(); this.guardOpportunity.destroy(); this.bloodbrandFocus.destroy(); this.shadeReturn.destroy();
  }
}
