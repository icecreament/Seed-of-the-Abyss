import Phaser from 'phaser';
import { Enemy, type EnemyTarget } from './Enemy';

export interface BossHooks {
  damagePlayer: (damage: number) => void;
  shoot: (x: number, y: number, dx: number, dy: number, damage: number, speed: number) => void;
  phaseChanged: () => void;
  exposed?: (wallImpact: boolean) => void;
}
type Hazard = { kind: 'circle' | 'lane'; x: number; y: number; dx: number; dy: number; radius: number; length: number; age: number; windup: number; fired: boolean };

/** Chapter I: the Crownroot. All telegraphs and attacks run on combat delta. */
export class ChapterBoss extends Enemy {
  phase = 1;
  private clock = 1400;
  private pattern = 0;
  private chargeMs = 0;
  private chargeX = 0;
  private chargeY = 0;
  private recoveryMs = 0;
  private recoveryDuration = 1;
  private poseClock = 0;
  private weakpoint: Phaser.GameObjects.Graphics;
  private hazards: Hazard[] = [];
  private telegraphs: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, x: number, y: number, private hooks: BossHooks) {
    super(scene, x, y, 'brute', 4);
    makeBossTexture(scene);
    this.anims.stop();
    this.setTexture('boss_crownroot').setScale(2.2).setOrigin(0.5, 0.78).setDepth(8);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 24).setOffset(32, 58);
    this.shadow.setScale(4.5, 2).setAlpha(0.55);
    this.maxHp = this.hp = 1150;
    this.damage = 18;
    this.speed = 38;
    this.telegraphs = scene.add.graphics().setDepth(3);
    this.weakpoint = scene.add.graphics().setDepth(9);
  }
  takeDamage(amount: number): boolean {
    const killed = super.takeDamage(amount);
    if (killed) {
      this.telegraphs.clear(); this.weakpoint.clear(); this.hazards=[];
      this.chargeMs=this.recoveryMs=0;
      this.setVelocity(0,0);
    }
    return killed;
  }
  get hitRadius(): number { return 44; }
  get activeTelegraphs(): number { return this.hazards.filter(h => !h.fired).length; }
  get isExposed(): boolean { return this.isAlive && this.recoveryMs > 0; }
  get exposureRemaining(): number { return this.recoveryMs; }
  get incomingDamageMultiplier(): number { return this.isExposed ? 1.35 : 1; }
  get actionCue(): 'exposed' | 'charge' | 'spikes' | 'volley' | 'hunting' {
    if (this.isExposed) return 'exposed';
    if (this.chargeMs > 0 || this.hazards.some(h => h.kind === 'lane' && !h.fired)) return 'charge';
    const hazard = this.hazards.find(h => !h.fired);
    return hazard ? hazard.length === -1 ? 'volley' : 'spikes' : 'hunting';
  }
  private beginRecovery(duration: number, wallImpact = false): void {
    if (this.isExposed || !this.isAlive) return;
    this.recoveryMs = this.recoveryDuration = duration;
    this.chargeMs = 0;
    this.setVelocity(0, 0);
    this.hooks.exposed?.(wallImpact);
  }
  protected get usesMeleeIntent(): boolean { return false; }
  get canDealContactDamage(): boolean { return true; }
  recoverFromContact(): boolean { return false; }
  applyKnockback(): void { /* An anchored chapter boss cannot be stun-locked. */ }
  updateAI(player: EnemyTarget, delta: number): Phaser.Math.Vector2 | null {
    this.updateHitFlash(delta);
    if (!this.isAlive || player.dead) { this.setVelocity(0,0); return null; }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.clock = Math.min(this.clock, 900);
      this.hooks.phaseChanged();
    }
    this.shadow.setPosition(this.x, this.y+8);
    this.poseClock += delta;
    this.clock -= delta;
    this.recoveryMs = Math.max(0, this.recoveryMs - delta);
    const wasCharging = this.chargeMs > 0;
    this.chargeMs = Math.max(0, this.chargeMs - delta);
    // The charge is committed to its telegraphed direction. Baiting it into a
    // wall gives a longer punish window, not an invisible continuing hitbox.
    const blocked = (this.body as Phaser.Physics.Arcade.Body).blocked;
    const wallImpact = wasCharging && (
      this.chargeX < -0.1 && blocked.left || this.chargeX > 0.1 && blocked.right ||
      this.chargeY < -0.1 && blocked.up || this.chargeY > 0.1 && blocked.down
    );
    if (wasCharging && (this.chargeMs === 0 || wallImpact)) this.beginRecovery(wallImpact ? 1400 : 1100, wallImpact);
    const dx = player.x-this.x, dy=player.y-this.y, len=Math.hypot(dx,dy)||1;
    if (this.isExposed) this.setVelocity(0, 0);
    else if (this.chargeMs > 0) this.setVelocity(this.chargeX*480,this.chargeY*480);
    else if (this.hazards.some(h => !h.fired)) this.setVelocity(0,0);
    else this.setVelocity(dx/len*this.speed,dy/len*this.speed);
    if (this.clock <= 0 && this.chargeMs <= 0 && !this.isExposed && !this.hazards.some(h => !h.fired)) {
      this.clock = this.phase === 2 ? 2400 : 3100;
      const pattern = this.pattern++ % 3;
      if (pattern === 0) {
        this.hazards.push({ kind: 'lane', x:this.x, y:this.y, dx:dx/len, dy:dy/len, radius:46, length:360, age:0, windup:1050, fired:false });
      } else if (pattern === 1) {
        const offsets = this.phase === 2 ? [[0,0],[100,0],[-100,0],[0,100],[0,-100]] : [[0,0],[110,65],[-110,-65]];
        const cx=Phaser.Math.Clamp(player.x,675,1117),cy=Phaser.Math.Clamp(player.y,548,668);
        for (const [ox,oy] of offsets) this.hazards.push({ kind:'circle', x:cx+ox, y:cy+oy, dx:0,dy:0,radius:64,length:0,age:0,windup:1150,fired:false });
      } else {
        // Spore volley also gets an explicit, local 0.95s windup indicator.
        this.hazards.push({ kind:'circle',x:this.x,y:this.y,dx:dx/len,dy:dy/len,radius:92,length:-1,age:0,windup:950,fired:false });
      }
    }
    this.updateHazards(player,delta);
    this.updatePresentation();
    return null;
  }
  private updateHazards(player: EnemyTarget, delta: number): void {
    const g=this.telegraphs.clear();
    for (let i=this.hazards.length-1;i>=0;i--) {
      const h=this.hazards[i]; h.age+=delta;
      if (h.age>=h.windup && !h.fired) {
        h.fired=true;
        if (h.kind==='lane') {
          this.chargeMs=700; this.chargeX=h.dx; this.chargeY=h.dy;
        } else if (h.length===-1) {
          const count=this.phase===2?16:12, base=Math.atan2(h.dy,h.dx);
          this.beginRecovery(900);
          for(let j=0;j<count;j++) {
            const angle=base+j/count*Math.PI*2;
            this.hooks.shoot(h.x,h.y,Math.cos(angle),Math.sin(angle),14,this.phase===2?205:170);
          }
        } else {
          this.beginRecovery(700);
          if (Math.hypot(player.x-h.x,player.y-h.y)<h.radius+8) this.hooks.damagePlayer(23);
        }
      }
      if (h.age>h.windup+300) { this.hazards.splice(i,1); continue; }
      const progress=Math.min(1,h.age/h.windup);
      const color=h.fired?0xffd8a0:h.length===-1?0xc59be8:0xee795d;
      g.lineStyle(2,color,h.fired?0.9:0.8);
      if (h.kind==='circle') {
        g.fillStyle(color,h.fired?0.2:0.06).fillCircle(h.x,h.y,h.radius);
        g.strokeCircle(h.x,h.y,h.radius);
        g.lineStyle(3,color,0.65).beginPath().arc(h.x,h.y,h.radius-5,-Math.PI/2,-Math.PI/2+progress*Math.PI*2,false).strokePath();
        g.lineBetween(h.x-6,h.y,h.x+6,h.y); g.lineBetween(h.x,h.y-6,h.x,h.y+6);
      } else {
        const nx=-h.dy*h.radius,ny=h.dx*h.radius;
        g.fillStyle(color,0.08+progress*0.09).beginPath().moveTo(h.x+nx,h.y+ny).lineTo(h.x+h.dx*h.length+nx,h.y+h.dy*h.length+ny).lineTo(h.x+h.dx*h.length-nx,h.y+h.dy*h.length-ny).lineTo(h.x-nx,h.y-ny).closePath().fillPath().strokePath();
        g.lineStyle(3,color,0.8).lineBetween(h.x,h.y,h.x+h.dx*h.length*progress,h.y+h.dy*h.length*progress);
      }
    }
  }
  private updatePresentation(): void {
    const exposed = this.isExposed;
    const texture = exposed ? 'boss_crownroot_open' : 'boss_crownroot';
    if (this.texture.key !== texture) this.setTexture(texture);
    // Angle-only posing preserves the authoritative Arcade body dimensions.
    const windup = this.hazards.find(h => !h.fired);
    this.setRotation(exposed ? Math.sin(this.poseClock / 70) * 0.012 :
      this.chargeMs > 0 ? this.chargeX * 0.055 : windup ? Math.sin(this.poseClock / 48) * 0.018 : Math.sin(this.poseClock / 430) * 0.009);
    const g = this.weakpoint.clear();
    if (!exposed) return;
    const remaining = this.recoveryMs / this.recoveryDuration;
    const glow = 0.45 + 0.15 * Math.sin(this.poseClock / 55);
    // Exposed heart and broken-rib brackets, rather than another damage zone.
    const x = this.x, y = this.y - 40;
    g.fillStyle(0xffd68c, glow).fillEllipse(x, y, 19, 37);
    g.lineStyle(2, 0xffe4a7, 0.9);
    for (const side of [-1, 1]) {
      g.lineBetween(x+side*23,y-16,x+side*32,y-23);
      g.lineBetween(x+side*32,y-23,x+side*38,y-23);
      g.lineBetween(x+side*23,y+16,x+side*32,y+23);
    }
    g.lineStyle(3,0xf4cf89,0.8).beginPath().arc(x,this.y+5,52,-Math.PI/2,-Math.PI/2+remaining*Math.PI*2,false).strokePath();
  }
  destroy(fromScene?: boolean): void {
    this.telegraphs?.destroy(); this.weakpoint?.destroy(); this.hazards=[];
    this.recoveryMs=0; super.destroy(fromScene);
  }
}

/** Code-native pixel painting: antler crown, bone ribs, jointed roots, living heart. */
function makeBossTexture(scene: Phaser.Scene): void {
  if(scene.textures.exists('boss_crownroot') && scene.textures.exists('boss_crownroot_open')) return;
  const c=document.createElement('canvas'); c.width=c.height=96;
  const ctx=c.getContext('2d')!; ctx.imageSmoothingEnabled=false;
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const line=(x:number,y:number,xx:number,yy:number,width:number,color:string)=>{
    const steps=Math.max(Math.abs(xx-x),Math.abs(yy-y));
    for(let i=0;i<=steps;i++) rect(Math.round(x+(xx-x)*i/(steps||1)),Math.round(y+(yy-y)*i/(steps||1)),width,width,color);
  };
  for(const sign of [-1,1]) {
    const px=(x:number)=>sign===1?x:94-x;
    for(const [y,ex,ey] of [[46,12,37],[57,5,65],[68,14,84]]) {
      line(px(31),y,px(ex),ey,6,'#100f1b'); line(px(31),y,px(ex),ey,3,'#565c52');
      line(px(ex),ey,px(ex-3),ey+12,5,'#141421');line(px(ex),ey,px(ex-3),ey+12,2,'#a5a17b');
      rect(px(ex),ey,3,3,'#e0c28d');
    }
    line(px(37),30,px(25),16,6,'#161521'); line(px(25),16,px(26),3,5,'#161521');
    line(px(38),30,px(26),16,3,'#c1b88c'); line(px(27),17,px(27),4,2,'#ece1b0');
    line(px(28),18,px(17),11,3,'#948d70');line(px(33),25,px(35),9,3,'#b6ad83');
  }
  for(const [x,y,w,h,col] of [[30,28,36,48,'#10101b'],[25,39,46,28,'#141522'],[32,29,32,45,'#5a5948'],[28,42,40,24,'#39463f'],[36,28,24,49,'#888365'],[38,32,20,45,'#32363c'],[34,37,28,32,'#544641'] ] as [number,number,number,number,string][]) rect(x,y,w,h,col);
  for(let i=0;i<5;i++) {
    const y=39+i*6;
    line(30,y,41,y+4,3,'#d1c293');line(63,y,52,y+4,3,'#b7ae80');
    line(32,y+3,40,y+5,2,'#6d7056');line(61,y+3,54,y+5,2,'#6d7056');
  }
  rect(42,42,12,24,'#271d2b');rect(44,45,8,17,'#a93b4b');rect(46,47,4,13,'#f08d69');rect(47,48,2,8,'#ffe3a0');
  rect(34,27,28,9,'#171521');rect(37,26,22,7,'#b2ac83');rect(39,29,18,9,'#242733');
  rect(39,31,5,3,'#f4c774');rect(52,31,5,3,'#f4c774');rect(46,35,4,5,'#858a70');
  line(47,25,45,12,4,'#9e9c78');line(49,25,52,10,3,'#dad0a2');
  rect(39,75,18,6,'#171926');rect(42,76,12,3,'#8a8865');
  for(const [x,y] of [[21,46],[72,50],[28,72],[64,70],[39,21],[57,17]]) rect(x,y,2,2,'#90b7a1');
  if (!scene.textures.exists('boss_crownroot')) scene.textures.addCanvas('boss_crownroot',c);
  // Same dimensions/origin/body. The armoured ribs open sideways to reveal a
  // larger living heart. This is a real alternate pose, not a full-sprite tint.
  const open=document.createElement('canvas');open.width=open.height=96;
  const oc=open.getContext('2d')!;oc.imageSmoothingEnabled=false;oc.drawImage(c,0,0);
  oc.clearRect(27,38,42,35);
  const r=(x:number,y:number,w:number,h:number,color:string)=>{oc.fillStyle=color;oc.fillRect(x,y,w,h);};
  r(35,38,26,35,'#1c1927');r(39,40,18,30,'#762e43');r(42,42,12,25,'#dc7556');
  r(44,44,8,19,'#ffd592');r(46,46,4,13,'#fff3cb');
  for(let i=0;i<5;i++){
    const y=39+i*6;
    r(26-i%2*2,y,12,3,'#d1c293');r(25-i%2*2,y+3,10,2,'#6d7056');
    r(58+i%2*2,y,12,3,'#b7ae80');r(61+i%2*2,y+3,10,2,'#6d7056');
  }
  if (!scene.textures.exists('boss_crownroot_open')) scene.textures.addCanvas('boss_crownroot_open',open);
}
