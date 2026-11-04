import { W, H } from './core/config.js';
import { installHiDPI, hidpiSize } from './core/hidpi.js';
import { run } from './core/run.js';
import { save } from './core/save.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { MapScene } from './scenes/MapScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { RewardScene } from './scenes/RewardScene.js';
import { EventScene } from './scenes/EventScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { RestScene } from './scenes/RestScene.js';
import { StoryScene } from './scenes/StoryScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { CodexScene } from './scenes/CodexScene.js';

const sceneClasses = [
  BootScene, PreloadScene, TitleScene, MapScene, BattleScene,
  RewardScene, EventScene, ShopScene, RestScene, StoryScene,
  EndingScene, ResultScene, SettingsScene, CodexScene
];

// 在创建游戏前安装 HiDPI 渲染层（提升画布背板 + 文字分辨率）
installHiDPI(sceneClasses);
const { width: gameW, height: gameH } = hidpiSize();

const config = {
  type: Phaser.AUTO,
  width: gameW,
  height: gameH,
  parent: 'game',
  backgroundColor: '#efe6d4',
  // 平滑计时在失焦/低帧率时会把真实的数百毫秒压成 16.7ms，拖慢回合和转场。
  // 使用实际帧间隔；隐藏页面的暂停与恢复仍由 Phaser 的可见性机制处理。
  fps: { smoothStep: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance'
  },
  scene: sceneClasses
};

const game = new Phaser.Game(config);
window.__game = game;
window.__run = run;
window.__save = save;

// 首帧后揭开序幕遮罩
game.events.once('ready', () => {
  const veil = document.getElementById('veil');
  if (veil) {
    veil.classList.add('hidden');
    setTimeout(() => { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 900);
  }
});
setTimeout(() => {
  const veil = document.getElementById('veil');
  if (veil && veil.parentNode) veil.classList.add('hidden');
}, 2500);
