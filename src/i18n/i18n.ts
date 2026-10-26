import type { ClassId } from '../data/classes';

export type Lang = 'zh' | 'en';

type Dict = Record<string, string>;

const zh: Dict = {
  feel_chain: '连斩',
  feel_parry: '破弹',
  awakening_tag: '觉醒',
  elite_brute: '根槌精英',
  elite_windup: '蓄力 · 攻击破招 {current}/{total}',
  elite_exposed: '破绽 +25% · {time}s',
  elite_break: '破招！',
  elite_breaks: '精英破招',
  ranged_interrupt: '打断',
  feel_best_chain: '最高连斩',
  feel_pause_hint: 'M 切换音效 · 设置中可关闭震屏与闪光',
  settings_sfx: '战斗音效',
  settings_impact: '打击镜头',
  sfx_off: '静音',
  feedback_full: '震屏 + 闪光',
  feedback_calm: '舒适模式 · 无震屏/闪光',
  chapter_name: '第一章 · 枯冠根庭',
  chapter_victory: '根冠已碎 · 章节通关',
  chapter_victory_sub: '你带着寄生之种走出了根庭。通关奖励：基础精华额外 +100。',
  chapter_abandoned: '契约中止',
  chapter_abandoned_sub: '已结算本局精华；主动撤离不计入死亡次数。',
  mutation_kicker: '第 {floor} 层已净化 · 共生契约',
  mutation_title: '选择你的寄生突变',
  mutation_subtitle: '本局生效，不写入永久天赋。下一层恢复 20% 生命。',
  mutation_shared: '通用组织',
  mutation_choose: '融合',
  mutation_hint: '点击卡片或按 1 / 2 / 3 · 选择期间战斗与冷却完全暂停',
  mutation_build: '本局突变',
  boss_name: '枯冠母体',
  boss_phase: '阶段',
  boss_progress: '讨伐',
  boss_floor: '根庭核心',
  boss_intro: '枯冠母体 · 根庭之主',
  boss_phase_two: '冠骨崩裂 · 狂生阶段',
  boss_cue_exposed: '核心暴露 · 伤害 +35% · 无接触伤害',
  boss_cue_charge: '锁定冲锋 · 侧移躲避，诱导撞墙',
  boss_cue_spikes: '根刺将至 · 离开标记区域',
  boss_cue_volley: '孢子蓄势 · 注意弹幕间隙',
  boss_cue_hunting: '寻找破绽 · 躲过重击后反攻',
  // Brand
  game_title: '深渊之种',
  game_title_en_sub: 'Seed of the Abyss',

  // Menu
  menu_sanctum: '种子圣所',
  menu_kicker: '死亡不是终点，生长才是。',
  menu_display_title: '深渊之种',
  menu_display_subtitle: 'S E E D   O F   T H E   A B Y S S',
  menu_lore: '携一颗不灭的种子，走入无光之地。\n每一次陨落，都将成为下一次觉醒。',
  menu_bound: '当前契约',
  menu_seed_stage: '种子阶段',
  menu_essence: '深渊精华',
  menu_deaths: '死亡次数',
  menu_deepest: '最深楼层',
  menu_class: '职业',
  menu_perm_stats: '永久属性',
  menu_enter: '进入深渊',
  menu_talents: '天赋路线',
  menu_reset: '重置存档',
  menu_reset_confirm: '确定清除全部成长进度吗？此操作无法撤销。',
  common_cancel: '取消',
  menu_language: '语言',
  menu_controls_pc: '键鼠：WASD 移动 · 左键/空格 攻击 · Shift 冲刺 · Q 技能',
  menu_controls_mobile: '触屏：左摇杆移动 · 按住攻击键拖动可瞄准任意方向',
  menu_hp: '生命',
  menu_dmg: '伤害',
  menu_armor: '护甲',
  menu_settings: '设置',

  // Settings
  settings_title: '设置',
  settings_resolution: '分辨率',
  settings_display: '显示模式',
  settings_fullscreen: '全屏',
  settings_windowed: '窗口',
  settings_back: '返回',
  settings_hint: '分辨率即时生效；桌面版会同时调整窗口大小',
  settings_browser_hint: '浏览器：按 F11 切换全屏',
  res_perf: '流畅',
  res_standard: '标准',
  res_hd: '高清',
  res_ultra: '极致',

  // Portrait overlay
  rotate_title: '请旋转设备',
  rotate_hint: '本游戏为横屏体验设计，旋转后继续',

  // Class select
  class_gallery_hint: '四条道路，同一颗不灭的种子。',
  class_selected: '已选择',
  class_warden_role: '重甲 · 坚守',
  class_reaver_role: '巨刃 · 侵蚀',
  class_shade_role: '双匕 · 潜行',
  class_title: '选择职业路线',
  class_back: '返回',
  class_begin: '开始探索',
  class_skill: '技能',
  class_hp: '生命',
  class_dmg: '伤害',
  class_spd: '移速',

  // Classes
  class_warden: '守望者',
  class_warden_desc: '重装近战。壁垒震退近敌（175%伤害）并减伤75%。\n实际承伤蓄势，1.2秒内重按普攻反击；每次壁垒限一次，额外伤害≤基础攻击。',
  class_warden_skill: '壁垒',
  warden_counter: '壁垒反击',
  warden_counter_release: '松开普攻，再按反击',
  warden_counter_recover: '收刀中 · 准备反击',
  warden_counter_buffered: '已接招 · 等待出刀',
  warden_counter_ready: '重按普攻反击',
  warden_guard_gain: '蓄势 +{damage}',
  warden_guard_ready: '架盾迎击 · 原地接弹',
  warden_guard_hold: '壁垒中 · 稳住接弹',
  warden_guard_touch: '技能键',
  warden_counter_hit: '壁垒反击！',
  class_reaver: '掠夺者',
  class_reaver_desc: '血刃近战。血涌增伤 60%、加速并震伤近敌，命中回血。击杀后 1.2 秒内朝近敌移动并再按普攻可追斩；长按不触发。',
  reaver_pursuit_ready: '追斩就绪 · 朝近敌移动并再按普攻',
  reaver_pursuit_active: '追斩',
  reaver_rip_ready: '血棘 · 朝刀外伤口移动，再按普攻追斩',
  reaver_rip_active: '撕裂追斩',
  reaver_focus_committed: '血棘 ×{pulses} · 追猎已承诺',
  reaver_focus_hit: '撕裂兑现 ×{pulses}',
  reaver_focus_miss: '追斩落空 · 伤口已消耗',
  reaver_focus_lost: '目标倒下 · 伤口未兑现',
  reaver_focus_cancelled: '追猎中断 · 伤口已消耗',
  reaver_rip_hit: '撕裂',
  reaver_pursuit_wait: '追斩待机 · 寻找刀外近敌',
  reaver_melee_ready: '重按普攻 · 就近结清',
  reaver_melee_release: '松开普攻，再按结清',
  reaver_melee_recover: '收刀中 · 准备重按',
  reaver_melee_buffered: '已接招 · 就近结清',
  reaver_cue_relay: '接力血债',
  reaver_cue_wound: '血棘',
  reaver_cue_kill: '追斩',
  reaver_cue_move: '朝标记移动，再按普攻',
  reaver_cue_release: '松开普攻，再按追斩',
  reaver_cue_recover: '收刀中 · 准备重按普攻',
  reaver_cue_buffered: '已接招 · 保持向前',
  reaver_cue_ready: '再按普攻追入',
  class_reaver_skill: '血涌',
  class_shade: '影行者',
  class_shade_desc: '暗影步隐匿突进；破隐首击造成220%伤害并斩碎近身敌弹。隐身长按择机，再按出刀。命中后短时原地冲刺回身，方向输入优先。',
  class_shade_skill: '暗影步',
  shade_return_touch: '冲刺键',
  shade_return_back: '原地回身 · 方向输入优先',
  shade_return_direction: '方向冲刺 · 松开方向可回身',
  shade_return_wait: '回身窗口 · 冲刺冷却',
  shade_return_hidden: '隐匿 · 长按择机，再按出刀',
  class_thorn: '棘语者',
  class_thorn_desc: '远程棘术。种刺风筝敌人，新星震开近敌并发射八向种刺。',
  class_thorn_skill: '荆棘新星',
  thorn_seeded: '植种',
  thorn_ripe: '满种',
  thorn_bloom_ready: '引爆',
  thorn_bloom_action: '远程引爆',
  thorn_bloom_range: '无需靠近',
  thorn_bloom_ripe_ready: '满种 {count} · 就绪',
  thorn_bloom_seeded_ready: '植种 {count} · 就绪',
  thorn_bloom_touch: '技能键',
  thorn_bloom_hit: '花冢引爆',
  class_thorn_role: '远程 · 荆棘',

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
  talent_pred_fang_desc: '每级 +7% 伤害',
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
  run_vital: '生命体征',
  run_progress: '本层进度',
  run_seed_link: '寄生阶段',
  run_floor: '楼层',
  run_kills: '击杀',
  run_atk: '攻击',
  run_dash: '冲刺',
  run_skill: '技能',
  run_ready: '就绪',
  run_stage: '阶段',
  run_floor_up: '楼层',
  run_paused: '已暂停',
  run_pause: '暂停',
  run_resume: '继续 (Esc)',
  run_quit: '退出本局',
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
  death_retry: '再来一局',
  death_retry_class: '继续使用 {class}',
  death_retry_key: 'R 快速重开',
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
  feel_chain: 'CHAIN',
  feel_parry: 'SHATTER',
  awakening_tag: 'AWAKENED',
  elite_brute: 'ROOTHAMMER',
  elite_windup: 'WINDUP · BREAK {current}/{total}',
  elite_exposed: 'EXPOSED +25% · {time}s',
  elite_break: 'BROKEN!',
  elite_breaks: 'Elite breaks',
  ranged_interrupt: 'DENIED',
  feel_best_chain: 'Best chain',
  feel_pause_hint: 'M toggles sound · Disable shake / flashes in Settings',
  settings_sfx: 'Combat sound',
  settings_impact: 'Impact camera',
  sfx_off: 'Muted',
  feedback_full: 'Shake + flashes',
  feedback_calm: 'Calm · no shake / flashes',
  chapter_name: 'CHAPTER I · THE CROWNROOT COURT',
  chapter_victory: 'CROWN SHATTERED · VICTORY',
  chapter_victory_sub: 'You escaped the root court. Chapter reward: +100 base essence.',
  chapter_abandoned: 'CONTRACT ENDED',
  chapter_abandoned_sub: 'Run essence settled. Retreat does not count as a death.',
  mutation_kicker: 'FLOOR {floor} PURGED · SYMBIOSIS',
  mutation_title: 'Choose a parasite mutation',
  mutation_subtitle: 'This run only. Recover 20% HP before entering the next room.',
  mutation_shared: 'SHARED ORGAN',
  mutation_choose: 'BIND',
  mutation_hint: 'Click a card or press 1 / 2 / 3 · Combat and cooldowns are frozen',
  mutation_build: 'Run mutations',
  boss_name: 'THE CROWNROOT',
  boss_phase: 'PHASE',
  boss_progress: 'HUNT',
  boss_floor: 'ROOT CORE',
  boss_intro: 'THE CROWNROOT · LORD OF THE COURT',
  boss_phase_two: 'CROWN RUPTURE · OVERGROWTH',
  boss_cue_exposed: 'CORE EXPOSED · +35% DAMAGE · NO CONTACT DAMAGE',
  boss_cue_charge: 'CHARGE LOCKED · SIDESTEP / BAIT INTO A WALL',
  boss_cue_spikes: 'ROOT SPIKES · LEAVE THE MARKED GROUND',
  boss_cue_volley: 'SPORE VOLLEY · WATCH THE GAPS',
  boss_cue_hunting: 'DODGE THE HEAVY ATTACK, THEN PUNISH',
  game_title: 'Seed of the Abyss',
  game_title_en_sub: '深渊之种',

  menu_sanctum: 'THE SEED SANCTUM',
  menu_kicker: 'DEATH IS ONLY THE BEGINNING.',
  menu_display_title: 'SEED OF\nTHE ABYSS',
  menu_display_subtitle: 'A   S E E D   B E Y O N D   D E A T H',
  menu_lore: 'Carry an undying seed into the dark.\nEvery fall takes root in your next awakening.',
  menu_bound: 'BOUND TO',
  menu_seed_stage: 'Seed Stage',
  menu_essence: 'Abyss Essence',
  menu_deaths: 'Deaths',
  menu_deepest: 'Deepest Floor',
  menu_class: 'Class',
  menu_perm_stats: 'Permanent',
  menu_enter: 'Enter the Abyss',
  menu_talents: 'Talent Trees',
  menu_reset: 'Reset Save',
  menu_reset_confirm: 'Erase all progression? This cannot be undone.',
  common_cancel: 'Cancel',
  menu_language: 'Language',
  menu_controls_pc: 'PC: WASD move · LMB/Space attack · Shift dash · Q skill',
  menu_controls_mobile: 'Mobile: left stick to move · hold & drag ATK to aim any direction',
  menu_hp: 'HP',
  menu_dmg: 'DMG',
  menu_armor: 'Armor',
  menu_settings: 'Settings',

  settings_title: 'SETTINGS',
  settings_resolution: 'Resolution',
  settings_display: 'Display Mode',
  settings_fullscreen: 'Fullscreen',
  settings_windowed: 'Windowed',
  settings_back: 'Back',
  settings_hint: 'Resolution applies instantly; on desktop it also resizes the window.',
  settings_browser_hint: 'Browser: press F11 to toggle fullscreen',
  res_perf: 'Performance',
  res_standard: 'Standard',
  res_hd: 'HD',
  res_ultra: 'Ultra',

  rotate_title: 'Rotate Your Device',
  rotate_hint: 'Designed for landscape — rotate to continue',

  class_gallery_hint: 'Four paths. One undying seed.',
  class_selected: 'Selected',
  class_warden_role: 'PLATE / RESOLVE',
  class_reaver_role: 'CLEAVER / CORRUPTION',
  class_shade_role: 'DAGGERS / SHADOW',
  class_title: 'Choose Your Path',
  class_back: 'Back',
  class_begin: 'Begin Run',
  class_skill: 'Skill',
  class_hp: 'HP',
  class_dmg: 'DMG',
  class_spd: 'SPD',

  class_warden: 'Warden',
  class_warden_desc: 'Heavy melee. Bulwark blasts nearby foes for 175% damage and grants 75% damage reduction.\nDamage actually prevented builds one reprisal per cast: press attack again within 1.2s; bonus capped at base attack damage.',
  class_warden_skill: 'Bulwark',
  warden_counter: 'REPRISAL',
  warden_counter_release: 'Release attack, then press again',
  warden_counter_recover: 'Recovering · prepare to retaliate',
  warden_counter_buffered: 'Reprisal buffered · waiting to strike',
  warden_counter_ready: 'Press attack again to retaliate',
  warden_guard_gain: 'GUARD +{damage}',
  warden_guard_ready: 'Stand still and brace',
  warden_guard_hold: 'Bulwark active · hold position',
  warden_guard_touch: 'Skill',
  warden_counter_hit: 'REPRISAL!',
  class_reaver: 'Reaver',
  class_reaver_desc: 'Blood melee. Surge blasts foes; +60% damage and faster attacks. Heal on hit. After a kill: move toward a nearby foe and press attack again within 1.2s to pursue. Holding does not trigger it.',
  reaver_pursuit_ready: 'PURSUIT READY · Move toward a nearby foe + press attack again',
  reaver_pursuit_active: 'PURSUIT',
  reaver_rip_ready: 'BLOODBRAND · Move toward a wound + press attack again',
  reaver_rip_active: 'RENDING PURSUIT',
  reaver_focus_committed: 'BLOODBRAND ×{pulses} · committed',
  reaver_focus_hit: 'REND paid out ×{pulses}',
  reaver_focus_miss: 'Pursuit missed · wound spent',
  reaver_focus_lost: 'Target down · no wound payout',
  reaver_focus_cancelled: 'Pursuit interrupted · wound spent',
  reaver_rip_hit: 'REND',
  reaver_pursuit_wait: 'PURSUIT ARMED · Find a nearby foe beyond reach',
  reaver_melee_ready: 'Press attack again · settle in melee',
  reaver_melee_release: 'Release attack, then press to settle',
  reaver_melee_recover: 'Recovering · prepare another press',
  reaver_melee_buffered: 'Attack buffered · settle in melee',
  reaver_cue_relay: 'INHERITED DEBT',
  reaver_cue_wound: 'BLOODBRAND',
  reaver_cue_kill: 'PURSUIT',
  reaver_cue_move: 'Move toward the mark, then press attack',
  reaver_cue_release: 'Release attack, then press again',
  reaver_cue_recover: 'Recovering · prepare another press',
  reaver_cue_buffered: 'Attack buffered · keep moving forward',
  reaver_cue_ready: 'Press attack again to close in',
  class_reaver_skill: 'Blood Surge',
  class_shade: 'Shade',
  class_shade_desc: 'Shadow Step cloaks and dashes. First strike: 220% damage; shatters nearby hostile shots. Cloaked: hold for a hit/shatter; press again to strike. After a hit, dash with no movement to retreat briefly; movement overrides.',
  class_thorn: 'Thorn',
  class_thorn_desc: 'Ranged thorncaster. Nova blasts nearby foes back and fires eight radial seeds.',
  class_thorn_skill: 'Thorn Nova',
  thorn_seeded: 'Seeded',
  thorn_ripe: 'Ripe',
  thorn_bloom_ready: 'Detonate',
  thorn_bloom_action: 'Detonate',
  thorn_bloom_range: 'Any distance',
  thorn_bloom_ripe_ready: '{count} ripe · Ready',
  thorn_bloom_seeded_ready: '{count} seeded · Ready',
  thorn_bloom_touch: 'Skill',
  thorn_bloom_hit: 'Parasite Bloom',
  class_thorn_role: 'SEED STAFF / THORNS',
  class_shade_skill: 'Veil Step',
  shade_return_touch: 'DASH',
  shade_return_back: 'Retreat · movement overrides',
  shade_return_direction: 'Directional dash · release movement to retreat',
  shade_return_wait: 'Retreat window · dash cooldown',
  shade_return_hidden: 'CLOAKED · hold to wait, press again to strike',

  talent_title: 'Talent Trees',
  talent_essence: 'Abyss Essence',
  talent_hint: 'Click a node to invest',
  talent_back: 'Back',
  talent_requires: 'Requires previous node',
  talent_maxed: 'MAXED',
  talent_cost: 'Cost',
  talent_ready: 'Ready',
  talent_need: 'Need essence',

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
  talent_pred_fang_desc: '+7% damage per rank',
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

  run_vital: 'VITAL SIGNS',
  run_progress: 'FLOOR PROGRESS',
  run_seed_link: 'SEED STAGE',
  run_floor: 'Floor',
  run_kills: 'Kills',
  run_atk: 'ATK',
  run_dash: 'DASH',
  run_skill: 'SKL',
  run_ready: 'OK',
  run_stage: 'Stage',
  run_floor_up: 'Floor',
  run_paused: 'PAUSED',
  run_pause: 'Pause',
  run_resume: 'Resume (Esc)',
  run_quit: 'Abandon Run',
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
  death_retry: 'Try Again',
  death_retry_class: 'Same class: {class}',
  death_retry_key: 'R to retry',
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
  className(id: ClassId): string {
    return this.t(`class_${id}`);
  }

  classDesc(id: ClassId): string {
    return this.t(`class_${id}_desc`);
  }

  classSkill(id: ClassId): string {
    return this.t(`class_${id}_skill`);
  }

  treeName(id: 'growth' | 'predation' | 'resilience'): string {
    return this.t(`tree_${id}`);
  }
}

export const i18n = new I18n();
export const t = (key: string, vars?: Record<string, string | number>) => i18n.t(key, vars);
