/* 音频：程序化音效（Karplus-Strong 拨弦 / 噪声 / 鼓）+ BGM 播放控制 */

import { save } from './save.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.ready = false;
    this.cache = new Map();
    this.lastAt = {};
    this.bgm = null;
    this.bgmKey = null;
    this.scene = null;
  }

  // Boot 场景会立刻退出，解锁监听必须属于整个页面而不是启动场景。
  installUnlock(target = globalThis.window) {
    if (!target?.addEventListener || this.unlockTarget === target) return;
    this.removeUnlock();
    this.unlockTarget = target;
    this.unlockHandler = () => {
      const wasReady = this.ready;
      if (this.ensure() && !wasReady) this.setVolumes();
    };
    target.addEventListener('pointerdown', this.unlockHandler, true);
    target.addEventListener('keydown', this.unlockHandler, true);
  }

  removeUnlock() {
    if (!this.unlockTarget) return;
    this.unlockTarget.removeEventListener('pointerdown', this.unlockHandler, true);
    this.unlockTarget.removeEventListener('keydown', this.unlockHandler, true);
    this.unlockTarget = this.unlockHandler = null;
  }

  ensure() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume()?.catch?.(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = save.data.settings.music > 0 ? 0.9 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = save.data.settings.sfx;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = save.data.settings.music;

      this.sfxBus.connect(comp);
      this.musicBus.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);

      const len = Math.floor(ctx.sampleRate * 2);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.ready = true;
      if (ctx.state === 'suspended') ctx.resume()?.catch?.(() => {});
      if (this.procMode && !this.procTimer && !this.bgm) this.startProcedural(this.procMode);
      return true;
    } catch (e) {
      return false;
    }
  }

  setScene(scene) { this.scene = scene; }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ---------- 拨弦 ---------- */
  pluckBuffer(freq, bright) {
    const key = `p${Math.round(freq)}_${bright ? 1 : 0}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 1.4);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const delay = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(delay);
    for (let i = 0; i < delay; i++) ring[i] = (Math.random() * 2 - 1) * 0.55;
    const decay = bright ? 0.9962 : 0.9948;
    let pick = 0;
    for (let s = 0; s < n; s++) {
      const cur = ring[pick];
      const nxt = ring[(pick + 1) % delay];
      out[s] = cur;
      ring[pick] = (cur + nxt) * 0.5 * decay;
      pick = (pick + 1) % delay;
    }
    for (let k = 0; k < 300; k++) out[k] *= k / 300;
    const tail = Math.floor(n * 0.3);
    for (let j = 0; j < tail; j++) out[n - 1 - j] *= j / tail;
    this.cache.set(key, buf);
    return buf;
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  pluck(freq, vol = 0.3, bright = true, when = 0, bus = null) {
    if (!this.ready) return;
    try {
      const t = (when || this.now());
      const src = this.ctx.createBufferSource();
      src.buffer = this.pluckBuffer(freq, bright);
      const g = this.ctx.createGain();
      g.gain.value = vol;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = bright ? 5200 : 3000;
      src.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
      src.start(t);
    } catch (e) { /* ignore */ }
  }

  noiseBurst(dur, vol, type, f0, f1, q, rate) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    if (rate) src.playbackRate.value = rate; // 变调：同一招式连续命中时不至于单调
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0 || 1000, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  drum(low, vol, dur, when = 0, bus = null) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(low || 140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + (dur || 0.3));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol || 0.3, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.3));
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + (dur || 0.3) + 0.02);
  }

  bell(freq, vol, dur) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [[1, 1], [2.01, 0.5], [2.98, 0.26], [4.2, 0.12]].forEach(([m, a]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * a, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - m * 0.1));
      o.connect(g); g.connect(this.sfxBus);
      o.start(t); o.stop(t + dur);
    });
  }

  gate(key, ms) {
    const t = this.now();
    if (t - (this.lastAt[key] ?? -Infinity) < ms / 1000) return false;
    this.lastAt[key] = t;
    return true;
  }

  sfx(name) {
    if (!this.ready) return;
    if (save.data.settings.sfx <= 0) return;
    const t = this.now();
    switch (name) {
      case 'hover': if (this.gate('hover', 70)) this.noiseBurst(0.05, 0.02, 'highpass', 3200, 2400, 0.8); break;
      case 'click':
        if (!this.gate('click', 40)) break;
        this.noiseBurst(0.05, 0.07, 'bandpass', 1900, 900, 1.2);
        this.pluck(this.midi(74), 0.1, true);
        break;
      case 'draw': this.noiseBurst(0.13, 0.05, 'highpass', 2600, 5200, 0.7); break;
      case 'play':
        this.noiseBurst(0.09, 0.08, 'bandpass', 2300, 1100, 1.1);
        this.pluck(this.midi(69), 0.14, true);
        break;
      case 'hit': {
        if (!this.gate('hit', 28)) break;
        const r = 0.9 + Math.random() * 0.25; // 每次命中音高略有不同
        this.noiseBurst(0.07, 0.13, 'lowpass', 1200, 280, 0.8, r);
        this.drum(170 * r, 0.16, 0.12);
        break;
      }
      case 'heavy':
        // 重击：低频播袋 + 金属余音
        this.drum(95, 0.3, 0.4);
        this.noiseBurst(0.22, 0.14, 'lowpass', 900, 160, 0.7);
        this.bell(this.midi(50), 0.05, 0.6);
        break;
      case 'clang':
        // 被护甲挡下：金属短鸣 + 高频擦碰
        this.bell(this.midi(86), 0.07, 0.35);
        this.noiseBurst(0.1, 0.07, 'highpass', 3200, 1800, 1.1);
        break;
      case 'slash':
        // 挥击破空：带宽速降的嗅声
        this.noiseBurst(0.12, 0.09, 'bandpass', 3400, 850, 1.4);
        break;
      case 'energy':
        if (!this.gate('energy', 90)) break;
        this.bell(this.midi(83), 0.04, 0.45);
        break;
      case 'hurt':
        this.drum(110, 0.3, 0.36);
        this.noiseBurst(0.2, 0.12, 'lowpass', 700, 200, 0.7);
        break;
      case 'block':
        if (!this.gate('block', 45)) break;
        this.pluck(this.midi(76), 0.09, true);
        this.noiseBurst(0.07, 0.05, 'highpass', 2400, 1600, 0.9);
        break;
      case 'heal':
        this.pluck(this.midi(71), 0.11, true);
        this.pluck(this.midi(78), 0.08, true, this.now() + 0.08);
        break;
      case 'buff': this.pluck(this.midi(76), 0.12, true); break;
      case 'debuff':
        this.pluck(this.midi(55), 0.14, false);
        this.noiseBurst(0.18, 0.05, 'lowpass', 500, 200, 0.8);
        break;
      case 'poison': this.noiseBurst(0.22, 0.06, 'lowpass', 700, 300, 0.9); break;
      case 'burn': this.noiseBurst(0.3, 0.08, 'bandpass', 1400, 400, 0.7); break;
      case 'kill':
        this.drum(100, 0.32, 0.6);
        this.noiseBurst(0.45, 0.12, 'lowpass', 1500, 120, 0.6);
        break;
      case 'coin':
        this.pluck(this.midi(80), 0.09, true);
        this.pluck(this.midi(85), 0.07, true, this.now() + 0.06);
        break;
      case 'relic':
        this.bell(this.midi(74), 0.05, 1.0);
        this.pluck(this.midi(81), 0.09, true, this.now() + 0.05);
        break;
      case 'bossWarn':
        if (!this.gate('bossWarn', 700)) break;
        this.drum(72, 0.18, 0.65);
        this.bell(this.midi(45), 0.08, 1.1);
        break;
      case 'turn': this.bell(this.midi(57), 0.07, 1.1); break;
      case 'enemyTurn': this.drum(90, 0.2, 0.5); break;
      case 'win': [0, 4, 7, 9, 12].forEach((n, i) => this.pluck(this.midi(62 + n), 0.14, true, this.now() + i * 0.1)); break;
      case 'lose': [7, 4, 2, 0].forEach((n, i) => this.pluck(this.midi(50 + n), 0.16, false, this.now() + i * 0.2)); break;
      case 'page': this.noiseBurst(0.3, 0.07, 'highpass', 2200, 1000, 0.6); break;
      case 'potion':
        this.pluck(this.midi(72), 0.12, true);
        this.noiseBurst(0.18, 0.05, 'bandpass', 900, 2200, 0.9);
        this.bell(this.midi(60), 0.06, 0.7);
        break;
      case 'surge':
        [0, 2, 4, 7].forEach((n, i) => this.pluck(this.midi(62 + n), 0.15, true, t + i * 0.055));
        this.bell(this.midi(50), 0.11, 1.5);
        this.noiseBurst(0.4, 0.06, 'highpass', 3000, 6200, 0.55);
        break;
      default: break;
    }
  }

  /* ---------- BGM ---------- */
  playBgm(scene, key) {
    if (!scene || !scene.sound) return;
    if (this.bgmKey === key && (this.bgm?.isPlaying || this.procTimer)) {
      // 前一个场景的淡入可能已随场景停掉，保留播放进度并恢复目标音量。
      this.setVolumes();
      return;
    }
    this.stopBgm();
    this.bgmKey = key;
    const vol = save.data.settings.music;
    if (scene.cache.audio.exists(key)) {
      try {
        this.bgm = scene.sound.add(key, { loop: true, volume: 0 });
        this.bgm.play();
        this.bgmFade = scene.tweens.add({ targets: this.bgm, volume: vol, duration: 1200 });
      } catch (e) { /* ignore */ }
    } else {
      this.startProcedural(key);
    }
  }

  cancelBgmFade() {
    if (!this.bgmFade) return;
    this.bgmFade.stop();
    this.bgmFade.remove?.();
    this.bgmFade = null;
  }

  stopBgm() {
    this.cancelBgmFade();
    if (this.bgm) {
      try { this.bgm.stop(); this.bgm.destroy(); } catch (e) { /* ignore */ }
      this.bgm = null;
    }
    this.stopProcedural();
    this.bgmKey = null;
  }

  /* 无音频资源时的程序化替代 */
  startProcedural(mode) {
    this.stopProcedural();
    this.procMode = mode;
    if (!this.ready) return;
    this.procStep = 0;
    this.procNext = this.now() + 0.2;
    const battle = mode.indexOf('battle') >= 0 || mode.indexOf('boss') >= 0;
    const bpm = mode.indexOf('boss') >= 0 ? 76 : (battle ? 64 : 52);
    const beatSeconds = 60 / bpm / 4;
    this.procTimer = setInterval(() => {
      if (!this.ready) return;
      const now = this.now();
      // 页面节流后跳过已错过的拍点，不能把过去几十秒的声音挤在现在播放。
      if (this.procNext < now) {
        const missed = Math.ceil((now - this.procNext) / beatSeconds);
        this.procStep += missed;
        this.procNext += missed * beatSeconds;
      }
      const ahead = now + 0.3;
      let guard = 0;
      while (this.procNext < ahead && guard++ < 12) {
        const step = this.procStep;
        const chord = [[0, 4, 7], [-2, 2, 5], [-5, 0, 4], [0, 4, 9]][Math.floor(step / 16) % 4];
        if (step % 8 === 0) this.pluck(this.midi(38 + chord[0]), 0.16, false, this.procNext, this.musicBus);
        if (step % 4 === 0) this.pluck(this.midi(62 + chord[(step / 4) % chord.length | 0]), 0.06, true, this.procNext, this.musicBus);
        if (battle && step % 8 === 4) this.drum(120, 0.05, 0.16, this.procNext, this.musicBus);
        this.procNext += beatSeconds;
        this.procStep++;
      }
    }, 80);
  }

  stopProcedural() {
    this.procMode = null;
    if (this.procTimer) {
      clearInterval(this.procTimer);
      this.procTimer = null;
    }
  }

  setVolumes() {
    const settings = save.data.settings;
    if (this.ready) {
      this.sfxBus.gain.value = settings.sfx;
      this.musicBus.gain.value = settings.music;
    }
    // Phaser 的 MP3 与程序音效使用不同音频通道，不能被 ready 门槛挡住。
    // 同时取消旧的淡入目标，避免稍后恢复旧音量（包括把静音重新打开）。
    this.cancelBgmFade();
    if (this.bgm) this.bgm.volume = settings.music;
  }
}

export const audio = new AudioManager();
