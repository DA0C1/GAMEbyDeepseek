import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { IMAGES, AUDIO, imagePath, audioPath } from '../src/core/assets.js';
import { FOES, HABITATS } from '../src/data/enemies.js';
import { EVENTS } from '../src/data/events.js';

const root = new URL('../', import.meta.url);

test('every preload manifest entry has a nonempty local file of the expected format', () => {
  assert.equal(new Set(IMAGES).size, IMAGES.length, 'image keys are unique');
  assert.equal(new Set(AUDIO).size, AUDIO.length, 'music keys are unique');
  for (const key of IMAGES) {
    const bytes = readFileSync(new URL(imagePath(key), root));
    assert.ok(bytes.length > 12, key);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${key}: WebP container`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${key}: WebP signature`);
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${key}: complete container`);
  }
  for (const key of AUDIO) {
    const bytes = readFileSync(new URL(audioPath(key), root));
    assert.ok(bytes.length > 10, key);
    const hasTag = bytes.toString('ascii', 0, 3) === 'ID3';
    const hasFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert.ok(hasTag || hasFrame, `${key}: MP3 header`);
  }
});

test('all foe phases, event art, habitats and scene music are in the preload manifest', () => {
  const images = new Set(IMAGES), audio = new Set(AUDIO);
  for (const [id, def] of Object.entries(FOES)) {
    assert.ok(images.has(def.img), `${id}: configured art`);
    assert.ok(images.has(`foe_${id}`), `${id}: battle texture`);
    assert.ok(HABITATS[def.hab], `${id}: known habitat`);
    if (def.phases?.length) assert.ok(images.has(`foe_${id}_2`), `${id}: phase-two texture`);
  }
  for (const event of EVENTS) assert.ok(images.has(`ev_${event.id}`), `${event.id}: event art`);
  for (const id of Object.keys(HABITATS)) assert.ok(images.has(`hab_${id}`), `${id}: habitat background`);
  for (const key of ['guardian', 'bg_title', 'bg_shop', 'bg_rest', 'bg_act1', 'bg_act2', 'bg_act3']) {
    assert.ok(images.has(key), key);
  }
  for (const key of ['bgm_title', 'bgm_map', 'bgm_battle', 'bgm_boss', 'bgm_ending']) {
    assert.ok(audio.has(key), key);
  }
});
