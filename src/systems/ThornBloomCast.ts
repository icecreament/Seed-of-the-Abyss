/** Visual-only bloom release. It never owns a cooldown, movement or damage window. */
export const THORN_CAST = { duration: 180, cells: 4 } as const;
export class ThornBloomCast {
  remaining = 0;
  get frame(): number | undefined {
    return this.remaining > 0 ? Math.min(THORN_CAST.cells-1,Math.floor((THORN_CAST.duration-this.remaining)/(THORN_CAST.duration/THORN_CAST.cells))) : undefined;
  }
  begin(enabled=true): boolean {
    if(!enabled){this.cancel();return false;}
    if(this.remaining>0)return false;
    this.remaining=THORN_CAST.duration;return true;
  }
  update(delta:number): void {
    if(Number.isFinite(delta)&&delta>=0)this.remaining=Math.max(0,this.remaining-delta);
  }
  cancel(): void { this.remaining=0; }
}
