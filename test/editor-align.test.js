import { test } from 'node:test';
import assert from 'node:assert/strict';

// computeAlign 은 DOM 을 건드리지 않는 순수 함수 (정렬/분배 좌표 계산).
const { computeAlign } = await import('../src/web/js/editor.js');

const boxes = () => [
  { x: 10, y: 10, w: 100, h: 20 },
  { x: 200, y: 60, w: 40, h: 40 },
  { x: 90, y: 200, w: 60, h: 10 },
];

test('left / right / hcenter 정렬', () => {
  const b = boxes();
  assert.deepEqual(computeAlign(b, 'left').map((p) => p.x), [10, 10, 10]);
  // maxR = 240 → x = 240 - w
  assert.deepEqual(computeAlign(b, 'right').map((p) => p.x), [140, 200, 180]);
  // 중앙 = (10 + 240)/2 = 125 → x = round(125 - w/2)
  assert.deepEqual(computeAlign(b, 'hcenter').map((p) => p.x), [75, 105, 95]);
});

test('top / bottom / vcenter 정렬', () => {
  const b = boxes();
  assert.deepEqual(computeAlign(b, 'top').map((p) => p.y), [10, 10, 10]);
  // maxB = 210 → y = 210 - h
  assert.deepEqual(computeAlign(b, 'bottom').map((p) => p.y), [190, 170, 200]);
  // 중앙 = (10 + 210)/2 = 110 → y = round(110 - h/2)
  assert.deepEqual(computeAlign(b, 'vcenter').map((p) => p.y), [100, 90, 105]);
});

test('hdist — 가운데 요소만 재배치, 양끝 고정', () => {
  const b = boxes();
  const out = computeAlign(b, 'hdist');
  const cx = b.map((s, i) => out[i].x + s.w / 2).sort((a, z) => a - z);
  // 균등 간격
  assert.equal(Math.round(cx[1] - cx[0]), Math.round(cx[2] - cx[1]));
});

test('vdist — 3개 미만이면 그대로', () => {
  const b = boxes().slice(0, 2);
  assert.deepEqual(computeAlign(b, 'vdist'), b.map((s) => ({ x: s.x, y: s.y })));
});

test('요소 1개 이하면 좌표 변화 없음', () => {
  assert.deepEqual(computeAlign([{ x: 5, y: 5, w: 10, h: 10 }], 'left'), [{ x: 5, y: 5 }]);
  assert.deepEqual(computeAlign([], 'top'), []);
});

test('입력 배열을 변형하지 않는다', () => {
  const b = boxes();
  const snap = JSON.stringify(b);
  computeAlign(b, 'right');
  assert.equal(JSON.stringify(b), snap);
});
