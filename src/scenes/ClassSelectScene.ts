import Phaser from 'phaser';
import { PORTRAIT_CARD_SCALE } from '../assets/HeroPortraits';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { CLASS_LIST, HERO_TEXTURES, type ClassId } from '../data/classes';
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

/** Sparse, class-specific heraldry. Display-only; never participates in input. */
function portraitSigil(scene: Phaser.Scene, x: number, y: number, id: ClassId, color: number): Phaser.GameObjects.Graphics {
  const g=scene.add.graphics({x,y}).setDepth(3);
  g.lineStyle(1,color,0.65);
  const path=(points: [number,number][])=>{g.beginPath();g.moveTo(...points[0]);for(const point of points.slice(1))g.lineTo(...point);g.strokePath();};
  if(id==='warden'){
    path([[-72,-43],[0,-84],[72,-43],[65,28]]);path([[65,40],[0,90],[-65,40],[-72,-31]]);
    path([[-57,-36],[0,-68],[57,-36]]);path([[-53,44],[0,73],[53,44]]);
    for(const side of [-1,1]){g.lineBetween(side*84,-5,side*84,24);g.lineBetween(side*89,7,side*79,7);}
  }else if(id==='reaver'){
    path([[-75,44],[-28,-63],[14,-86]]);path([[-48,66],[0,-42],[42,-72]]);
    path([[10,86],[42,30],[76,8]]);path([[-77,-15],[-48,-68],[-17,-80]]);
    g.lineBetween(-62,50,-51,29);g.lineBetween(43,-54,59,-66);
  }else if(id==='shade'){
    path([[-79,-10],[0,-88],[63,-25]]);path([[79,10],[0,88],[-63,25]]);
    path([[-59,-12],[0,-70],[43,-28]]);path([[59,12],[0,70],[-43,28]]);
    g.lineBetween(-88,-2,-80,-10);g.lineBetween(88,2,80,10);
  }else{
    path([[-24,80],[-31,47],[-60,16],[-68,-26],[-83,-54]]);
    path([[24,80],[31,47],[60,16],[68,-26],[83,-54]]);
    for(const side of [-1,1]){
      path([[side*60,16],[side*80,4],[side*88,-14]]);
      path([[side*68,-26],[side*49,-47],[side*47,-70]]);
      path([[side*31,47],[side*58,51],[side*76,40]]);
      g.strokeCircle(side*47,-76,3);
    }
  }
  return g;
}

export class ClassSelectScene extends Phaser.Scene {
  private selected: ClassId = saveSystem.selectedClass;
  private detail!: Phaser.GameObjects.Text;
  private cards: {
    id: ClassId;
    bg: Phaser.GameObjects.Rectangle;
    glow: Phaser.GameObjects.Rectangle;
    status: Phaser.GameObjects.Text;
    portrait?: Phaser.GameObjects.Image;
    rune: Phaser.GameObjects.Graphics;
    active?: boolean;
  }[] = [];

  constructor() {
    super('ClassSelect');
  }

  create(): void {
    this.cards = [];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const card of this.cards) {
        if (card.portrait) this.tweens.killTweensOf(card.portrait);
        this.tweens.killTweensOf(card.rune);
      }
      this.cards = [];
    });
    this.selected = saveSystem.selectedClass;
    fadeInScene(this);
    drawAbyssBackdrop(this, { tileAlpha: 0.1, vignette: false });

    createSceneTitle(this, t('class_title'), 38, '30px');
    this.add.text(GAME_WIDTH / 2, 76, t('class_gallery_hint'), bodyStyle('14px'))
      .setOrigin(0.5).setDepth(4);
    CLASS_LIST.forEach((cls, i) => {
      // 4 张卡等距排开：以中线对称，卡宽 272 / 间距 292，避免与详情面板重叠。
      const x = GAME_WIDTH / 2 + (i - (CLASS_LIST.length - 1) / 2) * 292;
      const y = 310;
      const cardW = 272;

      const glow = this.add
        .rectangle(x, y, cardW + 16, 422, cls.color, 0.08)
        .setStrokeStyle(0, cls.color, 0)
        .setDepth(1);

      const bg = this.add
        .rectangle(x, y, cardW, 406, UI.panel, 0.95)
        .setStrokeStyle(2, cls.color, 0.55)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);

      // 装饰与肖像不设交互，整张卡片仍由同一个背景处理选择。
      const ink = `#${cls.color.toString(16).padStart(6, '0')}`;
      const edge = cardW / 2 - 12;
      this.add.rectangle(x, 108, cardW, 2, cls.color, 0.8).setDepth(3);
      this.add.text(x - edge, 129, `0${i + 1}  /  ${cls.id.toUpperCase()}`, bodyStyle('12px', ink)).setDepth(4);
      const status = this.add.text(x + edge, 129, '', bodyStyle('12px', ink)).setOrigin(1, 0).setDepth(4);
      this.add.text(x, 170, t(`class_${cls.id}_role`), bodyStyle('15px', UI.textDim))
        .setOrigin(0.5).setDepth(4);
      const rune = portraitSigil(this, x, 299, cls.id, cls.color);
      createPortraitPlinth(this, x, 422, cls.color, 212);
      const portraitKey = `portrait_${cls.id}`;
      let portrait: Phaser.GameObjects.Image | undefined;
      if (this.textures.exists(portraitKey)) {
        // Origin at the painted sole: a brief scale-up never makes the feet float.
        portrait = this.add.image(x, 422, portraitKey).setOrigin(0.5, 150 / 160)
          .setScale(PORTRAIT_CARD_SCALE).setDepth(4);
      } else {
        // Defensive fallback: keep feet aligned to the plinth.
        const heroKey = HERO_TEXTURES[cls.id];
        const stand = this.add
          .sprite(x, 437, heroKey, 0)
          .setOrigin(0.5, 1)
          .setScale(6)
          .setDepth(4);
        if (this.anims.exists(`${heroKey}_idle`)) stand.play(`${heroKey}_idle`);
      }
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
        if (this.selected === cls.id) return;
        this.selected = cls.id;
        this.refreshSelection(true);
      });

      this.cards.push({ id: cls.id, bg, glow, status, portrait, rune });
    });

    createPanel(this, GAME_WIDTH / 2, 569, 1152, 82, {
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
        wordWrap: { width: 1090 },
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

  private refreshSelection(animate = false): void {
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
      // One short, interruptible reveal per actual selection. No idle bob or flash.
      const changed = card.active !== active;
      card.active = active;
      if (!changed) continue;
      this.tweens.killTweensOf(card.rune);
      if (card.portrait) this.tweens.killTweensOf(card.portrait);
      const scale = PORTRAIT_CARD_SCALE;
      card.portrait?.setScale(scale);
      const alpha = active ? 0.74 : 0.24;
      const reduced = !saveSystem.feedback.impactMotion ||
        (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (!animate || reduced) {
        card.portrait?.setScale(scale);
        card.rune.setAlpha(alpha);
        continue;
      }
      const duration = {warden:320, reaver:240, shade:260, thorn:380}[card.id];
      if (card.portrait && active) this.tweens.add({
        targets: card.portrait, scaleX: scale * 1.04, scaleY: scale * 1.04,
        duration: duration / 2, yoyo: true, ease: 'Sine.easeInOut',
      });
      this.tweens.add({targets:card.rune, alpha, duration, ease:'Sine.easeOut'});
    }
  }
}

