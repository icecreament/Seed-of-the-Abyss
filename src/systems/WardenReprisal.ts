/** A heavy guard earns one deliberately released attack per real Bulwark cast.
 * No damage prevention, healing, movement or invulnerability is implemented here.
 */
export const WARDEN_REPRISAL = { window: 1200 } as const;
export const WARDEN_BULWARK_RADIUS = 125;

export class WardenReprisal {
  private accepting = false;
  private spent = false;
  damage = 0;
  remaining = 0;
  cap = 0;
  get canEarn(): boolean { return this.accepting && !this.spent && this.cap>0; }
  get available(): boolean { return this.damage > 0 && this.remaining > 0 && !this.spent; }
  begin(baseDamage: number): void {
    this.cancel();
    this.cap=Number.isFinite(baseDamage)?Math.max(0,Math.floor(baseDamage)):0;
    this.accepting=this.cap>0;
  }
  /** Stop new earnings when Bulwark ends; an already paid opportunity may finish its clock. */
  closeGuard(): void { this.accepting=false; }
  absorb(prevented: number): number {
    if (!this.accepting || this.spent || !Number.isFinite(prevented) || prevented <= 0) return 0;
    const before=this.damage;
    this.damage=Math.min(this.cap,this.damage+Math.floor(prevented));
    if (this.damage>0) this.remaining=WARDEN_REPRISAL.window;
    return this.damage-before;
  }
  update(delta: number): void {
    if (!Number.isFinite(delta) || delta<=0) return;
    this.remaining=Math.max(0,this.remaining-delta);
    if (this.remaining===0) this.damage=0;
  }
  /** Caller only consumes after a fresh ordinary swing has actually passed its cooldown. */
  consume(): number {
    if (!this.available) return 0;
    const damage=this.damage;
    this.damage=this.remaining=0;this.spent=true;this.accepting=false;
    return damage;
  }
  cancel(): void { this.accepting=this.spent=false;this.damage=this.remaining=this.cap=0; }
}

/** Only the additional HP reduction due to Bulwark pays; armor alone cannot farm pressure. */
export function bulwarkPrevented(rawDamage: number, armor: number): number {
  if (![rawDamage,armor].every(Number.isFinite) || rawDamage<=0 || armor<0) return 0;
  const ordinary=Math.max(1,rawDamage-armor);
  const guarded=Math.max(1,Math.floor(rawDamage*0.25)-armor);
  return Math.max(0,Math.floor(ordinary-guarded));
}
