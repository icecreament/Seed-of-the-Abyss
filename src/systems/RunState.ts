import type { ClassId } from '../data/classes';

export interface RunMetrics {
  floor: number;
  kills: number;
  timeAliveSec: number;
  damageDealt: number;
  classId: ClassId;
  /** Missing in legacy callers means a death. */
  outcome?: 'death' | 'abandoned' | 'victory';
  mutations?: string[];
  bestChain?: number;
  eliteBreaks?: number;
}

/** Ephemeral state shared between Run and Death scenes. */
export const runState: {
  lastRun: RunMetrics | null;
  /** Prevents double settle if Death scene restarts. */
  deathSettled: boolean;
} = {
  lastRun: null,
  deathSettled: false,
};
