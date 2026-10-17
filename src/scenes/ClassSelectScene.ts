import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { CLASS_LIST, type ClassId } from '../data/classes';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
import {
  createPanel,
  createPortraitPlinth,
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
    status: Phaser.GameObjects.Text;
  }[] = [];

  constructor() {
    super('ClassSelect');
  }

  create(): void {
    this.cards = [];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cards = [];
    });
    this.selected = saveSystem.selectedClass;
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.1, vignette: false });

    createSceneTitle(this, t('class_title'), 38, '30px');
    this.add.text(GAME_WIDTH / 2, 76, t('class_gallery_hint'), bodyStyle('14px'))
      .setOrigin(0.5).setDepth(4);
    CLASS_LIST.forEach((cls, i) => {
      const x = GAME_WIDTH / 2 + (i - 1) * 356;
      const y = 310;

      const glow = this.add
        .rectangle(x, y, 340, 422, cls.color, 0.08)
        .setStrokeStyle(0, cls.color, 0)
        .setDepth(1);

      const bg = this.add
        .rectangle(x, y, 324, 406, UI.panel, 0.95)
        .setStrokeStyle(2, cls.color, 0.55)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);

      // 装饰与肖像不设交互，整张卡片仍由同一个背景处理选择。
      const ink = `#${cls.color.toString(16).padStart(6, '0')}`;
      this.add.rectangle(x, 108, 324, 2, cls.color, 0.8).setDepth(3);
      this.add.text(x - 140, 129, `0${i + 1}  /  ${cls.id.toUpperCase()}`, bodyStyle('12px', ink)).setDepth(4);
      const status = this.add.text(x + 140, 129, '', bodyStyle('12px', ink)).setOrigin(1, 0).setDepth(4);
      this.add.text(x, 170, t(`class_${cls.id}_role`), bodyStyle('15px', UI.textDim))
        .setOrigin(0.5).setDepth(4);
      const rune = this.add.graphics().setDepth(3);
      rune.lineStyle(1, cls.color, 0.13).strokeCircle(x, 299, 96);
      rune.lineStyle(1, cls.color, 0.08).strokeCircle(x, 299, 84);
      rune.lineBetween(x, 191, x, 407);
      rune.lineBetween(x - 106, 299, x + 106, 299);
      createPortraitPlinth(this, x, 422, cls.color, 212);
      this.add.image(x, 317, `portrait_${cls.id}`).setScale(3).setDepth(4);
      this.add.text(x, 462, i18n.className(cls.id), {
        fontSize: '26px', color: '#e6e1d8', fontFamily: UI_FONT,
      }).setOrigin(0.5).setDepth(4);
      this.add.text(x, 494,
        `${t('class_hp')} ${cls.baseHp}   ·   ${t('class_dmg')} ${cls.baseDamage}   ·   ${t('class_spd')} ${cls.baseSpeed}`,
        bodyStyle('13px', UI.textDim),
      ).setOrigin(0.5).setDepth(4);

      bg.on('pointerover', () => {
        if (this.selected !== cls.id) bg.setFillStyle(UI.panelAlt, 0.98);
      });
      bg.on('pointerout', () => {
        if (this.selected !== cls.id) bg.setFillStyle(UI.panel, 0.95);
      });
      // pointerup covers mouse and touch; no touch-only pointerdown path
      // (selection is idempotent, but keep one single fire path like Talent).
      bg.on('pointerup', () => {
        this.selected = cls.id;
        this.refreshSelection();
      });

      this.cards.push({ id: cls.id, bg, glow, status });
    });

    createPanel(this, GAME_WIDTH / 2, 569, 1036, 82, {
      color: UI.panelAlt,
      stroke: UI.stroke,
      alpha: 0.92,
      depth: 2,
    });

    this.detail = this.add
      .text(GAME_WIDTH / 2, 569, '', {
        fontSize: '15px',
        color: '#cfc4e8',
        fontFamily: UI_FONT,
        align: 'center',
        wordWrap: { width: 980 },
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setDepth(5);

    createTextButton(this, GAME_WIDTH / 2 - 160, GAME_HEIGHT - 62, t('class_back'), () => {
      goScene(this, 'Menu');
    }, { width: 196, height: 48 });

    createTextButton(this, GAME_WIDTH / 2 + 116, GAME_HEIGHT - 62, t('class_begin'), () => {
      saveSystem.setSelectedClass(this.selected);
      goScene(this, 'Run');
    }, { width: 300, height: 48, color: 0x24514f, stroke: 0x69b4a6, fontSize: '18px' });

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
      card.status.setText(active ? `◆ ${t('class_selected')}` : '');
    }
  }
}

