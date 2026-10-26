export interface FocusRect { x: number; y: number; width: number; height: number }

/** Project into 1280×720 HUD design space, not canvas/device pixels. */
export function projectCombatRect(rect: FocusRect, camera: {
  scrollX: number; scrollY: number; width: number; height: number; zoom: number;
}, renderScale: number, padding = 10): FocusRect {
  const scale = renderScale > 0 ? renderScale : 1;
  const ratio = camera.zoom / scale;
  return {
    x: (camera.width / 2 + (rect.x - camera.scrollX - camera.width / 2) * camera.zoom) / scale - padding,
    y: (camera.height / 2 + (rect.y - camera.scrollY - camera.height / 2) * camera.zoom) / scale - padding,
    width: rect.width * ratio + padding * 2,
    height: rect.height * ratio + padding * 2,
  };
}
export function focusOverlaps(a: FocusRect, b: FocusRect): boolean {
  return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
}

/** UI-time only: fast reveal, slow restore, and a hold to avoid edge flicker. */
export class HudPeek {
  private hold = 0;
  private amount = 0;
  get value(): number { return this.amount; }
  update(overlap: boolean, delta: number, enabled = true): number {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (enabled && overlap) {
      this.hold = 240;
      this.amount = Math.min(1, this.amount + dt/65);
    } else {
      // Spend the hold first. A long frame must not also spend its full delta
      // restoring opacity, or a 250ms hitch would skip the promised hold.
      const held = enabled ? Math.min(dt, this.hold) : 0;
      this.hold = enabled ? Math.max(0, this.hold-dt) : 0;
      this.amount = Math.min(1, this.amount + held/65);
      this.amount = Math.max(0, this.amount - (dt-held)/220);
    }
    return this.amount;
  }
  alpha(minimum: number): number { return 1-this.amount*(1-minimum); }
  reset(): void { this.hold=this.amount=0; }
}

interface AlphaTarget { alpha: number; setAlpha(alpha: number): unknown }
export interface PeekLayer { target: AlphaTarget; minimum: number }

/** Only owns explicitly registered alpha channels; no hit areas, position or input changes. */
export class CombatHudFocus {
  private regions: Array<{bounds: FocusRect; peek: HudPeek; layers: Array<PeekLayer & {base: number}>}> = [];
  register(bounds: FocusRect, layers: PeekLayer[]): void {
    this.regions.push({bounds,peek:new HudPeek(),layers:layers.map(layer=>({...layer,base:layer.target.alpha}))});
  }
  update(focus: readonly FocusRect[], delta: number, enabled = true): void {
    for(const region of this.regions){
      region.peek.update(focus.some(rect=>focusOverlaps(rect,region.bounds)),delta,enabled);
      for(const layer of region.layers)layer.target.setAlpha(layer.base*region.peek.alpha(layer.minimum));
    }
  }
  reset(): void {
    for(const region of this.regions){region.peek.reset();for(const layer of region.layers)layer.target.setAlpha(layer.base);}
  }
  clear(): void { this.reset();this.regions=[]; }
}
