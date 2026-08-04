import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { HERO_TEXTURES } from '../data/classes';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
import {
  createPanel,
  createSceneSubtitle,
  createSceneTitle,
  createStatChip,
  drawAbyssBackdrop,
} from '../ui/SceneDecor';
import { UI, UI_FONT, bodyStyle } from '../ui/theme';
import { i18n, t, type Lang } from '../i18n/i18n';
import { fadeInScene, goScene } from '../ui/transitions';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.input.enabled = true;
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.32 });

    createSceneTitle(this, t('game_title'), 36, i18n.current === 'zh' ? '36px' : '32px');
    createSceneSubtitle(this, t('game_title_en_sub'), 74);

    // Hero stage panel
    createPanel(this, GAME_WIDTH / 2, 250, 420, 250, {
      color: UI.panel,
      stroke: UI.stroke,
      alpha: 0.9,
    });

    const seed = this.add.image(GAME_WIDTH / 2, 128, 'icon_seed').setScale(3).setDepth(2);
    this.tweens.add({
      targets: seed,
      y: 134,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    if (this.anims.exists('icon_essence_spin')) {
      this.add
        .sprite(GAME_WIDTH / 2 - 88, 128, 'icon_essence', 0)
        .setScale(3)
        .setDepth(2)
        .play('icon_essence_spin');
      this.add
        .sprite(GAME_WIDTH / 2 + 88, 128, 'icon_essence', 0)
        .setScale(3)
        .setDepth(2)
        .play('icon_essence_spin');
    }

    const clsId = saveSystem.selectedClass;
    const stats = saveSystem.computePermanentStats();
    const heroKey = HERO_TEXTURES[clsId];
    const preview = this.add.sprite(GAME_WIDTH / 2, 230, heroKey, 0).setScale(3).setDepth(3);
    if (this.anims.exists(`${heroKey}_walk`)) preview.play(`${heroKey}_walk`);

    this.add
      .text(GAME_WIDTH / 2, 300, `${t('menu_class')}  ${i18n.className(clsId)}`, {
        ...bodyStyle('14px', UI.text),
      })
      .setOrigin(0.5)
      .setDepth(3);

    this.add
      .text(
        GAME_WIDTH / 2,
        326,
        `${t('menu_perm_stats')}  ${t('menu_hp')}+${stats.maxHp}  ${t('menu_dmg')}+${stats.damage}  ${t('menu_armor')}+${stats.armor}`,
        bodyStyle('12px', UI.textDim),
      )
      .setOrigin(0.5)
      .setDepth(3);

    // Meta chips
    const chipY = 400;
    createStatChip(
      this,
      GAME_WIDTH / 2 - 255,
      chipY,
      t('menu_seed_stage'),
      String(saveSystem.seedStage),
      { width: 150, accent: UI.accent },
    );
    createStatChip(
      this,
      GAME_WIDTH / 2 - 85,
      chipY,
      t('menu_essence'),
      String(saveSystem.essence),
      { width: 150, accent: UI.teal },
    );
    createStatChip(
      this,
      GAME_WIDTH / 2 + 85,
      chipY,
      t('menu_deaths'),
      String(saveSystem.totalDeaths),
      { width: 150, accent: UI.accentHot },
    );
    createStatChip(
      this,
      GAME_WIDTH / 2 + 255,
      chipY,
      t('menu_deepest'),
      String(saveSystem.deepestFloor),
      { width: 150, accent: UI.gold },
    );

    createTextButton(this, GAME_WIDTH / 2, 468, t('menu_enter'), () => {
      goScene(this, 'ClassSelect');
    }, { width: 280, height: 48, color: 0x3d1f4a, stroke: UI.accent });

    createTextButton(this, GAME_WIDTH / 2, 532, t('menu_talents'), () => {
      goScene(this, 'Talent');
    }, { width: 280, height: 48, color: 0x1f2d3d, stroke: UI.teal });

    createTextButton(this, GAME_WIDTH / 2 - 90, 592, t('menu_settings'), () => {
      goScene(this, 'Settings');
    }, { width: 160, height: 36, color: 0x1a1528, fontSize: '13px', stroke: UI.strokeBright });

    // Two-step reset: first tap arms it, second tap within 3s wipes the save.
    // A single stray tap used to erase everything with no confirmation.
    let resetArmed = false;
    let resetTimer: Phaser.Time.TimerEvent | undefined;
    let resetLabel: Phaser.GameObjects.Text | undefined;
    const resetBtn = createTextButton(this, GAME_WIDTH / 2 + 90, 592, t('menu_reset'), () => {
      if (!resetArmed) {
        resetArmed = true;
        resetLabel?.setText(t('menu_reset_confirm'));
        resetTimer?.remove(false);
        resetTimer = this.time.delayedCall(3000, () => {
          resetArmed = false;
          resetLabel?.setText(t('menu_reset'));
        });
        return;
      }
      resetTimer?.remove(false);
      saveSystem.resetAll();
      // restart keeps same scene instance — force re-enable input via fadeInScene path
      this.scene.restart();
    }, { width: 160, height: 36, color: 0x2a1a1a, fontSize: '13px', stroke: 0x5a3038 });
    resetLabel = resetBtn.getAll('type', 'Text')[0] as Phaser.GameObjects.Text | undefined;

    this.buildLanguageToggle();

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 26,
        `${t('menu_controls_pc')}   ·   ${t('menu_controls_mobile')}`,
        {
          fontSize: '11px',
          color: UI.textMute,
          fontFamily: UI_FONT,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(10);
  }

  private buildLanguageToggle(): void {
    const label = this.add
      .text(GAME_WIDTH - 24, 14, `${t('menu_language')}:`, {
        fontSize: '12px',
        color: UI.textDim,
        fontFamily: UI_FONT,
      })
      .setOrigin(1, 0)
      .setDepth(40);

    const mk = (lang: Lang, x: number) => {
      const active = i18n.current === lang;
      const btn = this.add
        .text(x, 14, t(lang === 'zh' ? 'lang_zh' : 'lang_en'), {
          fontSize: '14px',
          color: active ? UI.text : UI.textDim,
          fontFamily: UI_FONT,
          backgroundColor: active ? '#3d1f4a' : '#1a1428',
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

    const enBtn = mk('en', GAME_WIDTH - 24);
    const zhBtn = mk('zh', GAME_WIDTH - 24 - enBtn.width - 10);
    label.setX(zhBtn.x - zhBtn.width - 10);
  }
}
