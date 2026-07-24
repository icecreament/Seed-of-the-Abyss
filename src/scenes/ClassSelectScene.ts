import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { CLASS_LIST, type ClassId } from '../data/classes';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
import {
  createPanel,
  createSceneTitle,
  drawAbyssBackdrop,
} from '../ui/SceneDecor';
import { UI, UI_FONT, bodyStyle } from '../ui/theme';
import { i18n, t } from '../i18n/i18n';
import { fadeInScene, goScene } from '../ui/transitions';

export class ClassSelectScene extends Phaser.Scene {
  private selected: ClassId = saveSystem.selectedClass;
  private detail!: Phaser.GameObjects.Text;
  private cards: {
    id: ClassId;
    bg: Phaser.GameObjects.Rectangle;
    glow: Phaser.GameObjects.Rectangle;
  }[] = [];

  constructor() {
    super('ClassSelect');
  }

  create(): void {
    this.selected = saveSystem.selectedClass;
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.22 });

    createSceneTitle(this, t('class_title'), 30, '26px');
        CLASS_LIST.forEach((cls, i) => {
      const x = GAME_WIDTH / 2 + (i - 1) * 300;
      const y = 230;

      const glow = this.add
        .rectangle(x, y, 268, 250, cls.color, 0.08)
        .setStrokeStyle(0, cls.color, 0)
        .setDepth(1);

      const bg = this.add
        .rectangle(x, y, 250, 230, UI.panel, 0.95)
        .setStrokeStyle(2, cls.color, 0.55)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);

      // Header strip
      this.add
        .rectangle(x, y - 95, 246, 28, cls.color, 0.18)
        .setDepth(3);

      const heroKey =
        cls.id === 'warden' ? 'hero_warden' : cls.id === 'reaver' ? 'hero_reaver' : 'hero_shade';
      const spr = this.add.sprite(x, y - 40, heroKey, 0).setScale(3).setDepth(4);
      if (this.anims.exists(`${heroKey}_idle`)) spr.play(`${heroKey}_idle`);

      this.add
        .text(x, y + 24, i18n.className(cls.id), {
          fontSize: '18px',
          color: UI.text,
          fontFamily: UI_FONT,
        })
        .setOrigin(0.5)
        .setDepth(4);

      this.add
        .text(
          x,
          y + 62,
          `${t('class_hp')} ${cls.baseHp}   ${t('class_dmg')} ${cls.baseDamage}\n${t('class_spd')} ${cls.baseSpeed}`,
          {
            ...bodyStyle('12px', UI.textDim),
            align: 'center',
          },
        )
        .setOrigin(0.5)
        .setDepth(4);

      bg.on('pointerover', () => {
        if (this.selected !== cls.id) bg.setFillStyle(UI.panelAlt, 0.98);
      });
      bg.on('pointerout', () => {
        if (this.selected !== cls.id) bg.setFillStyle(UI.panel, 0.95);
      });
      bg.on('pointerup', () => {
        this.selected = cls.id;
        this.refreshSelection();
      });

      this.cards.push({ id: cls.id, bg, glow });
    });

    createPanel(this, GAME_WIDTH / 2, 430, 760, 86, {
      color: UI.panelAlt,
      stroke: UI.stroke,
      alpha: 0.92,
      depth: 2,
    });

    this.detail = this.add
      .text(GAME_WIDTH / 2, 430, '', {
        fontSize: '14px',
        color: '#cfc4e8',
        fontFamily: UI_FONT,
        align: 'center',
        wordWrap: { width: 700 },
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setDepth(5);

    createTextButton(this, GAME_WIDTH / 2 - 130, GAME_HEIGHT - 48, t('class_back'), () => {
      goScene(this, 'Menu');
    }, { width: 150, height: 40 });

    createTextButton(this, GAME_WIDTH / 2 + 130, GAME_HEIGHT - 48, t('class_begin'), () => {
      saveSystem.setSelectedClass(this.selected);
      goScene(this, 'Run');
    }, { width: 190, height: 40, color: 0x3d1f4a, stroke: UI.accent });

    this.refreshSelection();
  }

  private refreshSelection(): void {
    const def = CLASS_LIST.find((c) => c.id === this.selected)!;
    this.detail.setText(
      `${i18n.className(def.id)} — ${i18n.classDesc(def.id)}\n${t('class_skill')}: ${i18n.classSkill(def.id)}`,
    );
    for (const card of this.cards) {
      const active = card.id === this.selected;
      const color = CLASS_LIST.find((c) => c.id === card.id)!.color;
      card.bg.setStrokeStyle(active ? 3 : 1, color, active ? 1 : 0.45);
      card.bg.setFillStyle(active ? UI.panelActive : UI.panel, 0.95);
      card.glow.setAlpha(active ? 0.22 : 0.06);
      card.glow.setStrokeStyle(active ? 2 : 0, color, active ? 0.5 : 0);
    }
  }
}
