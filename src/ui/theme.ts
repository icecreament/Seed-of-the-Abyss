/**
 * Shared UI theme for abyss-facing scenes.
 */
export const UI_FONT = 'Segoe UI, Microsoft YaHei, sans-serif';

export const UI = {
  bg: 0x0b0914,
  root: 0x555744,
  rootLight: 0x92916e,
  bone: 0xe8e0c9,
  panel: 0x14101f,
  panelAlt: 0x1a1528,
  panelActive: 0x241a38,
  stroke: 0x5a4f78,
  strokeBright: 0x8b7ec8,
  accent: 0xa78bfa,
  accentHot: 0xe24b5a,
  teal: 0x3ecfbf,
  gold: 0xf0c14a,
  text: '#e8e0ff',
  textDim: '#9a90b0',
  textMute: '#6a6280',
  textWarn: '#e8a0c0',
  textGood: '#7ed9c4',
} as const;

export type TextStyleLite = Phaser.Types.GameObjects.Text.TextStyle;

export function titleStyle(size = '28px', color: string = UI.text): TextStyleLite {
  return {
    fontSize: size,
    color,
    fontFamily: UI_FONT,
    fontStyle: 'bold',
  };
}

export function bodyStyle(size = '14px', color: string = UI.textDim): TextStyleLite {
  return {
    fontSize: size,
    color,
    fontFamily: UI_FONT,
  };
}
