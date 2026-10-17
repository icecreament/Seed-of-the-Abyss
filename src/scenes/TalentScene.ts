import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { TALENT_TREES, type TalentTreeId } from '../data/talents';
import { saveSystem } from '../systems/SaveSystem';
import { createTextButton } from '../ui/TextButton';
import {
  createPanel,
  createSceneSubtitle,
  createSceneTitle,
  drawAbyssBackdrop,
} from '../ui/SceneDecor';
import { UI, UI_FONT, bodyStyle } from '../ui/theme';
import { i18n, t } from '../i18n/i18n';
import { fadeInScene, goScene } from '../ui/transitions';

export class TalentScene extends Phaser.Scene {
  private essenceText!: Phaser.GameObjects.Text;
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private panels: { id: string; panel: Phaser.GameObjects.Rectangle; color: number }[] = [];

  constructor() {
    super('Talent');
  }

  create(): void {
    this.cardTexts = [];
    this.panels = [];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cardTexts = [];
      this.panels = [];
    });
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.2 });
    createSceneTitle(this, t('talent_title'), 28, '26px');

    this.essenceText = this.add
      .text(GAME_WIDTH / 2, 60, '', bodyStyle('14px', '#c9b6ff'))
      .setOrigin(0.5)
      .setDepth(10);

    createSceneSubtitle(this, t('talent_hint'), 84);

    const trees = Object.keys(TALENT_TREES) as TalentTreeId[];
    const colW = 300;
    const startX = GAME_WIDTH / 2 - colW;

    trees.forEach((treeId, col) => {
      const tree = TALENT_TREES[treeId];
      const x = startX + col * colW;

      createPanel(this, x, 360, 270, 430, {
        color: 0x100e18,
        stroke: tree.color,
        alpha: 0.75,
        depth: 1,
      });

      this.add
        .text(x, 120, i18n.treeName(treeId), {
          fontSize: '16px',
          color: '#ffffff',
          fontFamily: UI_FONT,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setTint(tree.color)
        .setDepth(5);

      // vertical connector
      const line = this.add.graphics().setDepth(2);
      line.lineStyle(2, tree.color, 0.35);
      line.lineBetween(x, 150, x, 520);

      tree.nodes.forEach((node, row) => {
        const y = 180 + row * 120;
        const panel = this.add
          .rectangle(x, y, 240, 92, UI.panel, 0.96)
          .setStrokeStyle(1, tree.color, 0.55)
          .setInteractive({ useHandCursor: true })
          .setDepth(4);

        // rank pip rail
        this.add
          .rectangle(x, y + 38, 200, 4, 0x2a2340, 1)
          .setDepth(5);

        const title = this.add
          .text(x - 104, y - 28, '', {
            fontSize: '13px',
            color: '#f0eaff',
            fontFamily: UI_FONT,
          })
          .setData('nodeId', node.id)
          .setData('kind', 'title')
          .setDepth(6);

        const desc = this.add
          .text(x - 104, y - 6, t(`talent_${node.i18nKey}_desc`), {
            fontSize: '11px',
            color: '#a89bc4',
            fontFamily: UI_FONT,
            wordWrap: { width: 210 },
          })
          .setData('nodeId', node.id)
          .setData('kind', 'desc')
          .setDepth(6);

        const meta = this.add
          .text(x - 104, y + 24, '', {
            fontSize: '11px',
            color: '#d0c4f0',
            fontFamily: UI_FONT,
          })
          .setData('nodeId', node.id)
          .setData('kind', 'meta')
          .setDepth(6);

        this.cardTexts.push(title, meta);
        this.panels.push({ id: node.id, panel, color: tree.color });

        panel.on('pointerover', () => {
          panel.setFillStyle(UI.panelAlt, 1);
        });
        panel.on('pointerout', () => {
          this.paintPanel(node.id);
        });
        // pointerup fires for both mouse and touch. There used to be a second
        // touch-only pointerdown handler, which made every tap unlock TWICE
        // (down + up) and drained double essence.
        panel.on('pointerup', () => {
          if (saveSystem.unlockTalent(node.id)) {
            this.refresh();
          } else {
            // subtle reject flash
            panel.setStrokeStyle(2, UI.accentHot, 0.9);
            this.time.delayedCall(180, () => this.paintPanel(node.id));
          }
        });
      });
    });

    createTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 40, t('talent_back'), () => {
      goScene(this, 'Menu');
    }, { width: 150, height: 38 });

    this.refresh();
  }

  private paintPanel(id: string): void {
    const entry = this.panels.find((p) => p.id === id);
    if (!entry) return;
    const rank = saveSystem.getTalentRank(id);
    const node = Object.values(TALENT_TREES)
      .flatMap((tr) => tr.nodes)
      .find((n) => n.id === id)!;
    const maxed = rank >= node.maxRank;
    const ready = saveSystem.canUnlockTalent(id);
    entry.panel.setFillStyle(maxed ? 0x1a2430 : ready ? UI.panelActive : UI.panel, 0.96);
    entry.panel.setStrokeStyle(maxed ? 2 : ready ? 2 : 1, entry.color, maxed ? 0.9 : ready ? 0.85 : 0.45);
  }

  private refresh(): void {
    this.essenceText.setText(
      `${t('talent_essence')}: ${saveSystem.essence}`,
    );

    for (const text of this.cardTexts) {
      const id = text.getData('nodeId') as string;
      const kind = text.getData('kind') as string;
      const node = Object.values(TALENT_TREES)
        .flatMap((tr) => tr.nodes)
        .find((n) => n.id === id)!;
      const rank = saveSystem.getTalentRank(id);
      if (kind === 'title') {
        text.setText(`${t(`talent_${node.i18nKey}`)}  [${rank}/${node.maxRank}]`);
      } else if (kind === 'meta') {
        const locked =
          node.requires && saveSystem.getTalentRank(node.requires) < 1
            ? t('talent_requires')
            : rank >= node.maxRank
              ? t('talent_maxed')
              : `${t('talent_cost')} ${node.costPerRank} · ${
                  saveSystem.canUnlockTalent(id) ? t('talent_ready') : t('talent_need')
                }`;
        text.setText(locked);
      }
      this.paintPanel(id);
    }
  }
}

