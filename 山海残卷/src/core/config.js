/* 全局配置：尺寸、色板、字体、层级 */

export const W = 1600;
export const H = 900;

export const PAL = {
  paper: '#efe6d4',
  paperLight: '#f8f1e2',
  paperDeep: '#ddcdb1',
  ink: '#1d1a17',
  ink2: '#3a342c',
  ink3: '#5e5549',
  ink4: '#8b7f6c',
  inkFaint: 'rgba(29,26,23,0.14)',
  line: 'rgba(29,26,23,0.22)',
  cinnabar: '#b23a2e',
  cinnabarDeep: '#8b2a20',
  cinnabarLight: '#cf6152',
  azure: '#2f6b8a',
  jade: '#41694a',
  gold: '#b98f3f',
  goldLight: '#e2c489',
  white: '#fdfaf3',
  shadow: 'rgba(40,28,14,0.28)'
};

export const FONT = {
  song: '"STZhongsong", "SimSun", "Songti SC", "Noto Serif SC", serif',
  hei: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif',
  // 楷体：本机可用的最接近书法的字体（无行楷时退到楷体/宋体）
  brush: '"KaiTi", "STKaiti", "Kaiti SC", "STZhongsong", "SimSun", serif',
  mono: '"Cascadia Mono", "Consolas", ui-monospace, monospace'
};

export const CARD = {
  w: 218,
  h: 306,
  texW: 306,
  texH: 429,
  radius: 7
};

export const DEPTH = {
  bg: 0,
  scene: 10,
  entities: 20,
  cards: 40,
  dragCard: 60,
  hud: 80,
  overlay: 100,
  tooltip: 120
};

export const ASCENSION_MAX = 5;
