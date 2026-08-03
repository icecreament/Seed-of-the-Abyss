export type Lang = 'zh' | 'en';

type Dict = Record<string, string>;

const zh: Dict = {
  // Brand
  game_title: '深渊之种',
  game_title_en_sub: 'Seed of the Abyss',

  // Menu
  menu_seed_stage: '种子阶段',
  menu_essence: '深渊精华',
  menu_deaths: '死亡次数',
  menu_deepest: '最深楼层',
  menu_class: '职业',
  menu_perm_stats: '永久属性',
  menu_enter: '进入深渊',
  menu_talents: '天赋路线',
  menu_reset: '重置存档',
  menu_language: '语言',
  menu_controls_pc: '键鼠：WASD 移动 · 左键/空格 攻击 · Shift 冲刺 · Q 技能',
  menu_controls_mobile: '触屏：左侧摇杆 + 右侧攻击/冲刺/技能',
  menu_hp: '生命',
  menu_dmg: '伤害',
  menu_armor: '护甲',
  menu_settings: '设置',

  // Settings
  settings_title: '设置',
  settings_resolution: '渲染分辨率',
  settings_display: '显示模式',
  settings_fullscreen: '全屏',
  settings_windowed: '窗口',
  settings_window_size: '窗口大小',
  settings_cycle: '切换',
  settings_back: '返回',
  settings_hint: '分辨率即时生效；窗口与全屏设置仅限桌面版',
  settings_browser_hint: '浏览器：按 F11 切换全屏',
  res_perf: '流畅',
  res_standard: '标准',
  res_hd: '高清',
  res_ultra: '极致',

  // Portrait overlay
  rotate_title: '请旋转设备',
  rotate_hint: '本游戏为横屏体验设计，旋转后继续',

  // Class select
  class_title: '选择职业路线',
  class_back: '返回',
  class_begin: '开始探索',
  class_skill: '技能',
  class_hp: '生命',
  class_dmg: '伤害',
  class_spd: '移速',

  // Classes
  class_warden: '守望者',
  class_warden_desc: '坚韧近战。更高生命与防护，技能可短暂格挡。',
  class_warden_skill: '壁垒',
  class_reaver: '掠夺者',
  class_reaver_desc: '高爆发近战。攻击更狠，击杀可回复生命。',
  class_reaver_skill: '血涌',
  class_shade: '影行者',
  class_shade_desc: '机动刺客。移速更快，技能进入短暂隐匿。',
  class_shade_skill: '暗影步',

  // Talents
  talent_title: '天赋路线',
  talent_essence: '深渊精华',
  talent_hint: '点击节点投入精华',
  talent_back: '返回',
  talent_requires: '需先解锁前置',
  talent_maxed: '已满级',
  talent_cost: '消耗',
  talent_ready: '可升级',
  talent_need: '精华不足',
  talent_rank: '等级',

  tree_growth: '滋生',
  tree_predation: '掠食',
  tree_resilience: '韧性',

  talent_growth_root: '根系汲取',
  talent_growth_root_desc: '每级 +12 最大生命',
  talent_growth_bloom: '绽放核心',
  talent_growth_bloom_desc: '每级 +8% 精华获取',
  talent_growth_canopy: '冠层脉动',
  talent_growth_canopy_desc: '每级 +4% 移动速度',
  talent_pred_fang: '深渊之牙',
  talent_pred_fang_desc: '每级 +2 伤害',
  talent_pred_blood: '血之代价',
  talent_pred_blood_desc: '每级 +3% 生命偷取',
  talent_pred_frenzy: '种子狂乱',
  talent_pred_frenzy_desc: '每级 +5% 暴击率',
  talent_res_shell: '甲壳硬化',
  talent_res_shell_desc: '每级 +1 护甲（减伤）',
  talent_res_bind: '缚脉',
  talent_res_bind_desc: '每级 +10 最大生命',
  talent_res_iron: '铁种',
  talent_res_iron_desc: '每级 +2 护甲与 +6 最大生命',

  // Run HUD
  run_floor: '楼层',
  run_kills: '击杀',
  run_atk: '攻击',
  run_dash: '冲刺',
  run_skill: '技能',
  run_ready: '就绪',
  run_stage: '阶段',
  run_floor_up: '楼层',
  run_paused: '已暂停',
  run_resume: '继续 (Esc)',
  run_quit: '退出本局',
  run_progress: '进度',
  run_elite: '精英',

  // Death
  death_title: '种子正在进食',
  death_subtitle: '死亡即进化',
  death_no_data: '没有本局数据。',
  death_floor: '抵达楼层',
  death_kills: '击杀数',
  death_time: '存活时间',
  death_damage: '造成伤害',
  death_gained: '获得深渊精华',
  death_essence_total: '精华总计',
  death_seed_stage: '种子阶段',
  death_evolved: '已进化',
  death_lifetime: '累计死亡',
  death_talents: '天赋',
  death_menu: '主菜单',
  death_seconds: '秒',

  // Virtual controls
  btn_atk: '攻',
  btn_dash: '冲',
  btn_skill: '技',

  // Common
  lang_zh: '中文',
  lang_en: 'English',
};

const en: Dict = {
  game_title: 'Seed of the Abyss',
  game_title_en_sub: '深渊之种',

  menu_seed_stage: 'Seed Stage',
  menu_essence: 'Abyss Essence',
  menu_deaths: 'Deaths',
  menu_deepest: 'Deepest Floor',
  menu_class: 'Class',
  menu_perm_stats: 'Permanent',
  menu_enter: 'Enter the Abyss',
  menu_talents: 'Talent Trees',
  menu_reset: 'Reset Save',
  menu_language: 'Language',
  menu_controls_pc: 'PC: WASD move · LMB/Space attack · Shift dash · Q skill',
  menu_controls_mobile: 'Mobile: left stick + attack/dash/skill buttons',
  menu_hp: 'HP',
  menu_dmg: 'DMG',
  menu_armor: 'Armor',
  menu_settings: 'Settings',

  settings_title: 'SETTINGS',
  settings_resolution: 'Render Resolution',
  settings_display: 'Display Mode',
  settings_fullscreen: 'Fullscreen',
  settings_windowed: 'Windowed',
  settings_window_size: 'Window Size',
  settings_cycle: 'Change',
  settings_back: 'Back',
  settings_hint: 'Resolution applies instantly. Window & fullscreen are desktop-only.',
  settings_browser_hint: 'Browser: press F11 to toggle fullscreen',
  res_perf: 'Performance',
  res_standard: 'Standard',
  res_hd: 'HD',
  res_ultra: 'Ultra',

  rotate_title: 'Rotate Your Device',
  rotate_hint: 'Designed for landscape — rotate to continue',

  class_title: 'Choose Your Path',
  class_back: 'Back',
  class_begin: 'Begin Run',
  class_skill: 'Skill',
  class_hp: 'HP',
  class_dmg: 'DMG',
  class_spd: 'SPD',

  class_warden: 'Warden',
  class_warden_desc: 'Sturdy melee. Higher HP and defense. Skill briefly blocks damage.',
  class_warden_skill: 'Bulwark',
  class_reaver: 'Reaver',
  class_reaver_desc: 'High-burst melee. Harder hits and heal on kill.',
  class_reaver_skill: 'Blood Surge',
  class_shade: 'Shade',
  class_shade_desc: 'Mobile assassin. Faster movement. Skill grants brief stealth.',
  class_shade_skill: 'Veil Step',

  talent_title: 'Talent Trees',
  talent_essence: 'Abyss Essence',
  talent_hint: 'Click a node to invest',
  talent_back: 'Back',
  talent_requires: 'Requires previous node',
  talent_maxed: 'MAXED',
  talent_cost: 'Cost',
  talent_ready: 'Ready',
  talent_need: 'Need essence',
  talent_rank: 'Rank',

  tree_growth: 'Growth',
  tree_predation: 'Predation',
  tree_resilience: 'Resilience',

  talent_growth_root: 'Root Feed',
  talent_growth_root_desc: '+12 Max HP per rank',
  talent_growth_bloom: 'Blooming Core',
  talent_growth_bloom_desc: '+8% Essence gain per rank',
  talent_growth_canopy: 'Canopy Pulse',
  talent_growth_canopy_desc: '+4% move speed per rank',
  talent_pred_fang: 'Abyss Fang',
  talent_pred_fang_desc: '+2 damage per rank',
  talent_pred_blood: 'Blood Price',
  talent_pred_blood_desc: '+3% lifesteal per rank',
  talent_pred_frenzy: 'Seed Frenzy',
  talent_pred_frenzy_desc: '+5% crit chance per rank',
  talent_res_shell: 'Shell Harden',
  talent_res_shell_desc: '+1 armor per rank (damage reduction)',
  talent_res_bind: 'Bind Veins',
  talent_res_bind_desc: '+10 Max HP per rank',
  talent_res_iron: 'Iron Seed',
  talent_res_iron_desc: '+2 armor and +6 Max HP per rank',

  run_floor: 'Floor',
  run_kills: 'Kills',
  run_atk: 'ATK',
  run_dash: 'DASH',
  run_skill: 'SKL',
  run_ready: 'OK',
  run_stage: 'Stage',
  run_floor_up: 'Floor',
  run_paused: 'PAUSED',
  run_resume: 'Resume (Esc)',
  run_quit: 'Abandon Run',
  run_progress: 'Progress',
  run_elite: 'Elite',

  death_title: 'THE SEED FEEDS',
  death_subtitle: 'Death is Evolution',
  death_no_data: 'No run data.',
  death_floor: 'Floor reached',
  death_kills: 'Kills',
  death_time: 'Time alive',
  death_damage: 'Damage dealt',
  death_gained: 'Abyss Essence gained',
  death_essence_total: 'Essence total',
  death_seed_stage: 'Seed Stage',
  death_evolved: 'EVOLVED',
  death_lifetime: 'Lifetime deaths',
  death_talents: 'Talents',
  death_menu: 'Main Menu',
  death_seconds: 's',

  btn_atk: 'ATK',
  btn_dash: 'DASH',
  btn_skill: 'SKL',

  lang_zh: '中文',
  lang_en: 'English',
};

const TABLES: Record<Lang, Dict> = { zh, en };

/** Browser / system locale → game language. zh* defaults to Chinese. */
export function detectDefaultLang(): Lang {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const list: string[] = [];
    if (nav?.languages?.length) list.push(...nav.languages);
    if (nav?.language) list.push(nav.language);
    // Intl fallback
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      if (locale) list.push(locale);
    } catch {
      /* ignore */
    }
    for (const raw of list) {
      const code = raw.toLowerCase();
      if (code.startsWith('zh')) return 'zh';
    }
    return 'en';
  } catch {
    return 'en';
  }
}

class I18n {
  private lang: Lang = detectDefaultLang();

  get current(): Lang {
    return this.lang;
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    }
    if (typeof window !== 'undefined') {
      // main.ts refreshes DOM overlays (rotate hint) with the new language.
      window.dispatchEvent(new CustomEvent('seed:lang-changed'));
    }
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const table = TABLES[this.lang] ?? TABLES.en;
    let s = table[key] ?? TABLES.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return s;
  }

  /** Class display helpers */
  className(id: 'warden' | 'reaver' | 'shade'): string {
    return this.t(`class_${id}`);
  }

  classDesc(id: 'warden' | 'reaver' | 'shade'): string {
    return this.t(`class_${id}_desc`);
  }

  classSkill(id: 'warden' | 'reaver' | 'shade'): string {
    return this.t(`class_${id}_skill`);
  }

  treeName(id: 'growth' | 'predation' | 'resilience'): string {
    return this.t(`tree_${id}`);
  }
}

export const i18n = new I18n();
export const t = (key: string, vars?: Record<string, string | number>) => i18n.t(key, vars);
