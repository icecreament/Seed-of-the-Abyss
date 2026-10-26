// Frozen 2026-10-22 pre-cue selector; truncated before its first gameplay write.
class LegacySelection {
  legacyChoice() {
    const p=this.player;
    const bloodbrand=p.classId==='reaver' && !!this.build?.has('reaver_bleed');
    if (p.classId!=='reaver' || (!p.pursuitAvailable && !bloodbrand) || !p.attackReady || p.isDashing || p.isPursuing || this.ended || this.paused || this.choosing) return false;
    const aim=p.facingDir, move=p.moveIntent;
    if ((this.enemies.getChildren() as Enemy[]).some(enemy => enemy.active && enemy.isTargetable &&
      meleeArcContains(enemy.x-p.x,enemy.y-p.y,aim.x,aim.y,p.stats.attackRange,enemy.hitRadius))) return false;
    let choice: { target: Enemy; travel: number; pulses: number } | undefined, closest=Infinity;
    for (const enemy of this.enemies.getChildren() as Enemy[]) {
      if (!enemy.active || !enemy.isTargetable || !this.navigation?.clearLine(p.x,p.y,enemy.x,enemy.y)) continue;
      const mark=this.marks.get(enemy);
      const pulses=bloodbrand && mark ? remainingBleedPulses(mark.bleed,mark.tick) : 0;
      if (!p.pursuitAvailable && !pulses) continue;
      const dx=enemy.x-p.x, dy=enemy.y-p.y;
      const travel=pursuitTravel(dx,dy,move.x,move.y,aim.x,aim.y,p.stats.attackRange,enemy.hitRadius);
      if (travel!==null && Math.hypot(dx,dy)<closest) { choice={target:enemy,travel,pulses}; closest=Math.hypot(dx,dy); }
    }
    return choice;
  }
}
