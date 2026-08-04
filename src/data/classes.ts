export type ClassId = 'warden' | 'reaver' | 'shade';

export interface ClassDef {
  id: ClassId;
  color: number;
  baseHp: number;
  baseDamage: number;
  baseSpeed: number;
  attackCooldown: number;
  attackRange: number;
  dashCooldown: number;
  skillCooldown: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warden: {
    id: 'warden',
    color: 0x4ecdc4,
    baseHp: 140,
    baseDamage: 14,
    baseSpeed: 165,
    attackCooldown: 320,
    attackRange: 52,
    dashCooldown: 900,
    skillCooldown: 7000,
  },
  reaver: {
    id: 'reaver',
    color: 0xff6b6b,
    baseHp: 110,
    baseDamage: 20,
    baseSpeed: 180,
    attackCooldown: 280,
    attackRange: 48,
    dashCooldown: 750,
    skillCooldown: 6500,
  },
  shade: {
    id: 'shade',
    color: 0xb794f6,
    baseHp: 95,
    baseDamage: 16,
    baseSpeed: 205,
    attackCooldown: 240,
    attackRange: 44,
    dashCooldown: 600,
    skillCooldown: 5500,
  },
};

export const CLASS_LIST = Object.values(CLASSES);

/** Texture key per class — shared by Player, menu preview and class cards. */
export const HERO_TEXTURES: Record<ClassId, string> = {
  warden: 'hero_warden',
  reaver: 'hero_reaver',
  shade: 'hero_shade',
};
