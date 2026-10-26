/** Read-only skill affordance. No distance/LOS filter: the existing bloom is global. */
export interface ThornBloomCue {
  readonly active: boolean;
  readonly stage: 'nova' | 'growing' | 'ripe' | 'cooldown';
  readonly targets: number;
  readonly ripe: number;
  readonly detonate: boolean;
  readonly ready: boolean;
  readonly emphasis: boolean;
}

export function thornBloomCue(input: {
  readonly active: boolean;
  readonly unlocked: boolean;
  readonly summary: { readonly targets: number; readonly ripe: number };
  readonly remaining: number;
}): ThornBloomCue {
  const { active, unlocked, summary, remaining } = input;
  const targets = active && unlocked && Number.isInteger(summary.targets) && summary.targets > 0 ? summary.targets : 0;
  const ripe = targets && Number.isFinite(summary.ripe) ? Math.max(0, Math.min(targets, Math.floor(summary.ripe))) : 0;
  // Unknown cooldown must never advertise a ready action.
  const ready = active && Number.isFinite(remaining) && remaining <= 0;
  const detonate = targets > 0;
  const stage = !detonate ? 'nova' : !ready ? 'cooldown' : ripe > 0 ? 'ripe' : 'growing';
  return { active, stage, targets, ripe, detonate, ready, emphasis: stage === 'ripe' };
}
