// 普通游戏沿用系统随机数；AI 测试页可独立固定规则随机数，美术不消耗此序列。
let initialSeed = null;
let state = 0;

export function setSeed(seed = null) {
  initialSeed = seed === null ? null : Number(seed) >>> 0;
  state = initialSeed ?? 0;
}

export function getSeed() { return initialSeed; }

export function random() {
  if (initialSeed === null) return Math.random();
  state = (state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ (state >>> 15), state | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

// 同步预演可以读取当前规则序列，但不能推进真实序列或调用系统随机数。
// 普通模式使用固定的代表性样本；涉及随机命中的预演必须标明不确定。
export function withIsolatedRandom(fn) {
  const seedBefore = initialSeed;
  const stateBefore = state;
  if (initialSeed === null) { initialSeed = 0; state = 0; }
  try { return fn(); }
  finally { initialSeed = seedBefore; state = stateBefore; }
}
