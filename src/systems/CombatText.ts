/** Display-only combat clock and bounded lanes. Never aggregates or changes damage. */
export type CombatTextKind = 'normal' | 'critical' | 'payoff' | 'hurt' | 'notice';
export const COMBAT_TEXT = {
  limit: 32, perOwner: 3, lift: 12,
  styles: {
    normal: { size: 12, life: 500, priority: 1, bold: false },
    critical: { size: 16, life: 600, priority: 2, bold: true },
    payoff: { size: 18, life: 650, priority: 3, bold: true },
    hurt: { size: 14, life: 600, priority: 4, bold: true },
    notice: { size: 12, life: 600, priority: 3, bold: false },
  },
} as const;
export interface CombatTextRequest {
  x: number; y: number; text: string; color: string; kind: CombatTextKind; owner?: object;
}
export interface CombatTextEntry extends CombatTextRequest {
  id: number; age: number; width: number; height: number;
}
export class CombatTextPool {
  private nextId = 1;
  readonly entries: CombatTextEntry[] = [];

  push(request: CombatTextRequest): CombatTextEntry | undefined {
    if (![request.x, request.y].every(Number.isFinite) || !request.text || !Object.prototype.hasOwnProperty.call(COMBAT_TEXT.styles,request.kind)) return;
    const style = COMBAT_TEXT.styles[request.kind];
    const related = request.owner ? this.entries.filter(e => e.owner === request.owner) : [];
    // Preflight both constraints. A rejected low-priority message must not evict anything.
    const victims = new Set<CombatTextEntry>();
    const reserve = (candidates: CombatTextEntry[]): boolean => {
      const ordered = candidates.filter(e => !victims.has(e)).sort((a,b) =>
        COMBAT_TEXT.styles[a.kind].priority - COMBAT_TEXT.styles[b.kind].priority || a.id-b.id);
      const victim = ordered[0];
      if (!victim || COMBAT_TEXT.styles[victim.kind].priority > style.priority) return false;
      victims.add(victim); return true;
    };
    if (related.length >= COMBAT_TEXT.perOwner && !reserve(related)) return;
    if (this.entries.length-victims.size >= COMBAT_TEXT.limit && !reserve(this.entries)) return;
    // Lane rectangles include the small rise, keeping feedback off the contact silhouette.
    const width = [...request.text].reduce((n,c) => n + (c.charCodeAt(0)>255 ? 1 : .63), 0)*style.size+6;
    const height = style.size+6;
    const occupied=this.entries.filter(e=>!victims.has(e));
    const candidates=[];
    for(const dy of [0,-(height+14),-2*(height+14)])for(const dx of [0,-24,24,-48,48]){
      const x=request.x+dx,y=request.y+dy;
      const blockers=occupied.filter(e=>Math.abs(x-e.x)<(width+e.width)/2+2 &&
        Math.abs(y-e.y)<(height+e.height)/2+COMBAT_TEXT.lift);
      candidates.push({x,y,blockers});
    }
    let lane=candidates.find(c=>c.blockers.length===0);
    if(!lane && request.kind!=='normal'){
      // Important feedback may replace nearby ordinary numbers, never another fresh payoff.
      lane=candidates.filter(c=>c.blockers.length<=2 && c.blockers.every(e=>
        COMBAT_TEXT.styles[e.kind].priority<style.priority ||
        COMBAT_TEXT.styles[e.kind].priority===style.priority && e.age>COMBAT_TEXT.styles[e.kind].life*.55))
        .sort((a,b)=>a.blockers.length-b.blockers.length)[0];
    }
    if(!lane)return; // Dense crowds may omit weak popups; damage/statistics are untouched.
    for(const blocker of lane.blockers)victims.add(blocker);
    const {x,y}=lane;
    for (const victim of victims) this.entries.splice(this.entries.indexOf(victim),1);
    const entry={...request,x,y,id:this.nextId++,age:0,width,height};
    this.entries.push(entry); return entry;
  }
  update(delta: number): void {
    if (!Number.isFinite(delta) || delta<=0) return;
    for (let i=this.entries.length-1;i>=0;i--) {
      const e=this.entries[i]; e.age+=delta;
      if(e.age>=COMBAT_TEXT.styles[e.kind].life)this.entries.splice(i,1);
    }
  }
  clear(): void { this.entries.length=0; }
}
