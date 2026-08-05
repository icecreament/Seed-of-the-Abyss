export type ClassId = 'warden' | 'reaver' | 'shade' | 'thorn';

export type AttackType = 'melee' | 'ranged';

export interface ClassDef {
  id: ClassId;
  color: number;
  baseHp: number;
  baseDamage: number;
  baseSpeed: number;
  attackCooldown: number;
  /** Melee: swing reach. Ranged: projectile travel distance. */
  attackRange: number;
  attackType: AttackType;
  /** Ranged only: projectile px/s. */
  projectileSpeed?: number;
  dashCooldown: number;
  skillCooldown: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warden: {
    id: 'warden',
    color: 0x4ecdc4,
    baseHp: 140,
    baseDamage: 16,
    baseSpeed: 165,
    attackCooldown: 300,
    attackRange: 52,
    attackType: 'melee',
    dashCooldown: 900,
    skillCooldown: 7000,
  },
  reaver: {
    id: 'reaver',
    color: 0xff6b6b,
    baseHp: 110,
    baseDamage: 19,
    baseSpeed: 180,
    attackCooldown: 300,
    attackRange: 48,
    attackType: 'melee',
    dashCooldown: 750,
    skillCooldown: 6500,
  },
  shade: {
    id: 'shade',
    color: 0xb794f6,
    baseHp: 95,
    baseDamage: 15,
    baseSpeed: 205,
    attackCooldown: 240,
    attackRange: 44,
    attackType: 'melee',
    dashCooldown: 600,
    skillCooldown: 5500,
  },
  // Ranged pays ~20% DPS for safety; lowest HP and pillar-blocked shots are
  // the counterweights. Skill is a point-blank nova for when mobs close in.
  thorn: {
    id: 'thorn',
    color: 0x6bcb77,
    baseHp: 85,
    baseDamage: 10,
    baseSpeed: 195,
    attackCooldown: 210,
    attackRange: 300,
    attackType: 'ranged',
    projectileSpeed: 360,
    dashCooldown: 700,
    skillCooldown: 6000,
  },
};

export const CLASS_LIST = Object.values(CLASSES);

/** Texture key per class — shared by Player, menu preview and class cards. */
export const HERO_TEXTURES: Record<ClassId, string> = {
  warden: 'hero_warden',
  reaver: 'hero_reaver',
  shade: 'hero_shade',
  thorn: 'hero_thorn',
};
