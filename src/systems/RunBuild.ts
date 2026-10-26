import type { ClassId } from '../data/classes';
import { i18n } from '../i18n/i18n';

export interface Mutation {
  id: string;
  owner: ClassId | 'shared';
  name: [string, string];
  description: [string, string];
  mark: string;
  /** Run-local prerequisites; locked choices are neither offered nor acquirable. */
  requires?: readonly string[];
}

/** Run-local only. No save writes and no duplicates, including after scene restart. */
export const MUTATIONS: readonly Mutation[] = [
  { id: 'warden_thorns', owner: 'warden', mark: 'I', name: ['荆冠领域', 'Crown of Thorns'], description: ['壁垒持续期间，每 0.6 秒对身边 110 范围造成 65% 伤害。', 'During Bulwark, pulse 65% damage within 110 every 0.6s.'] },
  { id: 'warden_ram', owner: 'warden', mark: 'II', name: ['破城骨槌', 'Siegebone'], description: ['冲刺后的首次普攻附带 120 范围、100% 伤害的震地。', 'Your first attack after a dash triggers a 120-radius, 100% damage quake.'] },
  { id: 'warden_rootline', owner: 'warden', mark: 'III', requires: ['warden_thorns'], name: ['裂根回击', 'Rootline Reprisal'], description: ['蓄势反击送出行进280距离的地行根刃，继承本次反击伤害；受墙阻挡。同刀已命中的敌人不重复受伤。', 'Paid counters send a 280-range root blade for the same strike damage. Walls stop it. Foes hit by the same melee swing are skipped.'] },
  { id: 'reaver_bleed', owner: 'reaver', mark: 'I', name: ['血棘刻印', 'Bloodbrand'], description: ['普攻流血：每秒 30%，持续 3 秒。移动并再按普攻，可消耗刀外近敌的剩余流血追斩。追中原目标结清流血；失手不返还。', 'Basic hits bleed: 30%/s for 3s. Move toward a nearby wounded foe outside melee reach and press attack again to spend its bleed on pursuit. Hit that foe to cash out; miss and the bleed is lost.'] },
  { id: 'reaver_cleave', owner: 'reaver', mark: 'II', name: ['第三次葬礼', 'Third Requiem'], description: ['每第三次普攻追加 110 范围、90% 伤害的环形斩。', 'Every third attack adds a 110-radius cleave for 90% damage.'] },
  { id: 'reaver_relay', owner: 'reaver', mark: 'III', requires: ['reaver_bleed'], name: ['血债接力', 'Blooddebt Relay'], description: ['重按普攻可结清刀内一处伤口，刀外仍可追斩；命中把最多3跳接到160内最近无债敌人。墙阻断，接债不即伤。', 'Fresh basics cash out one wound in your melee arc, or pursue outside it. Paid hits relay up to 3 ticks to the nearest debt-free foe within 160. Walls block; transfer deals no instant damage.'] },
  { id: 'shade_ambush', owner: 'shade', mark: 'I', name: ['无声处刑', 'Silent Execution'], description: ['隐身后的首次普攻必定暴击；击杀敌人返还 0.4 秒冲刺冷却。', 'Your stealth-breaking attack always crits. Kills refund 0.4s of dash cooldown.'] },
  { id: 'shade_decoy', owner: 'shade', mark: 'II', name: ['蜕影替身', 'Shed Shadow'], description: ['发动暗影步时，原地留下持续 2 秒的诱饵，吸引普通敌人。', 'Shadow Step leaves a 2s decoy that attracts regular enemies.'] },
  { id: 'thorn_seeds', owner: 'thorn', mark: 'I', name: ['寄生花冢', 'Parasite Bloom'], description: ['普攻对每个目标植种，最多 3 层；新星可远程引爆全部种子，无需靠近，每层 90% 伤害。', 'Shots plant up to 3 seeds/foe. Nova detonates all: 90% each, any distance.'] },
  { id: 'thorn_fork', owner: 'thorn', mark: 'II', name: ['三歧脊枝', 'Trifid Spine'], description: ['普攻额外发射两枚侧向种刺，各造成 50% 伤害，同样能植种。', 'Basic attacks fire two extra angled seeds at 50% damage. These also plant seeds.'] },
  { id: 'thorn_graft', owner: 'thorn', mark: 'III', requires: ['thorn_seeds'], name: ['溢种蔓生', 'Overflow Graft'], description: ['普攻命中满种目标，向130范围内最近的未满种敌人植种1层；受墙阻挡，不额外伤害。', 'Basic hits on a fully seeded foe plant 1 seed on the nearest unripe foe within 130. Walls block the graft. No extra damage.'] },
  { id: 'shared_feast', owner: 'shared', mark: '+', name: ['吞生根须', 'Feasting Roots'], description: ['每次击杀恢复 3 点生命。', 'Restore 3 HP on every kill.'] },
  { id: 'shared_haste', owner: 'shared', mark: '+', name: ['循环腺体', 'Cycle Gland'], description: ['每次击杀返还技能与冲刺各 0.35 秒冷却。', 'Kills refund 0.35s of both skill and dash cooldowns.'] },
  { id: 'shared_dash', owner: 'shared', mark: '+', name: ['蜕壳爆裂', 'Molting Burst'], description: ['普通冲刺结束时，在落点产生 100 范围、75% 伤害的爆裂。', 'At the end of a regular dash, burst for 75% damage within 100.'] },
  { id: 'shared_spite', owner: 'shared', mark: '+', name: ['逆生骨刺', 'Spitebone'], description: ['实际受到伤害时，向周围 100 范围反击 80% 伤害（冷却 1 秒）。', 'Taking damage retaliates for 80% damage within 100 (1s cooldown).'] },
];

export function mutationName(m: Mutation): string { return m.name[i18n.current === 'en' ? 1 : 0]; }
export function mutationDescription(m: Mutation): string { return m.description[i18n.current === 'en' ? 1 : 0]; }

export class RunBuild {
  readonly owned: string[] = [];
  constructor(readonly classId: ClassId) {}
  has(id: string): boolean { return this.owned.includes(id); }
  acquire(id: string): boolean {
    const m = MUTATIONS.find(m => m.id === id);
    if (!m || !this.eligible(m)) return false;
    this.owned.push(id);
    return true;
  }
  private eligible(m: Mutation): boolean {
    return !this.has(m.id) && (m.owner === 'shared' || m.owner === this.classId) &&
      (m.requires ?? []).every(id => this.has(id));
  }
  /** Show up to two available profession routes side by side, then a shared alternative. */
  offer(random: () => number = Math.random): Mutation[] {
    const pool = MUTATIONS.filter(m => this.eligible(m));
    const shuffle = (list: Mutation[]) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const specific = shuffle(pool.filter(m => m.owner === this.classId)).slice(0, 2);
    const rest = shuffle(pool.filter(m => !specific.includes(m)));
    return [...specific, ...rest.slice(0, 3 - specific.length)];
  }
}
