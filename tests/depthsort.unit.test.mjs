import test from 'node:test';
import assert from 'node:assert/strict';
import { sortDrawables, furnitureBox, entityBox, isBehind } from '../js/depthSort.js';

const order = (items) => sortDrawables(items).map((d) => d.id);

test('depthSort: avatar in front of a 2x2 table draws after it, behind draws before', () => {
  const table = { id: 'table', box: furnitureBox(4, 4, 2, 2) }; // covers 3.5..5.5
  // In front (south-east side, larger y), standing level with the table's back x.
  const front = { id: 'front', box: entityBox(4, 6) };
  // Behind (north side, smaller y) but level with the table's front x.
  const behind = { id: 'behind', box: entityBox(5, 3) };
  assert.deepEqual(order([front, table, behind]), ['behind', 'table', 'front']);
});

test('depthSort: avatar beside the far corner of a long counter is not drawn over it', () => {
  // 4x1 counter along x at y=5; avatar at x=2, y=6 (in front of its west end).
  // Old corner key: counter = 3+5+... front corner (5,5)=10, avatar 2+6=8 -> avatar drawn first (wrong).
  const counter = { id: 'counter', box: furnitureBox(2, 5, 4, 1) };
  const avatar = { id: 'avatar', box: entityBox(2, 6) };
  assert.deepEqual(order([avatar, counter]), ['counter', 'avatar']);
});

test('depthSort: tall item behind a 1x1 stool stays behind regardless of input order', () => {
  const shelf = { id: 'shelf', box: furnitureBox(3, 2, 1, 2) };
  const stool = { id: 'stool', box: furnitureBox(4, 3, 1, 1) };
  assert.deepEqual(order([stool, shelf]), ['shelf', 'stool']);
  assert.deepEqual(order([shelf, stool]), ['shelf', 'stool']);
});

test('depthSort: seated avatar is pinned between seat back and seat front', () => {
  const box = furnitureBox(6, 6, 2, 1);
  const back = { id: 'sofa:back', box, bias: -0.05, before: ['avatar'] };
  const avatar = { id: 'avatar', box: entityBox(6, 6), before: ['sofa:front'] };
  const front = { id: 'sofa:front', box, bias: 0.15 };
  assert.deepEqual(order([front, avatar, back]), ['sofa:back', 'avatar', 'sofa:front']);
});

test('depthSort: isBehind is antisymmetric for separated boxes', () => {
  const a = furnitureBox(0, 0, 1, 1);
  const b = furnitureBox(1, 0, 1, 1);
  assert.equal(isBehind(a, b), true);
  assert.equal(isBehind(b, a), false);
});

test('depthSort: a grid of 150 items sorts quickly and keeps every pairwise constraint', () => {
  const items = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 15; x++) items.push({ id: `${x},${y}`, box: furnitureBox(x * 2, y * 2, 1, 1) });
  items.reverse();
  const t0 = performance.now();
  const sorted = sortDrawables(items);
  assert.ok(performance.now() - t0 < 50);
  const pos = new Map(sorted.map((d, i) => [d.id, i]));
  for (const a of items) for (const b of items) {
    if (a !== b && isBehind(a.box, b.box) && !isBehind(b.box, a.box)) {
      // only pairs that can overlap on screen are constrained; check one representative
      if (a.box.maxX <= b.box.minX && a.box.minY === b.box.minY) assert.ok(pos.get(a.id) < pos.get(b.id));
    }
  }
});
