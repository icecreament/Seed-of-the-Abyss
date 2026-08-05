export type TalentTreeId = 'growth' | 'predation' | 'resilience';

export interface TalentNode {
  id: string;
  tree: TalentTreeId;
  /** i18n key suffix, e.g. growth_root -> talent_growth_root */
  i18nKey: string;
  maxRank: number;
  costPerRank: number;
  requires?: string;
  effects: {
    maxHp?: number;
    damage?: number;
    /** Fractional damage bonus (0.07 = +7%) — scales equally across classes,
     * unlike flat damage which favors low-damage fast attackers. */
    damageMul?: number;
    moveSpeed?: number;
    essenceGain?: number;
    lifesteal?: number;
    armor?: number;
    critChance?: number;
  };
}

export const TALENT_TREES: Record<
  TalentTreeId,
  { id: TalentTreeId; color: number; nodes: TalentNode[] }
> = {
  growth: {
    id: 'growth',
    color: 0x6bcb77,
    nodes: [
      {
        id: 'growth_root',
        tree: 'growth',
        i18nKey: 'growth_root',
        maxRank: 5,
        costPerRank: 1,
        effects: { maxHp: 12 },
      },
      {
        id: 'growth_bloom',
        tree: 'growth',
        i18nKey: 'growth_bloom',
        maxRank: 3,
        costPerRank: 1,
        requires: 'growth_root',
        effects: { essenceGain: 0.08 },
      },
      {
        id: 'growth_canopy',
        tree: 'growth',
        i18nKey: 'growth_canopy',
        maxRank: 3,
        costPerRank: 2,
        requires: 'growth_bloom',
        effects: { moveSpeed: 0.04 },
      },
    ],
  },
  predation: {
    id: 'predation',
    color: 0xff6b6b,
    nodes: [
      {
        id: 'pred_fang',
        tree: 'predation',
        i18nKey: 'pred_fang',
        maxRank: 5,
        costPerRank: 1,
        effects: { damageMul: 0.07 },
      },
      {
        id: 'pred_blood',
        tree: 'predation',
        i18nKey: 'pred_blood',
        maxRank: 3,
        costPerRank: 1,
        requires: 'pred_fang',
        effects: { lifesteal: 0.03 },
      },
      {
        id: 'pred_frenzy',
        tree: 'predation',
        i18nKey: 'pred_frenzy',
        maxRank: 3,
        costPerRank: 2,
        requires: 'pred_blood',
        effects: { critChance: 0.05 },
      },
    ],
  },
  resilience: {
    id: 'resilience',
    color: 0x4d96ff,
    nodes: [
      {
        id: 'res_shell',
        tree: 'resilience',
        i18nKey: 'res_shell',
        maxRank: 5,
        costPerRank: 1,
        effects: { armor: 1 },
      },
      {
        id: 'res_bind',
        tree: 'resilience',
        i18nKey: 'res_bind',
        maxRank: 3,
        costPerRank: 1,
        requires: 'res_shell',
        effects: { maxHp: 10 },
      },
      {
        id: 'res_iron',
        tree: 'resilience',
        i18nKey: 'res_iron',
        maxRank: 2,
        costPerRank: 2,
        requires: 'res_bind',
        effects: { armor: 2, maxHp: 6 },
      },
    ],
  },
};

export const ALL_TALENT_NODES: TalentNode[] = Object.values(TALENT_TREES).flatMap((t) => t.nodes);

export function getTalentNode(id: string): TalentNode | undefined {
  return ALL_TALENT_NODES.find((n) => n.id === id);
}
