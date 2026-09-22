// 2026-09-22 전체 점검에서 고친 버그들의 회귀 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readingOrder } from '../src/web/js/reading-order.js';
import { compileDeterministic } from '../src/pipeline/deterministic.js';

const { normalize } = await import('../src/web/js/editor.js');

test('normalize — 요소를 지운 뒤 저장한 연결(linksTo)이 원래 대상을 가리킨다', () => {
  // 1번 요소를 지운 뒤의 저장본: id 가 s2·s3 로 남아 있고, 버튼(s3)이 표(s2)를 가리킨다
  const out = normalize([
    { id: 's2', type: 'list', x: 0, y: 200, w: 600, h: 150 },
    { id: 's3', type: 'button', x: 0, y: 100, w: 85, h: 20, linksTo: ['s2'] },
  ]);
  assert.deepEqual(out.map((s) => s.id), [1, 2]);
  assert.deepEqual(out[1].links, [1]); // 예전엔 [2] — 버튼 자기 자신을 가리켰다
});

test('normalize — 내부 형식(links, 숫자 id)도 순서가 바뀐 뒤 올바로 옮긴다', () => {
  const out = normalize([
    { id: 7, t: 'button', x: 0, y: 0, w: 10, h: 10, links: [3] },
    { id: 3, t: 'list', x: 0, y: 50, w: 10, h: 10 },
  ]);
  assert.deepEqual(out[0].links, [2]);
});

test('normalize — id 없는 예전 데이터는 s+순번 규칙으로, 알 수 없는 타입·깨진 항목은 버린다', () => {
  const out = normalize([
    null, 'x', { type: 'nope', x: 0, y: 0, w: 1, h: 1 },
    { type: 'list', x: '5', y: 'bad', w: 100, h: 50 },
    { type: 'button', x: 0, y: 0, w: 10, h: 10, linksTo: ['s1', 's9'] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].x, 5);
  assert.equal(out[0].y, 0);
  assert.deepEqual(out[1].links, [1]);
});

test('readingOrder — 줄 묶음으로 정렬해 순서가 요소 배치에 흔들리지 않는다', () => {
  // A~B, B~C 는 허용 오차 안이지만 A~C 는 벗어난 경우 — 예전 비교 함수는 추이적이지 않았다
  const shapes = [
    { id: 'C', x: 50, y: 30 }, { id: 'A', x: 100, y: 0 }, { id: 'B', x: 0, y: 12 },
    { id: 'D', x: 0, y: 100 },
  ];
  const ids = readingOrder(shapes).map((s) => s.id);
  assert.deepEqual(ids, ['B', 'A', 'C', 'D']);
  // 입력 순서를 바꿔도 같은 결과
  assert.deepEqual(readingOrder([...shapes].reverse()).map((s) => s.id), ids);
});

test('변환기 — 화면 이름에 "--" 가 있어도 XML 주석이 깨지지 않는다', () => {
  const { websquareXml } = compileDeterministic({
    screenName: '고객--조회 -->',
    canvas: { w: 960, h: 600 },
    shapes: [{ type: 'input', x: 0, y: 0, w: 100, h: 20 }],
  });
  const comment = websquareXml.match(/^<!--([\s\S]*?)-->/)[1];
  assert.ok(!comment.includes('--'), comment);
});
