import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { saveSystem } from '../systems/SaveSystem';
import { runState } from '../systems/RunState';
import { fadeInScene, goScene } from '../ui/transitions';
import { createTextButton } from '../ui/TextButton';
import {
  createPanel,
  createSceneSubtitle,
  createSceneTitle,
  createStatChip,
  drawAbyssBackdrop,
} from '../ui/SceneDecor';
import { UI, UI_FONT, bodyStyle } from '../ui/theme';
import { t } from '../i18n/i18n';

export class DeathScene extends Phaser.Scene {
  constructor() {
    super('Death');
  }

  create(): void {
    const run = runState.lastRun;
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.18 });

    createSceneTitle(this, t('death_title'), 42, '30px');
    createSceneSubtitle(this, t('death_subtitle'), 78);

    // Ritual frame
    createPanel(this, GAME_WIDTH / 2, 320, 560, 360, {
      color: 0x120c18,
      stroke: 0x6a3a55,
      alpha: 0.92,
      depth: 2,
    });

    if (this.textures.exists('icon_seed')) {
      const seed = this.add.image(GAME_WIDTH / 2, 145, 'icon_seed').setScale(3.5).setDepth(4);
      this.tweens.add({
        targets: seed,
        scale: 3.7,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    if (this.anims.exists('icon_essence_spin')) {
      this.add
        .sprite(GAME_WIDTH / 2 - 100, 145, 'icon_essence', 0)
        .setScale(3)
        .setDepth(4)
        .play('icon_essence_spin');
      this.add
        .sprite(GAME_WIDTH / 2 + 100, 145, 'icon_essence', 0)
        .setScale(3)
        .setDepth(4)
        .play('icon_essence_spin');
    }

    if (!run) {
      this.add
        .text(GAME_WIDTH / 2, 280, t('death_no_data'), bodyStyle('16px', UI.textDim))
        .setOrigin(0.5)
        .setDepth(5);
    } else {
      let result = { gained: 0, newStage: false, essenceBefore: saveSystem.essence };
      if (!runState.deathSettled) {
        result = saveSystem.settleDeath(run);
        runState.deathSettled = true;
      } else {
        // Already settled this run (e.g. scene restart) — show zeros for gained
        result = { gained: 0, newStage: false, essenceBefore: saveSystem.essence };
      }

      createStatChip(this, GAME_WIDTH / 2 - 180, 220, t('death_floor'), String(run.floor), {
        width: 140,
        accent: UI.accent,
      });
      createStatChip(this, GAME_WIDTH / 2 - 20, 220, t('death_kills'), String(run.kills), {
        width: 140,
        accent: UI.accentHot,
      });
      createStatChip(
        this,
        GAME_WIDTH / 2 + 140,
        220,
        t('death_time'),
        `${Math.floor(run.timeAliveSec)}${t('death_seconds')}`,
        { width: 140, accent: UI.teal },
      );

      const rewardLines = [
        `${t('death_damage')}: ${Math.floor(run.damageDealt)}`,
        '',
        `+${result.gained}  ${t('death_gained')}`,
        `${t('death_essence_total')}: ${saveSystem.essence}`,
        `${t('death_seed_stage')}: ${saveSystem.seedStage}${
          result.newStage ? `   ▲ ${t('death_evolved')}` : ''
        }`,
        `${t('death_lifetime')}: ${saveSystem.totalDeaths}`,
      ];

      this.add
        .text(GAME_WIDTH / 2, 340, rewardLines.join('\n'), {
          fontSize: '15px',
          color: result.newStage ? UI.textGood : '#d8cee8',
          fontFamily: UI_FONT,
          align: 'center',
          lineSpacing: 7,
        })
        .setOrigin(0.5)
        .setDepth(5);

      if (result.newStage) {
        this.add
          .text(GAME_WIDTH / 2, 430, t('death_evolved'), {
            fontSize: '18px',
            color: '#f0c14a',
            fontFamily: UI_FONT,
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(5);
        this.cameras.main.flash(280, 80, 40, 100);
      }
    }

    createTextButton(this, GAME_WIDTH / 2 - 140, GAME_HEIGHT - 58, t('death_talents'), () => {
      goScene(this, 'Talent');
    }, { width: 180, height: 42, color: 0x1f2d3d, stroke: UI.teal, depth: 50 });

    createTextButton(this, GAME_WIDTH / 2 + 140, GAME_HEIGHT - 58, t('death_menu'), () => {
      goScene(this, 'Menu');
    }, { width: 180, height: 42, color: 0x3d1f4a, stroke: UI.accent, depth: 50 });
  }
}
