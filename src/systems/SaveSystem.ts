import type { ClassId } from '../data/classes';
import { ALL_TALENT_NODES, getTalentNode } from '../data/talents';
import { detectDefaultLang, i18n, type Lang } from '../i18n/i18n';

const SAVE_KEY = 'seed_of_the_abyss_save_v1';

export interface PermanentStats {
  maxHp: number;
  damage: number;
  moveSpeed: number;
  essenceGain: number;
  lifesteal: number;
  armor: number;
  critChance: number;
}

export interface VideoSettings {
  /** Internal render-resolution multiplier of 1280×720 (0.75/1/1.5/2). */
  renderScale: number;
  /** Desktop: start fullscreen. */
  fullscreen: boolean;
  /** Desktop: window content size. */
  winW: number;
  winH: number;
}

export interface SaveData {
  essence: number;
  /** Lifetime essence ever earned — seed stage grows from this, so spending
   * essence on talents never regresses your stage. */
  totalEssenceEarned: number;
  totalDeaths: number;
  deepestFloor: number;
  talentRanks: Record<string, number>;
  selectedClass: ClassId;
  unlockedClasses: ClassId[];
  seedStage: number;
  /** Persisted UI language. null/undefined = auto-detect once. */
  language: Lang | null;
  video: VideoSettings;
}

const DEFAULT_SAVE: SaveData = {
  essence: 0,
  totalEssenceEarned: 0,
  totalDeaths: 0,
  deepestFloor: 0,
  talentRanks: {},
  selectedClass: 'warden',
  unlockedClasses: ['warden', 'reaver', 'shade'],
  seedStage: 1,
  language: null,
  video: { renderScale: 1, fullscreen: false, winW: 1280, winH: 720 },
};

export class SaveSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
    this.applyLanguage();
  }

  get essence(): number {
    return this.data.essence;
  }

  get talentRanks(): Record<string, number> {
    return this.data.talentRanks;
  }

  get selectedClass(): ClassId {
    return this.data.selectedClass;
  }

  get seedStage(): number {
    return this.data.seedStage;
  }

  get totalDeaths(): number {
    return this.data.totalDeaths;
  }

  get deepestFloor(): number {
    return this.data.deepestFloor;
  }

  get language(): Lang {
    return this.data.language ?? detectDefaultLang();
  }

  get video(): VideoSettings {
    return { ...this.data.video };
  }

  setRenderScale(scale: number): void {
    this.data.video.renderScale = scale;
    this.persist();
  }

  setFullscreen(flag: boolean): void {
    this.data.video.fullscreen = flag;
    this.persist();
  }

  setWindowSize(w: number, h: number): void {
    this.data.video.winW = Math.round(w);
    this.data.video.winH = Math.round(h);
    this.persist();
  }

  setLanguage(lang: Lang): void {
    this.data.language = lang;
    i18n.setLang(lang);
    this.persist();
  }

  setSelectedClass(id: ClassId): void {
    this.data.selectedClass = id;
    this.persist();
  }

  getTalentRank(id: string): number {
    return this.data.talentRanks[id] ?? 0;
  }

  canUnlockTalent(id: string): boolean {
    const node = getTalentNode(id);
    if (!node) return false;
    const rank = this.getTalentRank(id);
    if (rank >= node.maxRank) return false;
    if (this.data.essence < node.costPerRank) return false;
    if (node.requires && this.getTalentRank(node.requires) < 1) return false;
    return true;
  }

  unlockTalent(id: string): boolean {
    if (!this.canUnlockTalent(id)) return false;
    const node = getTalentNode(id)!;
    this.data.essence -= node.costPerRank;
    this.data.talentRanks[id] = this.getTalentRank(id) + 1;
    this.persist();
    return true;
  }

  computePermanentStats(): PermanentStats {
    const stats: PermanentStats = {
      maxHp: 0,
      damage: 0,
      moveSpeed: 0,
      essenceGain: 0,
      lifesteal: 0,
      armor: 0,
      critChance: 0,
    };

    for (const node of ALL_TALENT_NODES) {
      const rank = this.getTalentRank(node.id);
      if (rank <= 0) continue;
      for (const [key, value] of Object.entries(node.effects)) {
        if (typeof value === 'number') {
          stats[key as keyof PermanentStats] += value * rank;
        }
      }
    }

    const stageBonus = (this.data.seedStage - 1) * 0.02;
    stats.damage += this.data.seedStage - 1;
    stats.maxHp += (this.data.seedStage - 1) * 4;
    stats.moveSpeed += stageBonus;

    return stats;
  }

  settleDeath(run: {
    floor: number;
    kills: number;
    timeAliveSec: number;
    damageDealt: number;
  }): { gained: number; newStage: boolean; essenceBefore: number } {
    const perm = this.computePermanentStats();
    const raw =
      run.kills * 2 +
      run.floor * 8 +
      Math.floor(run.timeAliveSec / 10) +
      Math.floor(run.damageDealt / 80);
    const gained = Math.max(1, Math.floor(raw * (1 + perm.essenceGain)));

    const essenceBefore = this.data.essence;
    this.data.essence += gained;
    this.data.totalEssenceEarned += gained;
    this.data.totalDeaths += 1;
    this.data.deepestFloor = Math.max(this.data.deepestFloor, run.floor);

    // Stage follows lifetime earnings, not the current balance — previously
    // buying talents (spending essence) could drag your stage back down.
    const stageBefore = this.data.seedStage;
    this.data.seedStage =
      1 + Math.floor(this.data.totalDeaths / 3) + Math.floor(this.data.totalEssenceEarned / 40);
    const newStage = this.data.seedStage > stageBefore;

    this.persist();
    return { gained, newStage, essenceBefore };
  }

  resetAll(): void {
    const keepLang = this.data.language;
    // Video settings are device prefs, not progress — survive a save reset.
    const keepVideo = this.data.video;
    this.data = structuredClone(DEFAULT_SAVE);
    this.data.language = keepLang;
    this.data.video = keepVideo;
    this.applyLanguage();
    this.persist();
  }

  private applyLanguage(): void {
    const lang = this.data.language ?? detectDefaultLang();
    // Persist first-run auto detection so it stays stable after install.
    if (this.data.language == null) {
      this.data.language = lang;
      this.persist();
    }
    i18n.setLang(lang);
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const language =
        parsed.language === 'zh' || parsed.language === 'en' ? parsed.language : null;
      return {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed,
        language,
        // Migrate old saves: unknown lifetime earnings -> at least the
        // current balance, so the stage never drops on upgrade.
        totalEssenceEarned: Math.max(
          parsed.totalEssenceEarned ?? 0,
          parsed.essence ?? 0,
        ),
        talentRanks: parsed.talentRanks ?? {},
        unlockedClasses: parsed.unlockedClasses ?? [...DEFAULT_SAVE.unlockedClasses],
        // Old saves have no video block — merge over defaults.
        video: { ...structuredClone(DEFAULT_SAVE.video), ...(parsed.video ?? {}) },
      };
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Private mode / quota — the session keeps running without persistence.
    }
  }
}

export const saveSystem = new SaveSystem();
