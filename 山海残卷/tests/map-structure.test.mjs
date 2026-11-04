import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setSeed } from '../src/core/random.js';
import { save } from '../src/core/save.js';
import { FOES } from '../src/data/enemies.js';
import { ACTS, NODE_LABEL, generateMap, availableNodes, genEncounter } from '../src/systems/mapgen.js';

const SEEDS = 100;

function setup(t) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: () => null, setItem() {} }
  });
  save.load();
  t.after(() => {
    setSeed(null);
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });
}

test('100 seeds across all acts produce fully reachable maps with valid paths and guarantees', t => {
  setup(t);
  for (let seed = 0; seed < SEEDS; seed++) {
    for (const act of ACTS) {
      setSeed(seed);
      const map = generateMap(act.index);
      const context = `seed ${seed}, act ${act.index}`;
      assert.equal(map.act, act, context);
      assert.equal(map.cols.length, act.cols, context);
      assert.deepEqual(map.nodes, map.cols.flat(), context);
      assert.equal(new Set(map.nodes.map(n => n.id)).size, map.nodes.length, context);
      assert.equal(map.cols[0].length, 1, context);
      assert.equal(map.cols[0][0].type, 'battle', context);
      assert.deepEqual(availableNodes(map), map.cols[0], context);

      let reachable = new Set(map.cols[0]);
      map.cols.forEach((column, col) => {
        const atColumn = `${context}, column ${col}`;
        assert.equal(reachable.size, column.length, atColumn);
        assert.ok(column.every(node => reachable.has(node)), atColumn);
        const nextReachable = new Set();
        column.forEach((node, row) => {
          const atNode = `${atColumn}, row ${row}`;
          assert.equal(node.col, col, atNode);
          assert.equal(node.row, row, atNode);
          assert.equal(node.count, column.length, atNode);
          assert.ok(Object.hasOwn(NODE_LABEL, node.type), atNode);
          assert.equal(node.cleared, false, atNode);
          assert.equal(new Set(node.links).size, node.links.length, atNode);
          if (col < map.cols.length - 1) {
            assert.ok(node.links.length > 0, `nonterminal node has an exit: ${atNode}`);
            for (const link of node.links) {
              assert.ok(Number.isInteger(link) && link >= 0 && link < map.cols[col + 1].length, atNode);
              nextReachable.add(map.cols[col + 1][link]);
            }
          } else {
            assert.equal(node.type, 'boss', atNode);
            assert.deepEqual(node.links, [], atNode);
          }
          map.cur.node = node;
          assert.deepEqual(availableNodes(map), node.links.map(link => map.cols[col + 1][link]), atNode);
        });
        reachable = nextReachable;
      });

      assert.equal(map.cols.at(-1).length, 1, context);
      assert.equal(map.nodes.filter(n => n.type === 'boss').length, 1, context);
      assert.deepEqual(map.cols.at(-2).map(n => n.type).sort(), ['rest', 'shop'], context);
      const middle = map.nodes.filter(n => n.col > 0 && n.col < map.cols.length - 2);
      for (const type of ['elite', 'rest', 'shop', 'page']) {
        assert.ok(middle.some(n => n.type === type), `guaranteed ${type}: ${context}`);
      }
    }
  }
});

test('seeded encounters at every act, column and combat type contain valid finite enemy specs', t => {
  setup(t);
  for (let seed = 0; seed < SEEDS; seed++) {
    for (const act of ACTS) {
      setSeed(seed);
      for (let col = 0; col < act.cols; col++) {
        for (const type of ['battle', 'elite', 'boss']) {
          const context = `seed ${seed}, act ${act.index}, column ${col}, ${type}`;
          const encounter = genEncounter(act, type, col);
          assert.ok(encounter.length >= 1 && encounter.length <= 3, context);
          for (const spec of encounter) {
            assert.ok(Object.hasOwn(FOES, spec.id), `${context}: ${spec.id}`);
            assert.ok(Number.isFinite(spec.scale) && spec.scale > 0, context);
            if (spec.dmgMul !== undefined) {
              assert.ok(Number.isFinite(spec.dmgMul) && spec.dmgMul > 0, context);
            }
          }
          if (type === 'boss') assert.deepEqual(encounter, [{ id: act.boss, scale: 1 }], context);
          if (type === 'elite') assert.ok(act.elite.includes(encounter[0].id), context);
        }
      }
    }
  }
});
