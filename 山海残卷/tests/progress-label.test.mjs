import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/core/run.js';

test('saved depth is displayed as its encoded act and column rather than fictitious total floors', () => {
  for (const [depth, label] of [
    [0, '尚未入卷'], [10, '第 1 卷 · 第 1 层'], [17, '第 1 卷 · 第 8 层'],
    [20, '第 2 卷 · 第 1 层'], [27, '第 2 卷 · 第 8 层'],
    [30, '第 3 卷 · 第 1 层'], [37, '第 3 卷 · 第 8 层']
  ]) assert.equal(run.depthLabel(depth), label);
  assert.equal(run.depthLabel(NaN), '尚未入卷');
  assert.equal(run.depthLabel(-1), '尚未入卷');
  assert.equal(run.depthLabel(17.4), '第 1 卷 · 第 8 层');
});
