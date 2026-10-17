import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { CLASS_LIST } from '../data/classes';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
import {
  createPanel,
  createPortraitPlinth,
  drawSanctumBackdrop,
} from '../ui/SceneDecor';
import { UI, UI_FONT, bodyStyle } from '../ui/theme';
import { i18n, t, type Lang } from '../i18n/i18n';
import { fadeInScene, goScene } from '../ui/transitions';

export class MenuScene extends Phaser.Scene {
  private resetDialog?: Phaser.GameObjects.Container;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.resetDialog = undefined;
    this.input.enabled = true;
    fadeInScene(this);
    drawSanctumBackdrop(this);

    const label = (x: number, y: number, text: string, size = '14px', color: string = UI.textDim) =>
      this.add.text(x, y, text, bodyStyle(size, color)).setDepth(10);
    label(72, 32, 'S / A', '20px', UI.textGood);
    label(154, 37, t('menu_sanctum'), '13px');
    label(72, 119, t('menu_kicker'), '14px', UI.textGood);
    this.add.text(68, i18n.current === 'zh' ? 163 : 144, t('menu_display_title'), {
      fontFamily: 'Georgia, Songti SC, SimSun, serif',
      fontSize: i18n.current === 'zh' ? '78px' : '52px',
      color: '#ece6d8', lineSpacing: -8,
    }).setDepth(10);
    label(74, 259, t('menu_display_subtitle'), '14px', '#acaaad');
    this.add.text(74, 302, t('menu_lore'), {
      ...bodyStyle('17px', '#a5a6b4'), lineSpacing: 9, wordWrap: { width: 430 },
    }).setDepth(10);
    this.add.rectangle(74, 286, 46, 2, UI.teal, 0.7).setOrigin(0, 0).setDepth(10);

    const seed = this.add.image(872, 193, 'icon_seed').setScale(3).setDepth(2);
    this.tweens.add({ targets: seed, y: 187, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    CLASS_LIST.forEach((cls, i) => {
      const x = 702 + i * 170;
      const selected = cls.id === saveSystem.selectedClass;
      const y = i === 1 ? 424 : 452;
      createPortraitPlinth(this, x, y, cls.color, 152);
      this.add.image(x, y - 70, `portrait_${cls.id}`).setScale(2).setDepth(4);
      label(x, 490, i18n.className(cls.id), '18px', selected ? UI.text : '#a3a1b1').setOrigin(0.5);
      label(x, 518, t(`class_${cls.id}_role`), '12px').setOrigin(0.5);
      if (selected) this.add.rectangle(x, 475, 24, 2, cls.color).setDepth(4);
    });
    label(872, 553, `${t('menu_bound')}  /  ${i18n.className(saveSystem.selectedClass)}`, '13px', UI.textGood)
      .setOrigin(0.5);

    createTextButton(this, 276, 402, `${t('menu_enter')}     →`, () => {
      goScene(this, 'ClassSelect');
    }, { width: 408, height: 60, color: 0x24514f, stroke: 0x69b4a6, fontSize: '21px' });
    createTextButton(this, 276, 472, t('menu_talents'), () => {
      goScene(this, 'Talent');
    }, { width: 408, height: 52, color: 0x1c1c2c, stroke: 0x565164, fontSize: '18px' });
    createTextButton(this, 170, 538, t('menu_settings'), () => {
      goScene(this, 'Settings');
    }, { width: 196, height: 44, color: 0x151722, fontSize: '15px', stroke: 0x3c3b4d });
    createTextButton(this, 382, 538, t('menu_reset'), () => {
      this.showResetConfirmation();
      // restart keeps same scene instance — force re-enable input via fadeInScene path
    }, { width: 196, height: 44, color: 0x19151e, fontSize: '15px', stroke: 0x513840 });

    const stats = saveSystem.computePermanentStats();
    label(74, 574, `${t('menu_perm_stats')}  ${t('menu_hp')} +${stats.maxHp}  ·  ${t('menu_dmg')} +${stats.damage}  ·  ${t('menu_armor')} +${stats.armor}`, '12px');
    const records = [
      [t('menu_seed_stage'), saveSystem.seedStage, UI.accent],
      [t('menu_essence'), saveSystem.essence, UI.teal],
      [t('menu_deaths'), saveSystem.totalDeaths, UI.accentHot],
      [t('menu_deepest'), saveSystem.deepestFloor, UI.gold],
    ] as const;
    records.forEach(([name, value, accent], i) => {
      const x = 72 + i * 290;
      this.add.rectangle(x, 626, 3, 24, accent, 0.75).setOrigin(0, 0).setDepth(10);
      label(x + 18, 616, name, '13px');
      const number = label(x + 18, 637, String(value), '24px', '#e0dfdf');
      // 极大旧档数值仍限制在单列，避免遮住邻列。
      if (number.width > 240) number.setScale(240 / number.width);
      if (i > 0) this.add.rectangle(x - 22, 634, 1, 42, 0x393747, 0.65).setDepth(10);
    });

    this.buildLanguageToggle();

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 22,
        `${t('menu_controls_pc')}   ·   ${t('menu_controls_mobile')}`,
        {
          fontSize: '12px',
          color: UI.textDim,
          fontFamily: UI_FONT,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(10);
  }

  private showResetConfirmation(): void {
    if (this.resetDialog) return;
    const root = this.add.container(0, 0).setDepth(2000);
    this.resetDialog = root;
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05040a, 0.8)
      .setInteractive();
    const panel = createPanel(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 540, 240);
    const title = this.add.text(GAME_WIDTH / 2, 288, t('menu_reset'), bodyStyle('22px', UI.text)).setOrigin(0.5);
    const message = this.add.text(GAME_WIDTH / 2, 348, t('menu_reset_confirm'), {
      ...bodyStyle('16px', UI.textWarn), align: 'center', wordWrap: { width: 480 },
    }).setOrigin(0.5);
    const cancel = createTextButton(this, GAME_WIDTH / 2 - 120, 430, t('common_cancel'), () => {
      root.destroy(true);
      this.resetDialog = undefined;
    }, { width: 180, height: 44 });
    const confirm = createTextButton(this, GAME_WIDTH / 2 + 120, 430, t('menu_reset'), () => {
      saveSystem.resetAll();
      this.scene.restart();
    }, { width: 180, height: 44, color: 0x3a1a22, stroke: UI.accentHot });
    root.add([dim, panel, title, message, cancel, confirm]);
  }

  private buildLanguageToggle(): void {
    const label = this.add
      .text(GAME_WIDTH - 72, 34, `${t('menu_language')}:`, {
        fontSize: '12px',
        color: UI.textDim,
        fontFamily: UI_FONT,
      })
      .setOrigin(1, 0)
      .setDepth(40);

    const mk = (lang: Lang, x: number) => {
      const active = i18n.current === lang;
      const btn = this.add
        .text(x, 22, t(lang === 'zh' ? 'lang_zh' : 'lang_en'), {
          fontSize: '14px',
          color: active ? UI.text : UI.textDim,
          fontFamily: UI_FONT,
          backgroundColor: active ? '#25433f' : '#171923',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(1, 0)
        .setDepth(60)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerup', () => {
        if (i18n.current === lang) return;
        saveSystem.setLanguage(lang);
        this.scene.restart();
      });
      return btn;
    };

    const enBtn = mk('en', GAME_WIDTH - 72);
    const zhBtn = mk('zh', GAME_WIDTH - 72 - enBtn.width - 10);
    label.setX(zhBtn.x - zhBtn.width - 10);
  }
}
