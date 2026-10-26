import Phaser from 'phaser';
import { COMBAT_TEXT, CombatTextPool, type CombatTextRequest } from '../systems/CombatText';
import { UI_FONT } from './theme';

/** One scene-owned pool, no delayed calls/tweens and no stateful combat dependencies. */
export class CombatTextPresentation {
  readonly pool = new CombatTextPool();
  private labels = new Map<number, Phaser.GameObjects.Text>();
  constructor(private scene: Phaser.Scene, private motion:()=>boolean) {}
  show(request: CombatTextRequest): void {
    const entry=this.pool.push(request); if(!entry)return;
    this.sync();
  }
  update(delta: number): void { this.pool.update(delta); this.sync(); }
  private sync(): void {
    const active=new Set(this.pool.entries.map(e=>e.id));
    for(const [id,label] of this.labels)if(!active.has(id)){label.destroy();this.labels.delete(id);}
    const motion=this.motion();
    for(const e of this.pool.entries){
      const style=COMBAT_TEXT.styles[e.kind];
      let label=this.labels.get(e.id);
      if(!label){
        label=this.scene.add.text(e.x,e.y,e.text,{fontFamily:UI_FONT,fontSize:style.size+'px',color:e.color,
          fontStyle:style.bold?'bold':'normal',stroke:'#070a10',strokeThickness:3})
          .setOrigin(.5).setDepth(200+style.priority);
        this.labels.set(e.id,label);
      }
      const progress=e.age/style.life;
      label.setPosition(e.x,e.y-(motion?COMBAT_TEXT.lift*progress:0));
      label.setAlpha(progress<.55?1:Math.max(0,(1-progress)/.45));
    }
  }
  clear(): void {
    this.pool.clear(); for(const label of this.labels.values())label.destroy(); this.labels.clear();
  }
  destroy(): void { this.clear(); }
}
