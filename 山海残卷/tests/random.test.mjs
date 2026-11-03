import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random, setSeed } from '../src/core/random.js';
import { generateMap, genEncounter } from '../src/systems/mapgen.js';
import { save } from '../src/core/save.js';

save.load();

test('fixed rule seed reproduces map and encounters despite visual random calls', () => {
  function sample() {
    const map = generateMap(1);
    const encounter = genEncounter(map.act, 'battle', 3);
    return { map, encounter };
  }
  try {
    setSeed(20261103);
    const first = sample();
    for (let i = 0; i < 1000; i++) Math.random();
    setSeed(20261103);
    assert.deepEqual(sample(), first);
    setSeed(42);
    assert.notDeepEqual(sample(), first);
  } finally { setSeed(null); }
});

test('ordinary mode delegates to host randomness and zero is a valid seed', () => {
  const hostRandom = Math.random;
  try {
    setSeed(null);
    Math.random = () => 0.25;
    assert.equal(random(), 0.25);
    setSeed(0);
    const first = random();
    setSeed(0);
    assert.equal(random(), first);
    assert.ok(first >= 0 && first < 1);
  } finally { Math.random = hostRandom; setSeed(null); }
});
